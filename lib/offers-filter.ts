/**
 * Offres & CV : recherche, filtres et affichage progressif de la liste (logique pure, testée dans tests/offers-filter.test.ts).
 * Avec 200 lignes la page faisait 13 000 px : on montre les 30 plus récentes, on cherche, on filtre, et on déroule le reste à la demande.
 */

export type ListItem = {
  key: string;
  kind: "offer" | "app";
  href: string;
  ad: string | null;
  score: number | null;
  rough?: boolean;
  title: string;
  /** Entreprise seule (repérage des doublons). */
  company?: string;
  /** Entreprise, lieu, type d'entreprise. */
  sub: string;
  /** Étape de la candidature (« À postuler »…), ou null : offre analysée à la main, pas encore tranchée (« À décider »). */
  state: string | null;
  meta: string;
  /** Date de création (tri, plus récent d'abord). */
  at: string;
  /** Nombre de CV générés pour l'offre. */
  cv: number;
};

export const FILTERS = [
  { id: "all", label: "Toutes" },
  { id: "with_cv", label: "Avec CV" },
  { id: "no_cv", label: "Sans CV" },
  { id: "to_analyze", label: "À analyser" },
] as const;
export type FilterId = (typeof FILTERS)[number]["id"];

/** Lignes montrées d'abord, puis ajoutées à chaque « Voir les N autres ». */
export const PAGE_SIZE = 30;
/** Sous ce nombre de lignes, la recherche et les filtres ne servent à rien : on ne les montre pas. */
export const TOOLS_FROM = 8;

/** Sans accents, en minuscules : « Ecole », « école » et « ÉCOLE » se valent. */
export const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’‘]/g, "'").toLowerCase();

/** Tous les mots tapés se retrouvent dans le poste, l'entreprise ou le lieu (dans n'importe quel ordre). */
export function matchesQuery(it: Pick<ListItem, "title" | "sub">, q: string): boolean {
  const words = norm(q).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = norm(`${it.title} ${it.sub}`);
  return words.every((w) => hay.includes(w));
}

/**
 * Avec CV / Sans CV : les offres déjà analysées (un CV existe ou pas encore) ;
 * À analyser : les candidatures « Je candidate » dont l'offre n'a pas encore été lue (aucun CV possible tant qu'elle ne l'est pas).
 */
export function matchesFilter(it: Pick<ListItem, "kind" | "cv">, f: FilterId): boolean {
  switch (f) {
    case "with_cv": return it.kind === "offer" && it.cv > 0;
    case "no_cv": return it.kind === "offer" && it.cv === 0;
    case "to_analyze": return it.kind === "app";
    default: return true;
  }
}

export const selectItems = <T extends ListItem>(items: T[], q: string, f: FilterId): T[] => items.filter((it) => matchesFilter(it, f) && matchesQuery(it, q));

/** Combien de lignes compte chaque filtre, sur toute la liste (pas sur la recherche en cours : les boutons ne doivent pas bouger pendant qu'on tape). */
export const filterCounts = (items: Pick<ListItem, "kind" | "cv">[]): Record<FilterId, number> =>
  Object.fromEntries(FILTERS.map((f) => [f.id, items.filter((it) => matchesFilter(it, f.id)).length])) as Record<FilterId, number>;

/** Filtres à proposer : « Toutes » et ceux qui ont des lignes (plus celui qui est actif) ; aucun si un seul choix existerait. */
export function visibleFilters(counts: Record<FilterId, number>, active: FilterId): readonly (typeof FILTERS)[number][] {
  const list = FILTERS.filter((f) => f.id === "all" || f.id === active || counts[f.id] > 0);
  return list.length > 1 ? list : [];
}

/** Combien de lignes le prochain « Voir les N autres » ajoute. */
export const nextBatch = (total: number, shown: number) => Math.max(0, Math.min(PAGE_SIZE, total - shown));
