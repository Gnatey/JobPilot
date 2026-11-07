/**
 * Une offre peut avoir plusieurs lignes dans le suivi (doublons nés d'un double clic ou d'une ancienne version).
 * On garde celle qui compte le plus : une candidature envoyée, puis « À postuler », puis abandonnée. À égalité, la plus ancienne (l'ordre reçu).
 */
export const UNSENT = ["a_postuler", "abandonne", "expiree"];

/** Ligne du suivi jamais envoyée : rien n'est parti chez l'entreprise, la supprimer ne perd aucune candidature. */
export const isUnsentApp = (a: { status: string; applied_at?: string | null }) => UNSENT.includes(a.status) && !a.applied_at;

/**
 * Peut-on retirer cette ligne depuis Offres & CV ? Oui si elle est jamais envoyée (`isUnsentApp`), et aussi une ligne « À postuler » qui porte une
 * date d'envoi laissée par une ancienne version de la synchro des e-mails (« À postuler » dit qu'elle n'est pas partie) pourvu qu'elle n'ait AUCUNE
 * autre trace de travail : ni note, ni contact, ni salaire, ni entretien. Une ligne Postulé / Entretien… n'est jamais concernée.
 */
export const isRemovableToApply = (a: { status: string; applied_at?: string | null; notes?: string | null; contact?: string | null; salary?: string | null; interview_at?: string | null }) =>
  isUnsentApp(a) || (a.status === "a_postuler" && !(a.notes ?? "").trim() && !(a.contact ?? "").trim() && !(a.salary ?? "").trim() && !a.interview_at);

export function pickApplication<T extends { status: string }>(rows: T[] | null | undefined): T | null {
  if (!rows?.length) return null;
  const rank = (a: T) => (!UNSENT.includes(a.status) ? 0 : a.status === "a_postuler" ? 1 : 2);
  return rows.reduce((best, r) => (rank(r) < rank(best) ? r : best), rows[0]);
}
