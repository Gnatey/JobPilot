/**
 * La fiche d'une offre (ce que l'analyse a lu de l'annonce : poste, entreprise, lieu, contrat, missions, mots-clés…) modifiée à la main.
 * Logique pure, lisible par l'écran, testée par tests/offer-fiche.test.ts.
 *
 * Pourquoi : une annonce mal lue (poste vide, entreprise fausse) donnait un CV sans titre et une analyse fausse, sans aucun moyen de corriger.
 * Règles :
 * - la fiche vit à deux endroits (les colonnes title / company / location / contract de `offers`, et le JSON `extracted` que lisent le CV, la lettre
 *   et l'analyse) : ils sont toujours écrits ensemble ;
 * - ce que la personne remplit est noté dans `extracted.hand` (noms de champs) et n'est JAMAIS écrasé quand l'annonce est relue (`mergeReread`) ;
 * - `hand` n'est jamais envoyé aux IA (`forPrompt`).
 */
import type { OfferExtract } from "./types";

export type TextKey = "title" | "company" | "location" | "contract" | "remote" | "seniority" | "salary" | "domain" | "company_context";
export type ListKey = "missions" | "must_have" | "nice_to_have" | "soft_skills" | "keywords" | "red_flags";
export type FicheKey = TextKey | ListKey;
export type Fiche = Record<TextKey, string> & Record<ListKey, string[]>;

export const TEXT_FIELDS: { key: TextKey; label: string; max: number; hint?: string }[] = [
  { key: "title", label: "Poste", max: 120, hint: "Le titre écrit sous ton nom sur le CV." },
  { key: "company", label: "Entreprise", max: 120 },
  { key: "location", label: "Lieu", max: 120 },
  { key: "contract", label: "Contrat", max: 60 },
  { key: "remote", label: "Télétravail", max: 60 },
  { key: "seniority", label: "Niveau demandé", max: 120 },
  { key: "salary", label: "Salaire", max: 120 },
  { key: "domain", label: "Secteur", max: 160 },
  { key: "company_context", label: "L'entreprise et l'équipe", max: 1500 },
];

export const LIST_FIELDS: { key: ListKey; label: string; hint?: string }[] = [
  { key: "missions", label: "Missions" },
  { key: "must_have", label: "Indispensable" },
  { key: "nice_to_have", label: "Un plus" },
  { key: "soft_skills", label: "Savoir-être" },
  { key: "keywords", label: "Mots-clés de l'annonce", hint: "Les mots exacts de l'annonce : le CV les reprend." },
  { key: "red_flags", label: "À surveiller" },
];

const TEXT_KEYS = TEXT_FIELDS.map((f) => f.key) as TextKey[];
const LIST_KEYS = LIST_FIELDS.map((f) => f.key) as ListKey[];
export const FICHE_KEYS: FicheKey[] = [...TEXT_KEYS, ...LIST_KEYS];
const MAX_ITEMS = 30;
const MAX_ITEM = 300;

const isText = (k: string): k is TextKey => (TEXT_KEYS as string[]).includes(k);
const isList = (k: string): k is ListKey => (LIST_KEYS as string[]).includes(k);
const maxOf = (k: TextKey) => TEXT_FIELDS.find((f) => f.key === k)!.max;

/** Texte d'un champ : sans caractères de contrôle, espaces repliés (sauf les retours à la ligne du contexte), coupé à sa taille. */
export function cleanText(v: unknown, key: TextKey): string {
  if (typeof v !== "string") return "";
  // eslint-disable-next-line no-control-regex
  const s = v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, " ").replace(/\r\n?/g, "\n");
  const t = key === "company_context" ? s.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n") : s.replace(/\s+/g, " ");
  return t.trim().slice(0, maxOf(key));
}

/** Liste : un tableau de textes, ou un texte avec un élément par ligne (puces « - », « • », « * » retirées), sans doublon, 30 éléments au plus. */
export function cleanList(v: unknown): string[] {
  const raw = Array.isArray(v) ? v : typeof v === "string" ? v.split(/\r?\n/) : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of raw) {
    if (typeof x !== "string") continue;
    const s = x.replace(/\s+/g, " ").replace(/^[-–•*·]\s+/, "").trim().slice(0, MAX_ITEM);
    const k = s.toLowerCase();
    if (!s || seen.has(k)) continue;
    seen.add(k);
    out.push(s);
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
}

/** Ce que la requête envoie : seuls les champs PRÉSENTS sont lus (un champ absent n'est pas touché), tous nettoyés. */
export function readFiche(body: unknown): Partial<Fiche> {
  const out: Partial<Fiche> = {};
  if (!body || typeof body !== "object") return out;
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    if (isText(k)) out[k] = cleanText(v, k);
    else if (isList(k)) out[k] = cleanList(v);
  }
  return out;
}

/** La fiche telle que la lit l'écran : tout champ présent, rien qui vienne de l'IA n'est cru sur parole. Les colonnes complètent un champ vide. */
export function ficheOf(extracted: unknown, cols: { title?: string | null; company?: string | null; location?: string | null; contract?: string | null } = {}): Fiche {
  const x = (extracted && typeof extracted === "object" ? extracted : {}) as Record<string, unknown>;
  const f = {} as Fiche;
  for (const k of TEXT_KEYS) f[k] = cleanText(x[k], k);
  for (const k of LIST_KEYS) f[k] = cleanList(x[k]);
  for (const k of ["title", "company", "location", "contract"] as const) if (!f[k]) f[k] = cleanText(cols[k], k);
  return f;
}

