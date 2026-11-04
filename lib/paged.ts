/**
 * Supabase coupe silencieusement chaque réponse à 1 000 lignes (réglage « Max rows »). Pour les statistiques et l'apprentissage, qui lisent
 * toute une table, on lit page après page jusqu'à ce qu'il n'y ait plus rien. Le tri doit être stable (par exemple `.order("id")`) pour qu'une
 * ligne ne soit ni lue deux fois ni sautée d'une page à l'autre.
 * On avance du nombre de lignes réellement reçues, pas de la taille demandée : si le plafond du serveur est plus bas que 1 000, rien n'est sauté.
 */
type Page<T> = PromiseLike<{ data: T[] | null; error?: { message?: string } | null }>;

export const PAGE_SIZE = 1000;
/** Garde-fou : au-delà, on s'arrête et on le dit (`truncated`) plutôt que de charger toute la base. */
export const MAX_ROWS = 20_000;

export async function fetchAll<T>(page: (from: number, to: number) => Page<T>, opts: { pageSize?: number; maxRows?: number } = {}): Promise<{ data: T[]; error: { message?: string } | null; truncated: boolean }> {
  const pageSize = Math.max(1, opts.pageSize ?? PAGE_SIZE);
  const maxRows = opts.maxRows ?? MAX_ROWS;
  const rows: T[] = [];
  while (rows.length < maxRows) {
    const { data, error } = await page(rows.length, rows.length + pageSize - 1);
    if (error) return { data: rows, error, truncated: false };
    if (!data?.length) return { data: rows, error: null, truncated: false };
    rows.push(...data);
  }
  return { data: rows.slice(0, maxRows), error: null, truncated: true };
}
