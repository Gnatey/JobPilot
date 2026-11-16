import { HttpError } from "./supabase/server";

/**
 * Une écriture en base dont le résultat compte : si elle échoue, la route répond une erreur claire au lieu d'un « ok » qui laisse croire
 * que c'est enregistré (audit du 16 novembre 2026 : une cinquantaine d'écritures ignoraient leur erreur, dont l'application d'un diagnostic de CV).
 * L'erreur technique reste dans les journaux ; la personne lit un message simple.
 * À ne PAS utiliser pour une table ou une colonne ajoutée par une mise à jour de la base pas encore lancée (la lecture tolérante vaut mieux).
 */
export function must<T extends { error: unknown }>(res: T, what = "Ce changement"): T {
  if (res.error) {
    // Seulement le code et le message : le champ « details » de Postgres peut recopier la ligne refusée (un jeton chiffré, un texte de CV…).
    const e = res.error as { code?: unknown; message?: unknown };
    console.error(`[écriture refusée] ${what} (${String(e?.code ?? "?")}) ${String(e?.message ?? "")}`);
    throw new HttpError(500, `${what} n'a pas pu être enregistré : réessaie dans un instant.`);
  }
  return res;
}
