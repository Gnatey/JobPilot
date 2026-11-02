import { normalizeJobUrl } from "./fetch-offer";
import { recoText } from "./reco-text";

/** Une candidature « À postuler » sans analyse (ligne « À analyser » d'Offres & CV). */
export type QueueApp = { id: string; title: string | null; company: string | null; url: string | null; created_at?: string | null };
/** L'offre recommandée d'où elle vient, quand on la retrouve : elle porte le pré-score et parfois le texte de l'annonce. */
export type QueueReco = { id: string; title: string | null; company: string | null; url: string | null; quick_score: number | null; source: string | null; origin: string | null; snippet: string | null };

export type QueueItem = {
  app_id: string;
  reco_id: string | null;
  title: string;
  company: string;
  url: string | null;
  source: string | null;
  quick_score: number | null;
  /** L'annonce a été lue en entier (favori, recherche automatique) : analyse complète. */
  full: boolean;
  /** Seulement un extrait de liste ou d'alerte : analyse possible, pourcentage « estimé ». */
  extract: boolean;
  created_at: string;
};

const MIN_EXTRACT = 150;
const k = (title?: string | null, company?: string | null) => `${(title ?? "").toLowerCase().trim()}|${(company ?? "").toLowerCase().trim()}`;
const u = (url?: string | null) => (url ? normalizeJobUrl(url) : "");

/**
 * Ordre d'analyse de « Tout analyser » : les offres au meilleur pré-score d'abord (c'est là que l'IA gratuite est la mieux employée),
 * celles sans pré-score ensuite. Rien n'est exclu parce qu'elle vient d'Indeed ou d'un site qui bloque la lecture :
 * sans l'annonce entière, on analyse l'extrait et le pourcentage sera marqué « estimé ».
 * `skipped` : lignes sans lien, sans texte ni extrait, qu'aucune IA ne peut analyser (il faut coller l'annonce depuis leur fiche).
 */
export function buildQueue(apps: QueueApp[], recos: QueueReco[]): { items: QueueItem[]; skipped: QueueApp[] } {
  const byUrl = new Map<string, QueueReco>();
  const byTitle = new Map<string, QueueReco>();
  for (const r of recos) {
    if (r.url && !byUrl.has(u(r.url))) byUrl.set(u(r.url), r);
    if (!byTitle.has(k(r.title, r.company))) byTitle.set(k(r.title, r.company), r);
  }
  const items: QueueItem[] = [];
  const skipped: QueueApp[] = [];
  for (const a of apps) {
    const r = (a.url ? byUrl.get(u(a.url)) : undefined) ?? byTitle.get(k(a.title, a.company)) ?? null;
    const full = r ? recoText(r).length > 0 : false;
    const extract = r ? (r.snippet ?? "").trim().length >= MIN_EXTRACT : false;
    if (!full && !extract && !a.url) { skipped.push(a); continue; }
    items.push({
      app_id: a.id, reco_id: r?.id ?? null, title: a.title || "Poste ?", company: a.company || "", url: a.url, source: r?.source ?? null,
      quick_score: r?.quick_score ?? null, full, extract, created_at: a.created_at ?? "",
    });
  }
  items.sort((x, y) => (y.quick_score ?? -1) - (x.quick_score ?? -1) || y.created_at.localeCompare(x.created_at));
  return { items, skipped };
}
