import { fetchAll } from "./paged";

/** Les tables que contient l'export (jamais le jeton Gmail : `gmail_accounts` n'y est pas). */
export const EXPORT_TABLES = ["profiles", "offers", "applications", "status_history", "documents", "emails", "recommendations", "insights", "searches", "diagnostics"] as const;

type Read = (table: string, from: number, to: number) => PromiseLike<{ data: unknown[] | null; error?: { message?: string } | null }>;

/** Filet de sécurité : au-delà, on le dit dans le fichier plutôt que de charger toute la base en mémoire. */
const MAX_ROWS_PER_TABLE = 100_000;

/**
 * Lit TOUTES les lignes de chaque table, page après page. Supabase coupe sinon chaque lecture à 1 000 lignes sans le dire :
 * l'export (la seule sauvegarde du plan gratuit) serait resté incomplet sans que personne le voie.
 * Une table qu'on ne peut pas lire en entier fait échouer l'export : jamais un fichier avec un trou silencieux.
 */
export async function readExport(read: Read): Promise<{ tables: Record<string, unknown[]>; counts: Record<string, number>; truncated: string[] }> {
  const tables: Record<string, unknown[]> = {};
  const truncated: string[] = [];
  await Promise.all(EXPORT_TABLES.map(async (t) => {
    // Les lignes de contenu lourd (CV, lettres, e-mails) sont lues par petites pages
    const pageSize = t === "documents" || t === "emails" || t === "diagnostics" ? 100 : 500;
    const r = await fetchAll((a, b) => read(t, a, b), { pageSize, maxRows: MAX_ROWS_PER_TABLE });
    if (r.error) throw new Error(`L'export n'a pas pu lire « ${t} » en entier : réessaie dans un instant.`);
    tables[t] = r.data;
    if (r.truncated) truncated.push(t);
  }));
  // Ordre stable des clés, comme la liste ci-dessus
  const ordered = Object.fromEntries(EXPORT_TABLES.map((t) => [t, tables[t]]));
  return { tables: ordered, counts: Object.fromEntries(EXPORT_TABLES.map((t) => [t, ordered[t].length])), truncated };
}

/** Le lien secret de l'agenda n'a rien à faire dans un fichier qu'on peut partager. */
export function stripSecrets(profiles: unknown[]): void {
  const prof = profiles[0] as { data?: { preferences?: Record<string, unknown> } } | undefined;
  if (prof?.data?.preferences) delete prof.data.preferences.ics_token;
}
