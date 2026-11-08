/** Partie serveur de « Vérifier les annonces » (utilise la détection du site) ; le reste est dans lib/offer-check.ts, lisible aussi par l'écran. */
import { detectSource, isSignInLink, normalizeJobUrl, untrackUrl } from "./fetch-offer";
import { NOT_READABLE_SITES } from "./analyze-queue";

/**
 * L'adresse à lire pour une ligne : un lien de suivi d'e-mail HelloWork est ramené à l'adresse réelle de l'annonce, sous sa forme canonique, sans les
 * paramètres de suivi du jeton (les anciennes lignes gardent leur lien de suivi). Toute autre adresse est lue telle quelle.
 */
export const checkTarget = (url: string): string => {
  const decoded = untrackUrl(url);
  return decoded === url ? url : normalizeJobUrl(decoded);
};

/**
 * La preuve d'une annonce disparue, avec l'adresse réellement lue quand ce n'est pas celle de la ligne (lien de suivi d'e-mail décodé) :
 * la personne ouvre le lien de la ligne, elle doit pouvoir voir si la vérification a lu autre chose.
 */
export function goneWhy(why: string | undefined, stored: string, read: string): string {
  const base = why ?? "preuve non précisée";
  if (read === stored) return base;
  try {
    const u = new URL(read);
    return `${base}, adresse lue : ${u.hostname.replace(/^www\./, "")}${u.pathname}`;
  } catch {
    return base;
  }
}

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
  const target = checkTarget(url);
  // Un lien de suivi d'e-mail HelloWork décodé qui ne mène pas à une page d'annonce (désinscription, liste d'offres…) : un « introuvable » n'y prouverait rien
  if (target !== url && !/^https:\/\/www\.hellowork\.com\/(?:[a-z]{2}-[a-z]{2}\/)?emplois\/\d+\.html$/.test(target)) return false;
  return !NOT_READABLE_SITES.includes(detectSource(target));
}
