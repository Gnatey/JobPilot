import { HttpError } from "../supabase/server";
import { requiredYears } from "../quick-score";
import { detectContracts } from "../fit";
import { adzuna } from "./adzuna";
import { jooble } from "./jooble";
import { sinceDays, type JobOffer, type SearchCriteria, type SearchOpts, type Source } from "./types";

export type { JobOffer, SearchCriteria } from "./types";
export { MAX_PAGE } from "./types";
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

/** Pourquoi une offre lue a été écartée d'office (11 novembre : la personne ne voyait pas pourquoi « consultant SI » ne sortait presque rien). */
export type Dropped = { exclude: number; remote: number; years: number; contract: number; old: number };
const NONE: Dropped = { exclude: 0, remote: 0, years: 0, contract: 0, old: 0 };

/** Filtres communs : mots exclus, télétravail, années demandées, contrats non demandés, ancienneté. Compte aussi ce qui est écarté, par cause (la première qui s'applique). */
export function filterOffersWithReport(list: JobOffer[], c: SearchCriteria): { kept: JobOffer[]; dropped: Dropped } {
  const exclude = (c.exclude ?? "").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);
  const days = sinceDays(c.publishedWithin);
  const oldest = days == null ? -Infinity : Date.now() - (days + 1) * 864e5; // période décochée : aucune offre n'est trop ancienne
  const dropped: Dropped = { ...NONE };
  const drop = (cause: keyof Dropped) => { dropped[cause]++; return false; };
  const kept = list.filter((o) => {
    const blob = `${o.title} ${o.description}`.toLowerCase();
    if (exclude.some((w) => blob.includes(w))) return drop("exclude");
    if (c.remoteOnly && !/t[ée]l[ée]travail|remote|distanciel|hybride/.test(blob)) return drop("remote");
    const years = o.years ?? requiredYears(blob);
    if (c.maxYears != null && years != null && years > c.maxYears) return drop("years");
    // Alternance et stage n'apparaissent que si la personne les a demandés
    const kinds = detectContracts(`${o.title} ${o.contract}`, o.description);
    if (kinds.length && !kinds.some((k) => c.contracts.includes(k === "stage" ? "STG" : "ALT"))) return drop("contract");
    const t = Date.parse(o.date);
    if (!Number.isNaN(t) && t < oldest) return drop("old");
    return true;
  });
  return { kept, dropped };
}

export const filterOffers = (list: JobOffer[], c: SearchCriteria): JobOffer[] => filterOffersWithReport(list, c).kept;

export type SourceReport = { id: string; label: string; ok: boolean; count: number; error?: string };

/** Recherche minimale utilisée pour vérifier qu'une clé fonctionne : une seule requête par source, sans filtre. */
const PROBE: SearchCriteria = { keywords: "data analyst", departments: [], contracts: ["CDI"], experience: "", publishedWithin: "31" };

export type SourceStatus = SourceReport & { configured: boolean; ms: number };

/**
 * Vérifie chaque source (administration) : une vraie requête par source branchée, sans rien enregistrer.
 * Contrairement à searchAll, une source en panne ne fait jamais échouer l'ensemble et les sources non branchées sont listées.
 */
export async function probeSources(): Promise<SourceStatus[]> {
  return Promise.all(
    SOURCES.map(async (s): Promise<SourceStatus> => {
      if (!s.configured()) return { id: s.id, label: s.label, configured: false, ok: false, count: 0, ms: 0 };
      const t0 = Date.now();
      try {
        const offers = await s.search(PROBE, { maxRequests: 1 });
        return { id: s.id, label: s.label, configured: true, ok: true, count: offers.length, ms: Date.now() - t0 };
      } catch (e) {
        return { id: s.id, label: s.label, configured: true, ok: false, count: 0, ms: Date.now() - t0, error: e instanceof Error ? e.message : "Erreur inconnue" };
      }
    })
  );
}

/** Interroge toutes les sources branchées en parallèle ; une source en panne n'empêche pas les autres. */
export async function searchAll(c: SearchCriteria, opts?: SearchOpts): Promise<{ offers: JobOffer[]; sources: SourceReport[]; read: number; dropped: Dropped; variants: string[] }> {
  const active = activeSources();
  if (!active.length) throw new HttpError(501, NO_SOURCE);
  const tried: string[] = []; // variantes de poste cherchées en plus des mots saisis (chaque source y note les siennes)
  const settled = await Promise.allSettled(active.map((s) => s.search(c, { ...opts, tried })));
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
  const { kept, dropped } = filterOffersWithReport(merged, c);
  // `read` : offres lues par les sources (doublons entre sources déjà retirés), avant les filtres communs
  return { offers: kept.sort((a, b) => b.date.localeCompare(a.date)), sources, read: merged.length, dropped, variants: [...new Set(tried)] };
}
