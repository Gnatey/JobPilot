/** Partie serveur de « Vérifier les annonces » (utilise la détection du site) ; le reste est dans lib/offer-check.ts, lisible aussi par l'écran. */
import { detectSource, isSignInLink, untrackUrl } from "./fetch-offer";
import { NOT_READABLE_SITES } from "./analyze-queue";

/** L'adresse à lire pour une ligne : un lien de suivi d'e-mail HelloWork est ramené à l'adresse réelle de l'annonce (les anciennes lignes gardent leur lien de suivi). */
export const checkTarget = (url: string): string => untrackUrl(url);

/** Faut-il lire ce lien ? Seulement une adresse http(s), jamais un lien de connexion automatique, sur un site qui n'est pas connu pour refuser la lecture. */
export function checkable(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  } catch {
    return false;
  }
  if (isSignInLink(url)) return false;
  return !NOT_READABLE_SITES.includes(detectSource(checkTarget(url)));
}
