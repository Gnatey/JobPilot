/**
 * Sélection de lignes « À analyser » dans Offres & CV (cases à cocher, puis « Analyser la sélection » / « Vérifier les liens »).
 * Logique pure (testée par tests/selection.test.ts), lue aussi par l'écran : aucun import venant du serveur.
 */

export const toggleId = (set: ReadonlySet<string>, id: string): Set<string> => {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
};

/** Coche (on) ou décoche (off) toutes ces lignes d'un coup. */
export function setMany(set: ReadonlySet<string>, ids: Iterable<string>, on: boolean): Set<string> {
  const next = new Set(set);
  for (const id of ids) {
    if (on) next.add(id);
    else next.delete(id);
  }
  return next;
}

/** Les lignes cochées qui existent toujours dans la liste (une ligne analysée ou supprimée entre-temps disparaît de la sélection). */
export const pruneSelection = (set: ReadonlySet<string>, valid: Iterable<string>): string[] => {
  const alive = new Set(valid);
  return [...set].filter((id) => alive.has(id));
};

/**
 * File d'analyse limitée à la sélection : `only` nul = tout (« Tout analyser »). `noSource` : lignes sans lien ni texte parmi celles-ci.
 * Une ligne cochée qui n'est plus dans la file (déjà analysée, supprimée) est simplement absente : rien à signaler.
 */
export function restrictQueue<I extends { app_id: string }, B extends { app_id: string }, S extends { app_id: string } = B>(
  q: { items: I[]; blocked: B[]; skippedIds: string[]; skipped: number; skippedLines?: S[] },
  only: ReadonlySet<string> | null
): { items: I[]; blocked: B[]; noSource: number; noSourceLines: S[] } {
  if (!only) return { items: q.items, blocked: q.blocked, noSource: q.skipped, noSourceLines: q.skippedLines ?? [] };
  return {
    items: q.items.filter((i) => only.has(i.app_id)),
    blocked: q.blocked.filter((b) => only.has(b.app_id)),
    noSource: q.skippedIds.filter((id) => only.has(id)).length,
    noSourceLines: (q.skippedLines ?? []).filter((l) => only.has(l.app_id)),
  };
}

/** « 1 cochée », « 12 cochées ». */
export const checkedLabel = (n: number) => `${n} cochée${n > 1 ? "s" : ""}`;
