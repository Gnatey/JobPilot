/**
 * Ordre des listes d'offres (Recommandées › À trier, Tri rapide, Offres & CV) : par date de PUBLICATION sur le site quand on la connaît, sinon par date
 * d'arrivée (lib/posted.ts : `recoWhen`), des plus récentes aux plus anciennes, ou par score. Logique pure, testée par tests/reco-sort.test.ts.
 */
import { recoWhen, whenMs } from "./posted";

export type RecoSort = "date" | "old" | "score";
export const SORT_OPTIONS: { id: RecoSort; label: string }[] = [
  { id: "date", label: "Les plus récentes d'abord" },
  { id: "old", label: "Les plus anciennes d'abord" },
  { id: "score", label: "Meilleur pré-score d'abord" },
];

type Sortable = { id: string; received_at: string | null; posted_at?: string | null; origin?: string | null; score: number };

/**
 * Copie triée. Date : la plus récente (ou, pour « old », la plus ancienne) d'abord, les offres sans date TOUJOURS à la fin ; à date égale, le meilleur
 * score d'abord. Score : l'inverse. L'identifiant tranche, pour un ordre stable.
 */
export function sortRecos<T extends Sortable>(list: T[], mode: RecoSort): T[] {
  const ms = (r: T) => whenMs(recoWhen(r));
  const newest = (a: T, b: T) => (ms(a) === ms(b) ? 0 : ms(b) - ms(a)); // sans date : -Infinity, donc après les autres ; deux sans date : égales
  const oldest = (a: T, b: T) => {
    const x = ms(a), y = ms(b);
    if (x === y) return 0; // aussi pour deux « sans date » (-Infinity - -Infinity serait NaN)
    if (x === -Infinity) return 1; // sans date : après toutes les autres, même en ordre croissant
    if (y === -Infinity) return -1;
    return x - y;
  };
  const byDate = mode === "old" ? oldest : newest;
  const byScore = (a: T, b: T) => b.score - a.score;
  const [first, second] = mode === "score" ? [byScore, byDate] : [byDate, byScore];
  return [...list].sort((a, b) => first(a, b) || second(a, b) || a.id.localeCompare(b.id));
}
