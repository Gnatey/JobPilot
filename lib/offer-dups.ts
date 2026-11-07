/**
 * Doublons dans Offres & CV : la même annonce reçue plusieurs fois (autre site, autre e-mail, entreprise qui republie), sous des adresses différentes.
 * Logique pure, lisible par l'écran (aucun import serveur), testée par tests/offer-dups.test.ts ; l'écran est components/offer-dups.tsx.
 *
 * Deux niveaux :
 * - SÛR : même intitulé (sans « H/F », accents ni majuscules) ET même entreprise connue. Les lignes en trop sont cochées d'office.
 * - À RELIRE : même intitulé précis (30 caractères au moins : « Data Analyst » ne suffit pas) mais entreprise différente ou non précisée
 *   (« Non spécifié », « Entreprise ? »). Jamais coché d'office : deux ESN peuvent publier la même mission, ou deux entreprises le même titre.
 * On GARDE la meilleure ligne : celle qui a un CV, puis l'offre déjà analysée, puis le meilleur score, puis la plus ancienne. Une ligne qui a un CV
 * n'est jamais proposée à la suppression. Rien n'est supprimé sans la personne.
 */
import { norm, type ListItem } from "./offers-filter";

export type DupItem = Pick<ListItem, "key" | "kind" | "title" | "href" | "ad" | "score" | "at" | "cv"> & { company: string };
export type DupGroup = { id: string; sure: boolean; items: DupItem[]; keepId: string };

/** Longueur minimale (lettres et chiffres) d'un intitulé pour rapprocher deux lignes d'entreprises différentes. */
export const MIN_MAYBE_TITLE = 30;

/** Intitulé comparable : sans accents ni majuscules, sans « (H/F) », « F/H »…, lettres et chiffres seulement. */
export const titleKey = (t: string) => norm(t).replace(/\(?\b[hf]\s*\/\s*[hf]\b\)?/g, " ").replace(/[^a-z0-9]/g, "");

/** Entreprise comparable : sans « SA », « groupe », « France » ni ponctuation. */
export const companyKey = (c: string) => norm(c).replace(/\b(sa|sas|sarl|group|groupe|france)\b/g, " ").replace(/[^a-z0-9]/g, "");

const UNKNOWN = new Set(["", "nonspecifie", "noncommunique", "nonprecise", "entreprise", "entrepriseconfidentielle", "confidentiel", "confidentielle", "inconnue", "inconnu"]);
/** L'entreprise est-elle renseignée ? « Non spécifié », « Non communiqué », « Entreprise ? »… ne le sont pas. */
export const knownCompany = (c: string) => !UNKNOWN.has(companyKey(c));

/** Ordre de préférence : CV d'abord, puis offre analysée, puis meilleur score, puis la plus ancienne. */
function better(a: DupItem, b: DupItem): number {
  return b.cv - a.cv || (a.kind === b.kind ? 0 : a.kind === "offer" ? -1 : 1) || (b.score ?? -1) - (a.score ?? -1) || a.at.localeCompare(b.at) || a.key.localeCompare(b.key);
}

const make = (id: string, sure: boolean, items: DupItem[]): DupGroup => {
  const ranked = [...items].sort(better);
  return { id, sure, items: ranked, keepId: ranked[0].key };
};

/** Cette ligne peut-elle être proposée à la suppression ? Pas la ligne gardée, et jamais une ligne qui a un CV. */
export const droppable = (g: Pick<DupGroup, "keepId">, it: Pick<DupItem, "key" | "cv">) => it.key !== g.keepId && it.cv === 0;

export function findDuplicates(items: DupItem[]): DupGroup[] {
  const byTitle = new Map<string, DupItem[]>();
  for (const it of items) {
    const k = titleKey(it.title);
    if (k) byTitle.set(k, [...(byTitle.get(k) ?? []), it]);
  }
  const groups: DupGroup[] = [];
  for (const [tk, list] of byTitle) {
    if (list.length < 2) continue;
    const byCompany = new Map<string, DupItem[]>();
    const reps: DupItem[] = []; // une ligne par entreprise (la meilleure) + les lignes sans entreprise, pour le niveau « à relire »
    for (const it of list) {
      if (knownCompany(it.company)) byCompany.set(companyKey(it.company), [...(byCompany.get(companyKey(it.company)) ?? []), it]);
      else reps.push(it);
    }
    for (const [ck, same] of byCompany) {
      const g = make(`s:${tk}:${ck}`, true, same);
      reps.push(g.items[0]);
      if (same.length >= 2) groups.push(g);
    }
    if (tk.length >= MIN_MAYBE_TITLE && reps.length >= 2) groups.push(make(`m:${tk}`, false, reps));
  }
  // Un groupe où rien ne peut être supprimé (tout a un CV) ne sert à rien
  return groups
    .filter((g) => g.items.some((it) => droppable(g, it)))
    .sort((a, b) => Number(b.sure) - Number(a.sure) || b.items[0].at.localeCompare(a.items[0].at) || a.id.localeCompare(b.id));
}

/** Lignes proposées à la suppression dans un ensemble de groupes. */
export const droppableKeys = (groups: DupGroup[], onlySure = false): string[] =>
  [...new Set(groups.filter((g) => g.sure || !onlySure).flatMap((g) => g.items.filter((it) => droppable(g, it)).map((it) => it.key)))];

/** Phrase de bilan : « 7 doublons sûrs dans 7 groupes, 3 groupes à relire ». */
export function dupSummary(groups: DupGroup[]): string {
  const s = (n: number) => (n > 1 ? "s" : "");
  const sure = groups.filter((g) => g.sure);
  const maybe = groups.length - sure.length;
  const extra = droppableKeys(sure).length;
  const parts: string[] = [];
  if (sure.length) parts.push(`${extra} ligne${s(extra)} en trop dans ${sure.length} groupe${s(sure.length)} de doublons sûrs`);
  if (maybe) parts.push(`${maybe} groupe${s(maybe)} à relire (même intitulé, entreprise différente ou non précisée)`);
  return `${parts.join(", ")}.`;
}
