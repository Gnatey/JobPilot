/**
 * « Vérifier les annonces » dans Recommandées : mêmes règles que dans Offres & CV (lib/offer-check.ts), appliquées aux offres « À trier ».
 * SANS IA. On ne conclut « disparue » que sur une preuve (voir `verdictOf`). Logique pure, testée par tests/reco-check.test.ts ; la route est
 * app/api/recommendations/check, l'écran components/check-recos.tsx.
 */
// Lu aussi par l'écran : aucun import d'exécution venant du serveur.
import { linkOf } from "./analyze-skips";
import type { CheckResult } from "./offer-check";

export type CheckableReco = { id: string; status: string; offer_id: string | null; url: string | null };

/**
 * Offres à vérifier : tout ce qui est « À trier » (jamais analysé ou déjà analysé) avec un lien http(s). Une offre déjà analysée peut avoir disparu
 * depuis son analyse (9 novembre : « quand l'analyse est faite, on ne peut plus vérifier les annonces ») : elle se vérifie comme les autres.
 */
export const checkCandidates = <T extends CheckableReco>(recos: T[]): T[] =>
  recos.filter((r) => (r.status === "new" || r.status === "analyzed") && linkOf(r.url) !== null);

/** Identifiants des annonces dont la disparition est prouvée. */
export const goneIds = (results: Pick<CheckResult, "id" | "verdict">[]): string[] => results.filter((r) => r.verdict === "gone").map((r) => r.id);

/** Phrase après « Écarter les N cochées ». */
export const rejectedMessage = (n: number): string => `${n} annonce${n > 1 ? "s" : ""} disparue${n > 1 ? "s" : ""} écartée${n > 1 ? "s" : ""} (offre plus disponible).`;
