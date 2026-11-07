/** Ordre de la liste « À trier » de Recommandées : par date de réception (défaut) ou par pré-score. Logique pure, testée par tests/reco-sort.test.ts. */
export type RecoSort = "date" | "score";
export const SORT_OPTIONS: { id: RecoSort; label: string }[] = [
  { id: "date", label: "Les plus récentes d'abord" },
  { id: "score", label: "Meilleur pré-score d'abord" },
];

type Sortable = { id: string; received_at: string | null; score: number };
const time = (s: string | null) => { const t = s ? Date.parse(s) : NaN; return Number.isFinite(t) ? t : -Infinity; };

/** Copie triée. Date : la plus récente d'abord, les offres sans date à la fin ; à date égale, le meilleur score d'abord. Score : l'inverse. L'identifiant tranche, pour un ordre stable. */
export function sortRecos<T extends Sortable>(list: T[], mode: RecoSort): T[] {
  const byDate = (a: T, b: T) => time(b.received_at) - time(a.received_at);
  const byScore = (a: T, b: T) => b.score - a.score;
  const [first, second] = mode === "score" ? [byScore, byDate] : [byDate, byScore];
  return [...list].sort((a, b) => first(a, b) || second(a, b) || a.id.localeCompare(b.id));
}
