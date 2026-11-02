import type { SupabaseClient } from "@supabase/supabase-js";
import type { Profile } from "./types";
import { fitCheck, fitSignature, KEPT, type FitReason } from "./fit";
import { quickScore } from "./quick-score";
import { patchPreferences } from "./profile";

/** Postes de la recherche validée (page Recherche) : le filtre ne masque pas ce qui ressemble à l'un d'eux. */
export const criteriaRoles = (p: Profile): string[] => p.preferences?.criteria?.roles ?? [];

const chunks = <T,>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

/**
 * Revoit les offres « À trier » au regard du profil et de la recherche du moment :
 * celles qui ne sont pas pour toi passent en « Masquées » (status filtered), celles qui redeviennent compatibles reviennent à trier,
 * et le drapeau « trop senior » est recalculé avec ta limite d'expérience actuelle.
 * Ne tourne que si ce qui décide du filtre a changé depuis le dernier passage (empreinte `fit_sig`), ou avec force.
 * Les offres que tu as toi-même remises dans ta liste (reject_reason « garde ») ne sont jamais re-masquées.
 */
export async function ensureFit(supabase: SupabaseClient, userId: string, profile: Profile, force = false): Promise<{ checked: number; hidden: number; shown: number } | null> {
  const roles = criteriaRoles(profile);
  const sig = fitSignature(profile, roles);
  if (!force && profile.preferences?.fit_sig === sig) return null;

  const hide = new Map<FitReason, string[]>();
  const show: string[] = [];
  const seniorOn: string[] = [];
  const seniorOff: string[] = [];
  let checked = 0;
  for (let from = 0; from < 3000; from += 400) {
    const { data, error } = await supabase
      .from("recommendations").select("id, title, company, snippet, location, status, reject_reason, senior")
      .eq("user_id", userId).in("status", ["new", "filtered"]).order("created_at", { ascending: true }).range(from, from + 399);
    if (error) return null; // on réessaiera au prochain passage : la signature n'est pas enregistrée
    for (const r of data ?? []) {
      if (r.reject_reason === KEPT) continue;
      checked++;
      const text = `${r.snippet ?? ""} ${r.location ?? ""}`;
      const fit = fitCheck(profile, { title: r.title ?? "", text }, { roles });
      if (r.status === "new") {
        const q = quickScore(profile, r.title ?? "", text, null, r.company ?? "");
        if (q.senior !== r.senior) (q.senior ? seniorOn : seniorOff).push(r.id);
        if (!fit.ok) hide.set(fit.reason, [...(hide.get(fit.reason) ?? []), r.id]);
      } else if (fit.ok) {
        show.push(r.id);
      } else if (r.reject_reason !== fit.reason) {
        hide.set(fit.reason, [...(hide.get(fit.reason) ?? []), r.id]);
      }
    }
    if ((data?.length ?? 0) < 400) break;
  }

  const ops: PromiseLike<unknown>[] = [];
  for (const [reason, ids] of hide) for (const c of chunks(ids, 100)) ops.push(supabase.from("recommendations").update({ status: "filtered", reject_reason: reason }).eq("user_id", userId).in("id", c));
  for (const c of chunks(show, 100)) ops.push(supabase.from("recommendations").update({ status: "new", reject_reason: null }).eq("user_id", userId).in("id", c));
  for (const c of chunks(seniorOn, 100)) ops.push(supabase.from("recommendations").update({ senior: true }).eq("user_id", userId).in("id", c));
  for (const c of chunks(seniorOff, 100)) ops.push(supabase.from("recommendations").update({ senior: false }).eq("user_id", userId).in("id", c));
  await Promise.all(ops);
  await patchPreferences(supabase, userId, { fit_sig: sig });
  return { checked, hidden: [...hide.values()].reduce((n, x) => n + x.length, 0), shown: show.length };
}