/** Champs que la personne a remplis (noms connus seulement). */
export const handKeys = (extracted: unknown): FicheKey[] => {
  const h = (extracted as { hand?: unknown } | null)?.hand;
  return Array.isArray(h) ? (h.filter((k): k is FicheKey => typeof k === "string" && (FICHE_KEYS as string[]).includes(k))) : [];
};

const same = (a: string | string[], b: string | string[]) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Applique les corrections de la personne à la fiche : l'extrait complet (tous les champs, valeurs vides par défaut) et la liste de ce qui a changé.
 * Un champ modifié rejoint `hand` ; un champ rendu identique à ce qu'il était n'y entre pas.
 */
export function applyFiche(current: unknown, patch: Partial<Fiche>, cols: Parameters<typeof ficheOf>[1] = {}): { extracted: OfferExtract; changed: FicheKey[] } {
  const base = ficheOf(current, cols);
  const next: Fiche = { ...base };
  const changed: FicheKey[] = [];
  for (const k of FICHE_KEYS) {
    if (!(k in patch)) continue;
    const v = patch[k] as string & string[];
    if (!same(base[k], v)) changed.push(k);
    (next as Record<string, unknown>)[k] = v;
  }
  const hand = [...new Set([...handKeys(current), ...changed])];
  const gaps = gapsOf(current);
  // le JSON complet : les champs de la fiche, plus `hand` seulement s'il y a quelque chose à retenir, et les écarts déjà traités (lib/offer-gaps.ts)
  const extracted = { ...next, ...(hand.length ? { hand } : {}), ...(gaps ? { gaps } : {}) } as OfferExtract;
  return { extracted, changed };
}

/** Les quatre colonnes de `offers` qui doublent la fiche. */
export const columnsOf = (x: Pick<Fiche, "title" | "company" | "location" | "contract">) => ({ title: x.title, company: x.company, location: x.location, contract: x.contract });

/**
 * Relecture de l'annonce par l'IA : ce que la personne a rempli à la main est gardé, le reste prend la nouvelle lecture.
 * `old` est l'ancien extrait (avec son `hand`), `fresh` ce que l'IA vient de lire.
 */
export function mergeReread(old: unknown, fresh: OfferExtract, cols: Parameters<typeof ficheOf>[1] = {}): OfferExtract {
  const hand = handKeys(old);
  const gaps = gapsOf(old); // les écarts déjà traités (« je l'ai fait » / « pas fait ») survivent à une relecture de l'annonce
  const base = gaps ? ({ ...fresh, gaps } as OfferExtract) : fresh;
  if (!hand.length) return base;
  const kept = ficheOf(old, cols);
  const out = { ...base } as Record<string, unknown>;
  for (const k of hand) out[k] = kept[k];
  out.hand = hand;
  return out as unknown as OfferExtract;
}

/** L'extrait tel qu'on le donne aux IA : sans la mémoire de ce que la personne a rempli ni celle des écarts traités (ces derniers passent par `refusedLine`). */
export function forPrompt<T extends object>(x: T): Omit<T, "hand" | "gaps"> {
  const { hand, gaps, ...rest } = x as T & { hand?: unknown; gaps?: unknown };
  void hand; void gaps;
  return rest;
}

/** Les écarts traités d'un extrait (tel quel), ou rien. */
function gapsOf(x: unknown): OfferExtract["gaps"] | undefined {
  const g = (x as { gaps?: OfferExtract["gaps"] } | null | undefined)?.gaps;
  return g && typeof g === "object" ? g : undefined;
}

/**
 * L'extrait pour le CV, la lettre et l'analyse : un champ vide est complété par la colonne de l'offre (une ancienne ligne pouvait avoir le poste
 * dans la colonne seulement).
 */
export function withColumns(extracted: unknown, cols: Parameters<typeof ficheOf>[1]): OfferExtract {
  const f = ficheOf(extracted, cols);
  const hand = handKeys(extracted);
  return { ...(extracted && typeof extracted === "object" ? (extracted as object) : {}), ...f, ...(hand.length ? { hand } : {}) } as OfferExtract;
}

/* ---------- La ligne de Suivi qui reprend la fiche ---------- */

type Cols = { title?: string | null; company?: string | null; location?: string | null; contract?: string | null };
const PLACEHOLDER: Record<string, string[]> = { title: ["poste ?"], company: ["entreprise ?"], location: [], contract: [] };

/**
 * Ce qu'il faut changer sur une ligne de Suivi quand la fiche change. Un champ de la ligne est remplacé seulement s'il reprenait la fiche
 * (vide, repère « Poste ? » / « Entreprise ? », ou identique à l'ancienne valeur de la fiche) : ce que la personne a écrit sur la ligne reste.
 */
export function linePatch(before: Cols, after: Cols, line: Cols): Partial<Record<"title" | "company" | "location" | "contract", string>> {
  const patch: Partial<Record<"title" | "company" | "location" | "contract", string>> = {};
  for (const k of ["title", "company", "location", "contract"] as const) {
    const next = (after[k] ?? "").trim();
    const cur = (line[k] ?? "").trim();
    if (!next || next === cur) continue;
    const mirrors = !cur || PLACEHOLDER[k].includes(cur.toLowerCase()) || cur === (before[k] ?? "").trim();
    if (mirrors) patch[k] = next;
  }
  return patch;
}
