import { normalizeJobUrl } from "./fetch-offer";

/** Clé de comparaison d'un texte : sans accents, sans majuscules, sans « SA / groupe / France », lettres et chiffres seulement. */
export const normKey = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\b(sa|sas|group|groupe|france)\b/g, "").replace(/[^a-z0-9]/g, "");

/**
 * Clé d'unicité d'une offre recommandée (`recommendations.dedupe_key`) : son adresse normalisée, à défaut le couple poste + entreprise.
 * La synchro des e-mails et « Garder pour plus tard » s'en servent toutes deux : la même offre reçue par e-mail ET gardée à la main ne fait qu'une ligne.
 */
export const dedupeKey = (url: string, title: string, company: string) =>
  url ? normalizeJobUrl(url).toLowerCase() : `${normKey(title)}|${normKey(company)}`;
