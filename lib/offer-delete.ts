import { cleanReason } from "./types";
import { isUnsentApp } from "./app-pick";

/**
 * Supprimer une offre ou une ligne d'Offres & CV, avec une raison facultative (la même liste que « Je ne postule pas »).
 * Logique pure (testée dans tests/offer-delete.test.ts) ; les requêtes sont dans app/api/offers/[id] et app/api/applications/[id].
 */

/** Raison reçue du navigateur : une raison connue ou « autre » avec son pourquoi, bornée ; null si absente. */
export const deletionReason = (raw: unknown): string | null => cleanReason(typeof raw === "string" ? raw : null);

/** Statuts de recommandation qu'une suppression avec raison peut basculer en « écartée » (jamais une recommandation déjà écartée). */
export const REJECTABLE_RECO = ["new", "analyzed", "accepted"] as const;

/**
 * Une raison n'écarte la recommandation que si aucune candidature n'est partie : une candidature envoyée reste un vrai « oui »
 * (la ligne disparaît de la liste, pas l'histoire). Sans raison, comportement d'avant : « analysée » redevient « à trier ».
 */
export function planOfferDeletion(apps: { status: string; applied_at?: string | null }[] | null | undefined, reason: string | null) {
  const sent = (apps ?? []).some((a) => !isUnsentApp(a));
  return { sent, rejectRecos: !!reason && !sent };
}
