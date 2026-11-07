/**
 * Une table (ou colonne) ajoutée par une mise à jour de la base peut ne pas exister encore : Postgres répond 42P01, PostgREST (supabase-js) PGRST205
 * « Could not find the table … in the schema cache ». On reconnaît ce cas, et lui seul, pour répondre « lance la mise à jour de la base »
 * au lieu d'une erreur technique, ou pour compter la table vide dans l'export. Toute autre erreur reste une erreur.
 */
export function isMissingTable(error: { message?: string; code?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  return /could not find the table|schema cache|relation .* does not exist/i.test(error.message ?? "");
}
