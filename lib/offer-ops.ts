import type { SupabaseClient } from "@supabase/supabase-js";
import { extractOffer, analyzeOffer } from "./ai";
import { getProfile } from "./profile";
import { addDays, today } from "./format";
import { spendAi, AI_COST } from "./quota";
import { pickApplication, UNSENT } from "./app-pick";
import { fetchAll } from "./paged";

type User = { id: string; email?: string | null };

/** Analyse un texte d'offre et l'enregistre. */
export async function createAnalyzedOffer(
  supabase: SupabaseClient,
  user: User,
  input: { text: string; url?: string | null; source?: string | null; external_id?: string | null; decision?: string | null }
) {
  await spendAi(supabase, { email: user.email ?? null }, AI_COST.offer);
  const profile = await getProfile(supabase, user);
  const extracted = await extractOffer(input.text, input.url ?? undefined);
  const analysis = await analyzeOffer(profile, extracted);
  const { data, error } = await supabase
    .from("offers")
    .insert({
      user_id: user.id, url: input.url ?? null, source: input.source ?? null, external_id: input.external_id ?? null,
      title: extracted.title, company: extracted.company, location: extracted.location, contract: extracted.contract,
      raw_text: input.text, extracted, analysis, score: analysis.score, decision: input.decision ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

/** Crée (ou retrouve) la candidature d'une offre dans le suivi. */
export async function ensureApplication(
  supabase: SupabaseClient,
  user: User,
  src: { offer_id?: string | null; company: string; title: string; url?: string | null; location?: string | null; contract?: string | null; channel?: string | null; score?: number | null; cv_variant?: string | null },
  status = "a_postuler"
) {
  if (src.offer_id) {
    const { data: rows } = await supabase.from("applications").select("id, status, applied_at").eq("offer_id", src.offer_id).order("created_at", { ascending: true }).limit(20);
    const existing = pickApplication(rows as { id: string; status: string; applied_at: string | null }[] | null);
    if (existing) {
      if (status !== existing.status && status === "postule") {
        await supabase.from("applications").update({ status, ...(existing.applied_at ? {} : { applied_at: today(), next_action_at: addDays(7) }) }).eq("id", existing.id);
      }
      return existing.id as string;
    }
  }
  const { data, error } = await supabase
    .from("applications")
    .insert({
      user_id: user.id, offer_id: src.offer_id ?? null, company: src.company || "Entreprise ?", title: src.title || "Poste ?",
      url: src.url ?? null, location: src.location ?? null, contract: src.contract ?? null, channel: src.channel ?? null,
      score: src.score ?? null, cv_variant: src.cv_variant ?? null, status,
      applied_at: status === "postule" ? today() : null,
      next_action_at: status === "postule" ? addDays(7) : null,
    })
    .select("id")
    .single();
  if (error) throw error;
  if (src.offer_id) await supabase.from("documents").update({ application_id: data.id }).eq("offer_id", src.offer_id).is("application_id", null);
  return data.id as string;
}

/** Annonce retirée : la recommandation passe dans les Écartées, motif « Offre plus disponible » (jamais si elle est déjà acceptée). */
export async function markRecoGone(supabase: SupabaseClient, recoId: string) {
  await supabase
    .from("recommendations")
    .update({ status: "rejected", reject_reason: "expiree", decided_at: new Date().toISOString() })
    .eq("id", recoId)
    .in("status", ["new", "analyzed"]);
}

type AppSrc = { offer_id?: string | null; url?: string | null; title?: string | null; company?: string | null };
type AppRow = { id: string; status: string; applied_at: string | null };

/** Candidature déjà dans le suivi pour cette offre (par l'offre, l'adresse, ou à défaut le couple poste + entreprise). */
export async function findApplication(supabase: SupabaseClient, src: AppSrc): Promise<AppRow | null> {
  const cols = "id, status, applied_at";
  const q = supabase.from("applications").select(cols);
  if (src.offer_id) {
    const { data } = await q.eq("offer_id", src.offer_id).order("created_at", { ascending: true }).limit(20);
    const best = pickApplication(data as AppRow[] | null);
    if (best) return best;
  }
  if (src.url) {
    const { data } = await supabase.from("applications").select(cols).eq("url", src.url).limit(1).maybeSingle();
    if (data) return data as AppRow;
  }
  if (!src.offer_id && !src.url && src.title && src.company) {
    const { data } = await supabase.from("applications").select(cols).eq("title", src.title).eq("company", src.company).limit(1).maybeSingle();
    if (data) return data as AppRow;
  }
  return null;
}

/** Statut du suivi quand tu ne postules pas : « Offre plus disponible » si c'est la raison, sinon « Abandonné ». */
export const giveUpStatus = (reason?: string | null) => (reason === "expiree" ? "expiree" : "abandonne");

/**
 * « Je ne postule pas » : l'offre est rangée dans le suivi (Abandonné, ou Offre plus disponible), jamais comptée comme une candidature.
 * Une candidature déjà envoyée n'est pas touchée.
 */
export async function ensureGivenUp(
  supabase: SupabaseClient,
  user: User,
  src: { offer_id?: string | null; company?: string | null; title?: string | null; url?: string | null; location?: string | null; contract?: string | null; channel?: string | null; score?: number | null },
  reason?: string | null
): Promise<string> {
  const status = giveUpStatus(reason);
  const existing = await findApplication(supabase, src);
  if (existing) {
    if (["a_postuler", "abandonne", "expiree"].includes(existing.status) && !existing.applied_at) {
      await supabase.from("applications").update({ status, next_action_at: null }).eq("id", existing.id);
    }
    return existing.id;
  }
  const { data, error } = await supabase
    .from("applications")
    .insert({
      user_id: user.id, offer_id: src.offer_id ?? null, company: src.company || "Entreprise ?", title: src.title || "Poste ?",
      url: src.url ?? null, location: src.location ?? null, contract: src.contract ?? null, channel: src.channel ?? null,
      score: src.score ?? null, status, applied_at: null, next_action_at: null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

/**
 * Annule « Je ne postule pas » : la ligne d'Abandonné créée par le tri disparaît, ou repasse en « À postuler »
 * quand l'offre y était avant. Une candidature réellement envoyée n'est jamais touchée.
 */
export async function undoGivenUp(supabase: SupabaseClient, src: AppSrc, backTo?: string | null) {
  const app = await findApplication(supabase, src);
  if (!app || !["abandonne", "expiree"].includes(app.status) || app.applied_at) return;
  if (backTo === "a_postuler") await supabase.from("applications").update({ status: "a_postuler" }).eq("id", app.id);
  else await supabase.from("applications").delete().eq("id", app.id);
}

/**
 * Doublons dans Suivi : plusieurs lignes pour une même offre (double clic, ancienne version).
 * On garde la plus avancée et on retire les lignes en trop, mais seulement celles qui n'ont rien : pas envoyées,
 * sans note, contact ni salaire saisis. Une candidature envoyée ou annotée n'est jamais supprimée.
 * Renvoie le nombre de lignes retirées.
 */
export async function mergeDuplicateApplications(supabase: SupabaseClient, userId: string): Promise<number> {
  // toutes les lignes (un `limit(3000)` serait coupé à 1 000 par Supabase sans rien dire : les doublons au-delà ne seraient jamais vus)
  const { data } = await fetchAll((a, b) =>
    supabase
      .from("applications")
      .select("id, offer_id, status, applied_at, notes, contact, salary")
      .eq("user_id", userId)
      .not("offer_id", "is", null)
      .order("created_at", { ascending: true })
      .order("id")
      .range(a, b)
  );
  type Row = { id: string; offer_id: string; status: string; applied_at: string | null; notes: string | null; contact: string | null; salary: string | null };
  const groups = new Map<string, Row[]>();
  for (const r of (data ?? []) as Row[]) groups.set(r.offer_id, [...(groups.get(r.offer_id) ?? []), r]);
  const drop: string[] = [];
  for (const rows of groups.values()) {
    if (rows.length < 2) continue;
    const keep = pickApplication(rows)!;
    for (const r of rows) {
      const empty = !r.applied_at && !(r.notes ?? "").trim() && !(r.contact ?? "").trim() && !(r.salary ?? "").trim();
      if (r.id !== keep.id && UNSENT.includes(r.status) && empty) drop.push(r.id);
    }
  }
  for (let i = 0; i < drop.length; i += 100) await supabase.from("applications").delete().eq("user_id", userId).in("id", drop.slice(i, i + 100));
  return drop.length;
}
