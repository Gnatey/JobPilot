/**
 * Une offre peut avoir plusieurs lignes dans le suivi (doublons nés d'un double clic ou d'une ancienne version).
 * On garde celle qui compte le plus : une candidature envoyée, puis « À postuler », puis abandonnée. À égalité, la plus ancienne (l'ordre reçu).
 */
export const UNSENT = ["a_postuler", "abandonne", "expiree"];

export function pickApplication<T extends { status: string }>(rows: T[] | null | undefined): T | null {
  if (!rows?.length) return null;
  const rank = (a: T) => (!UNSENT.includes(a.status) ? 0 : a.status === "a_postuler" ? 1 : 2);
  return rows.reduce((best, r) => (rank(r) < rank(best) ? r : best), rows[0]);
}
