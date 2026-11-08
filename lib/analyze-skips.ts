/**
 * Bilan de « Tout analyser » : les lignes qui n'ont pas pu être analysées, rangées par cause, pour que la personne puisse
 * ouvrir chaque annonce, vérifier, puis supprimer. Logique pure (testée par tests/analyze-skips.test.ts) ;
 * l'écran est components/analyze-skips.tsx.
 */

/** `kept` : la ligne porte maintenant un texte collé (découvert à la mise à jour du bilan, lib/skip-sync.ts) : elle n'est plus illisible, elle est prête à analyser. */
export type SkipKind = "gone" | "unreadable" | "failed" | "kept";
/** `site` : le site de l'annonce d'après son adresse (« Indeed », « HelloWork »…), pour ranger les lignes illisibles par site. */
export type Skip = { appId: string; title: string; url: string | null; kind: SkipKind; site: string; /** Annonce disparue : la preuve, en une phrase. */ why?: string };

/** Raison notée quand on supprime une annonce disparue : la même que « Offre plus disponible » dans la liste des raisons (neutre : ne dit rien de tes goûts). */
export const GONE_REASON = "expiree";

/** La cause d'après le code que renvoie l'analyse : 410 = annonce retirée, 400/422 = page illisible, le reste = échec passager. */
export const skipKind = (status: number): SkipKind => (status === 410 ? "gone" : status === 400 || status === 422 ? "unreadable" : "failed");

export const SKIP_WHY: Record<SkipKind, string> = {
  gone: "annonce plus disponible",
  unreadable: "annonce illisible : ouvre sa fiche et colle le texte",
  failed: "n'a pas pu être analysée, à relancer",
  kept: "texte déjà collé, prête à analyser",
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
  return {
    gone: skips.filter((s) => s.kind === "gone"), unreadable: skips.filter((s) => s.kind === "unreadable"),
    failed: skips.filter((s) => s.kind === "failed"), kept: skips.filter((s) => s.kind === "kept"),
  };
}

/** Les lignes rangées par site, le site le plus fourni d'abord (puis par ordre alphabétique). */
export function groupBySite(list: Skip[]): { site: string; items: Skip[] }[] {
  const by = new Map<string, Skip[]>();
  for (const s of list) by.set(s.site, [...(by.get(s.site) ?? []), s]);
  return [...by.entries()].map(([site, items]) => ({ site, items })).sort((a, b) => b.items.length - a.items.length || a.site.localeCompare(b.site, "fr"));
}

/** Ce qu'on dit de faire pour les lignes illisibles d'un site : Indeed refuse la lecture d'office, les autres sites ont refusé cette fois. */
export function siteAdvice(site: string): string {
  if (site === "Sans lien") return "Ces lignes n'ont pas de lien : colle le texte de l'annonce, ou supprime la ligne.";
  if (site === "Indeed") return "Indeed refuse la lecture automatique : je ne les relis plus à chaque passage. Ouvre l'annonce, puis utilise le favori « Envoyer à JobPilot » sur sa page, ou colle son texte.";
  if (site === "LinkedIn" || site === "Glassdoor") return `${site} a refusé la lecture de ces annonces : utilise le favori « Envoyer à JobPilot » sur la page de l'annonce, ou colle son texte.`;
  return "Le site a refusé la lecture de ces annonces : colle leur texte, ou supprime la ligne.";
}

/** Page « Analyser une offre » préremplie pour coller le texte d'une ligne : l'analyse sera rattachée à cette candidature (`app`). L'adresse est jointe si elle est valide et de taille raisonnable. */
export function pasteHref(appId: string, url: string | null | undefined): string {
  const link = linkOf(url);
  return `/offres/nouvelle?app=${encodeURIComponent(appId)}&needtext=1${link && link.length <= 1800 ? `&url=${encodeURIComponent(link)}` : ""}`;
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
