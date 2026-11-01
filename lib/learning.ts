import type { SupabaseClient } from "@supabase/supabase-js";
import { words } from "./quick-score";
import { NEUTRAL_REASONS } from "./types";

/**
 * Ce que l'app apprend des offres acceptées et écartées.
 * Volontairement simple et lisible : la page Recommandées affiche ces règles.
 */
export type Learning = {
  penaltyWords: string[];
  boostWords: string[];
  blockedCompanies: string[];
  reasons: Record<string, number>;
  decided: number;
};

const STOP = new Set(["h/f", "f/h", "les", "des", "and", "the", "pour", "avec", "une", "dans", "sur", "cdi", "cdd", "stage", "alternance"]);

export async function computeLearning(supabase: SupabaseClient, userId: string): Promise<Learning> {
  const [{ data: recos }, { data: offers }] = await Promise.all([
    supabase.from("recommendations").select("title, company, status, reject_reason").eq("user_id", userId).in("status", ["accepted", "rejected"]),
    supabase.from("offers").select("title, company, decision, reject_reason").eq("user_id", userId).not("decision", "is", null),
  ]);
  const items = [
    // Annonce retirée ou écartée en lot : ça ne dit rien de ce qui te plaît, on n'en apprend rien
    ...(recos ?? []).filter((r) => !NEUTRAL_REASONS.includes(r.reject_reason ?? "")).map((r) => ({ title: r.title ?? "", company: r.company ?? "", ok: r.status === "accepted", reason: r.reject_reason })),
    ...(offers ?? []).filter((o) => !NEUTRAL_REASONS.includes(o.reject_reason ?? "")).map((o) => ({ title: o.title ?? "", company: o.company ?? "", ok: o.decision === "accepted", reason: o.reject_reason })),
  ];
  const bad = new Map<string, number>();
  const good = new Map<string, number>();
  const reasons: Record<string, number> = {};
  const blocked = new Set<string>();
  for (const it of items) {
    const ws = new Set(words(it.title).filter((w) => !STOP.has(w)));
    if (it.ok) ws.forEach((w) => good.set(w, (good.get(w) ?? 0) + 1));
    else {
      if (it.reason) reasons[it.reason] = (reasons[it.reason] ?? 0) + 1;
      if (it.reason === "entreprise" && it.company) blocked.add(it.company.toLowerCase().trim());
      // seules les raisons liées au poste lui-même apprennent des mots du titre
      if (it.reason === "metier" || it.reason === "trop_senior" || it.reason === "secteur") ws.forEach((w) => bad.set(w, (bad.get(w) ?? 0) + 1));
    }
  }
  return {
    penaltyWords: [...bad].filter(([w, n]) => n >= 2 && !good.has(w)).map(([w]) => w),
    boostWords: [...good].filter(([w, n]) => n >= 2 && !bad.has(w)).map(([w]) => w),
    blockedCompanies: [...blocked],
    reasons,
    decided: items.length,
  };
}
