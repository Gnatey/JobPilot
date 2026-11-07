/** Partie serveur de « Vérifier les annonces » (utilise la détection du site) ; le reste est dans lib/offer-check.ts, lisible aussi par l'écran. */
import { detectSource } from "./fetch-offer";
import { NOT_READABLE_SITES } from "./analyze-queue";

/** Faut-il lire ce lien ? Seulement une adresse http(s), sur un site qui n'est pas connu pour refuser la lecture. */
export function checkable(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  } catch {
    return false;
  }
  return !NOT_READABLE_SITES.includes(detectSource(url));
}
