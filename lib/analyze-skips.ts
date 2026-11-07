/**
 * Bilan de « Tout analyser » : les lignes qui n'ont pas pu être analysées, rangées par cause, pour que la personne puisse
 * ouvrir chaque annonce, vérifier, puis supprimer. Logique pure (testée par tests/analyze-skips.test.ts) ;
 * l'écran est components/analyze-skips.tsx.
 */

export type SkipKind = "gone" | "unreadable" | "failed";
export type Skip = { appId: string; title: string; url: string | null; kind: SkipKind };

/** Raison notée quand on supprime une annonce disparue : la même que « Offre plus disponible » dans la liste des raisons (neutre : ne dit rien de tes goûts). */
export const GONE_REASON = "expiree";

/** La cause d'après le code que renvoie l'analyse : 410 = annonce retirée, 400/422 = page illisible, le reste = échec passager. */
export const skipKind = (status: number): SkipKind => (status === 410 ? "gone" : status === 400 || status === 422 ? "unreadable" : "failed");

export const SKIP_WHY: Record<SkipKind, string> = {
  gone: "annonce plus disponible",
  unreadable: "annonce illisible : ouvre sa fiche et colle le texte",
  failed: "n'a pas pu être analysée, à relancer",
};

/** Adresse à ouvrir : http(s) seulement (jamais javascript: ni data:), sinon null. */
export function linkOf(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  try {
    const u = new URL(raw.trim());
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export function groupSkips(skips: Skip[]): Record<SkipKind, Skip[]> {
  return { gone: skips.filter((s) => s.kind === "gone"), unreadable: skips.filter((s) => s.kind === "unreadable"), failed: skips.filter((s) => s.kind === "failed") };
}

/** Retire de la liste les lignes dont l'identifiant est donné (celles qui viennent d'être supprimées). */
export const removeSkips = (skips: Skip[], ids: Iterable<string>): Skip[] => {
  const gone = new Set(ids);
  return skips.filter((s) => !gone.has(s.appId));
};

/** Lignes cochées pour la suppression en lot : toutes celles de la liste, sauf celles que la personne a décochées (« à garder »). */
export const selectedSkips = (list: Skip[], keep: ReadonlySet<string>): Skip[] => list.filter((s) => !keep.has(s.appId));

/** Les premières lignes d'une liste longue, et combien sont cachées. La liste des annonces disparues n'est JAMAIS coupée : la suppression en lot s'applique à toutes. */
export function firstOf<T>(list: T[], showAll: boolean, cap = 10): { shown: T[]; hidden: number } {
  return showAll || list.length <= cap ? { shown: list, hidden: 0 } : { shown: list.slice(0, cap), hidden: list.length - cap };
}

/** Phrase de confirmation après une suppression en lot. */
export function bulkMessage(deleted: number, failed: number): string {
  const s = (n: number) => (n > 1 ? "s" : "");
  if (!failed) return `${deleted} ligne${s(deleted)} supprimée${s(deleted)}.`;
  if (!deleted) return `Aucune ligne supprimée (${failed} échec${s(failed)}) : réessaie dans un moment.`;
  return `${deleted} ligne${s(deleted)} supprimée${s(deleted)}, ${failed} n'${failed > 1 ? "ont" : "a"} pas pu l'être : réessaie.`;
}
