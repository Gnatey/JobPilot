import { HttpError } from "../supabase/server";
import { requiredYears } from "../quick-score";
import { detectContracts } from "../fit";
import { adzuna } from "./adzuna";
import { jooble } from "./jooble";
import type { JobOffer, SearchCriteria, SearchOpts, Source } from "./types";

export type { JobOffer, SearchCriteria } from "./types";
export { externalId } from "./types";

/** Sources d'offres branchées par clé (facultatives). Les alertes Gmail et le copier-coller marchent toujours. */
export const SOURCES: Source[] = [adzuna, jooble];

export const activeSources = () => SOURCES.filter((s) => s.configured());
export const hasSource = () => activeSources().length > 0;

export const NO_SOURCE = "Aucune source d'offres automatique n'est branchée.";

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

/** Même offre vue par deux sources : on reconnaît le titre, l'entreprise et (si l'entreprise est inconnue) le lieu. */
function sameOffer(o: JobOffer) {
  const unknown = /non communiqu/i.test(o.company) || !o.company;
  return `${norm(o.title)}|${norm(unknown ? o.location : o.company)}`;
}

/** Filtres communs : mots exclus, télétravail, années demandées, ancienneté. */
export function filterOffers(list: JobOffer[], c: SearchCriteria): JobOffer[] {
  const exclude = (c.exclude ?? "").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);
  const oldest = Date.now() - (Number(c.publishedWithin || 14) + 1) * 864e5;
  return list.filter((o) => {
    const blob = `${o.title} ${o.description}`.toLowerCase();
    if (exclude.some((w) => blob.includes(w))) return false;
    if (c.remoteOnly && !/t[ée]l[ée]travail|remote|distanciel|hybride/.test(blob)) return false;
    const years = o.years ?? requiredYears(blob);
    if (c.maxYears != null && years != null && years > c.maxYears) return false;
    // Alternance et stage n'apparaissent que si la personne les a demandés
    const kinds = detectContracts(`${o.title} ${o.contract}`, o.description);
    if (kinds.length && !kinds.some((k) => c.contracts.includes(k === "stage" ? "STG" : "ALT"))) return false;
    const t = Date.parse(o.date);
    if (!Number.isNaN(t) && t < oldest) return false;
    return true;
  });
}

export type SourceReport = { id: string; label: string; ok: boolean; count: number; error?: string };

/** Interroge toutes les sources branchées en parallèle ; une source en panne n'empêche pas les autres. */
export async function searchAll(c: SearchCriteria, opts?: SearchOpts): Promise<{ offers: JobOffer[]; sources: SourceReport[] }> {
  const active = activeSources();
  if (!active.length) throw new HttpError(501, NO_SOURCE);
  const settled = await Promise.allSettled(active.map((s) => s.search(c, opts)));
  const sources: SourceReport[] = settled.map((r, i) =>
    r.status === "fulfilled"
      ? { id: active[i].id, label: active[i].label, ok: true, count: r.value.length }
      : { id: active[i].id, label: active[i].label, ok: false, count: 0, error: r.reason instanceof Error ? r.reason.message : "Erreur inconnue" }
  );
  if (sources.every((s) => !s.ok)) throw new HttpError(502, sources.map((s) => s.error).join(" "));
  const seen = new Set<string>();
  const merged = settled
    .flatMap((r) => (r.status === "fulfilled" ? r.value : []))
    .filter((o) => (seen.has(sameOffer(o)) ? false : (seen.add(sameOffer(o)), true)));
  return { offers: filterOffers(merged, c).sort((a, b) => b.date.localeCompare(a.date)), sources };
}
