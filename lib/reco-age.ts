/**
 * Offres reçues depuis trop longtemps sans décision : au bout de 3 semaines, une offre « À trier » est rangée dans Masquées (raison « ancienne »).
 * Gratuit (aucune IA), rien n'est supprimé : « Garder dans ma liste » la remet à trier et elle n'est plus jamais rangée (raison « garde »).
 * Choisi par Juliana (7 novembre) : 3 semaines, parce que l'analyse par IA est limitée et que traiter les offres prend du temps.
 * Logique pure, testée par tests/reco-age.test.ts ; la base est lue et écrite par lib/reco-age-db.ts.
 */
import { KEPT } from "./fit";

export const OLD_AFTER_DAYS = 21;
/** Raison rangée dans `reject_reason` d'une offre masquée parce qu'elle est trop ancienne (aucune migration : la colonne existe déjà). */
export const OLD_REASON = "ancienne";
export const OLD_LABEL = `Trop ancienne (reçue il y a plus de ${OLD_AFTER_DAYS / 7} semaines, sans décision)`;

/** Date limite : une offre reçue avant elle est « ancienne ». */
export const oldCutoff = (now: Date = new Date()): string => new Date(now.getTime() - OLD_AFTER_DAYS * 86_400_000).toISOString();

/** Cette offre est-elle ancienne ? Sans date de réception, on ne conclut rien. */
export function isOld(receivedAt: string | null | undefined, now: Date = new Date()): boolean {
  if (!receivedAt) return false;
  const t = Date.parse(receivedAt);
  return Number.isFinite(t) && t < Date.parse(oldCutoff(now));
}

/** Une offre qui reste masquée quoi qu'il arrive au filtre « adapté à mon profil » : remise par la personne (« garde ») ou rangée pour son âge. */
export const staysAsIs = (reason: string | null | undefined): boolean => reason === KEPT || reason === OLD_REASON;
