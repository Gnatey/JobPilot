/**
 * Annuaire d'entreprises (Recherche) : logique pure, testée dans tests/directory.test.ts. AUCUNE IA, AUCUN appel réseau.
 * Les données sont dans `lib/directory-data.ts` (un fichier du dépôt, pas une table) ; ce module ne fait que choisir et ranger :
 *   - `matchProfile` : les entreprises qui correspondent au profil (familles de métiers déduites des postes, secteurs choisis) ;
 *   - `searchDirectory` : la recherche par mots-clés (sans accents ni majuscules) dans TOUT l'annuaire ;
 *   - `groupByType` : le rangement par type d'employeur.
 * Rien n'est lu sur les sites des entreprises : chaque entrée n'est qu'un lien vers leur page recrutement.
 */
import { JOB_FAMILIES, SECTOR_FAMILIES } from "./job-families";
import { norm } from "./offers-filter";

/** Types d'employeur, dans l'ordre d'affichage (mêmes familles que le « type d'entreprise » de l'analyse des offres). */
export const TYPES = [
  "ESN et conseil",
  "Banque, finance et assurance",
  "Grands groupes",
  "Startups et scale-ups",
  "Secteur public, santé et associations",
  "Cabinets de recrutement",
  "Sites d'emploi spécialisés",
] as const;
export type DirType = (typeof TYPES)[number];

export type Entry = {
  name: string;
  type: DirType;
  /** Page recrutement de l'entreprise (ou page d'accueil du site d'emploi) : https, sans paramètre de suivi. */
  url: string;
  /** Familles de métiers (libellés de JOB_FAMILIES) que cet employeur recrute. */
  families: readonly string[];
  /** Secteur principal : une option de SECTOR_FAMILIES (vide pour un site généraliste, qui couvre tous les métiers). */
  sector: string;
  /** Mots en plus pour la recherche (marques, activités). */
  kw?: string;
};

// ---------- Familles de métiers et secteurs connus ----------

const optionFamilies = new Map<string, string[]>();   // option de poste (sans accent) → familles qui la contiennent
const familyTokens = new Map<string, Set<string>>();  // famille → mots de ses postes
const SHORT_TOKENS = new Set(["bi", "rh", "ia", "it", "ux", "ui", "sap"]);
/** Mots trop courants dans un intitulé pour dire quoi que ce soit du domaine. */
const GENERIC = new Set([
  "analyste", "analyst", "responsable", "charge", "chargee", "chef", "manager", "consultant", "consultante", "ingenieur", "assistant", "assistante",
  "conseiller", "conseillere", "developpeur", "gestionnaire", "technicien", "technicienne", "projet", "junior", "senior", "stage", "stagiaire",
  "alternance", "alternant", "alternante", "poste", "des", "du", "de", "la", "le", "les", "et", "en", "au", "aux", "pour", "sur", "par", "cdi", "cdd",
]);
const words = (s: string) => norm(s).split(/[^a-z0-9+#]+/).filter(Boolean);

for (const f of JOB_FAMILIES) {
  const set = new Set<string>();
  for (const o of f.options) {
    const n = norm(o).trim();
    optionFamilies.set(n, [...new Set([...(optionFamilies.get(n) ?? []), f.label])]);
    for (const w of words(o)) if (!GENERIC.has(w) && (w.length >= 3 || SHORT_TOKENS.has(w))) set.add(w);
  }
  familyTokens.set(f.label, set);
}

/** Mots courants du métier qui ne sont dans aucun intitulé de la liste (« Développeur web » n'y est pas). */
const EXTRA_TOKENS: Record<string, string[]> = {
  "Informatique et développement": ["web", "logiciel", "javascript", "react", "php", "application", "applications", "embarque", "fullstack", "frontend", "backend"],
  "Data et BI": ["sql", "statisticien", "statisticienne", "tableau", "dataviz"],
};
for (const [fam, toks] of Object.entries(EXTRA_TOKENS)) { const set = familyTokens.get(fam); if (set) toks.forEach((t) => set.add(t)); }

export const FAMILY_LABELS: readonly string[] = JOB_FAMILIES.map((f) => f.label);
export const SECTOR_OPTIONS: readonly string[] = SECTOR_FAMILIES.flatMap((f) => f.options);

/** Familles de métiers d'un poste (« Data Analyst » donne « Data et BI »). Un intitulé libre est rapproché par mots ; rien de reconnu = aucune famille. */
export function familiesOfRole(role: string): string[] {
  const n = norm(role).trim();
  if (!n) return [];
  const exact = optionFamilies.get(n);
  if (exact) return exact;
  const own = JOB_FAMILIES.filter((f) => norm(f.label) === n).map((f) => f.label);
  if (own.length) return own;
  // L'intitulé contient un poste connu (« Data Analyst junior ») ou l'inverse
  const near = new Set<string>();
  for (const [opt, fams] of optionFamilies) if (opt.length >= 5 && n.length >= 5 && (n.includes(opt) || opt.includes(n))) fams.forEach((f) => near.add(f));
  if (near.size) return [...near];
  // Sinon, par les mots propres au domaine (« BI », « SEO », « comptable »)
  const ws = words(role).filter((w) => !GENERIC.has(w) && (w.length >= 3 || SHORT_TOKENS.has(w)));
  const out = new Set<string>();
  for (const w of ws) for (const [fam, toks] of familyTokens) if (toks.has(w)) out.add(fam);
  return [...out];
}

export const familiesOfRoles = (roles: string[]): string[] => [...new Set(roles.flatMap(familiesOfRole))];

/** Secteurs choisis dans le profil : une option (« Banque »), un groupe (« Finance » = toutes ses options) ou un mot libre rapproché d'une option. */
export function sectorsOf(sectors: string[]): string[] {
  const out = new Set<string>();
  for (const s of sectors) {
    const n = norm(s).trim();
    if (!n) continue;
    const group = SECTOR_FAMILIES.find((g) => norm(g.label) === n);
    if (group) { group.options.forEach((o) => out.add(o)); continue; }
    const exact = SECTOR_OPTIONS.filter((o) => norm(o) === n);
    if (exact.length) { exact.forEach((o) => out.add(o)); continue; }
    if (n.length >= 4) for (const o of SECTOR_OPTIONS) if (norm(o).includes(n) || n.includes(norm(o))) out.add(o);
  }
  return [...out];
}

// ---------- Choisir ----------

export type Matched = { entry: Entry; score: number };

/** Un site qui couvre (presque) tous les métiers (JobTeaser, La bonne alternance…) : plus de 12 familles. Il passe après les employeurs précis. */
export const isGeneralist = (e: Entry): boolean => e.families.length > 12;

/** Points minimum pour être proposé sur le profil : un métier central de l'employeur (2 points) ou un secteur choisi (2 points). Un métier secondaire seul (1 point) ne suffit pas. */
export const MIN_SCORE = 2;

/**
 * Entreprises qui correspondent au profil. Les trois premières familles d'une entrée sont ses métiers CENTRAUX (2 points chacun), les suivantes des métiers
 * qu'on y trouve aussi (1 point) ; un secteur choisi dans le profil ajoute 2 points. Moins de `MIN_SCORE` points : l'entreprise n'est pas proposée (la
 * recherche par mots-clés la trouve quand même) : la page ne montre pas « tout et rien ». Un site généraliste (`isGeneralist`) vaut 2 points dès qu'un
 * métier du profil existe et passe après les employeurs précis à points égaux. Un profil sans poste ni secteur reconnu ne voit rien.
 * Triées par points, généralistes en dernier, puis par nom.
 */
export function matchProfile(entries: readonly Entry[], profile: { roles: string[]; sectors: string[] }): Matched[] {
  const fams = new Set(familiesOfRoles(profile.roles));
  const secs = new Set(sectorsOf(profile.sectors));
  if (!fams.size && !secs.size) return [];
  const out: Matched[] = [];
  for (const entry of entries) {
    const general = isGeneralist(entry);
    const fromFamilies = general
      ? (entry.families.some((f) => fams.has(f)) ? MIN_SCORE : 0)
      : entry.families.reduce((n, f, i) => n + (fams.has(f) ? (i < 3 ? 2 : 1) : 0), 0);
    const score = fromFamilies + (secs.has(entry.sector) ? 2 : 0);
    if (score >= MIN_SCORE) out.push({ entry, score });
  }
  return out.sort((a, b) => b.score - a.score || Number(isGeneralist(a.entry)) - Number(isGeneralist(b.entry)) || a.entry.name.localeCompare(b.entry.name, "fr"));
}

/** Recherche par mots-clés dans tout l'annuaire : chaque mot (2 lettres au moins) doit se trouver dans le nom, le type, le secteur, les familles ou les mots en plus. */
export function searchDirectory(entries: readonly Entry[], query: string): Entry[] {
  const tokens = norm(query).split(/\s+/).filter((t) => t.length >= 2);
  if (!tokens.length) return [];
  const rank = (e: Entry) => { const n = norm(e.name); return n.startsWith(tokens[0]) ? 0 : tokens.every((t) => n.includes(t)) ? 1 : 2; };
  return entries
    .filter((e) => { const hay = norm([e.name, e.type, e.sector, e.families.join(" "), e.kw ?? ""].join(" ")); return tokens.every((t) => hay.includes(t)); })
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, "fr"));
}

/** Range par type d'employeur (ordre de `TYPES`, types vides retirés). L'ordre reçu est gardé dans chaque type. */
export function groupByType<T>(items: readonly T[], typeOf: (x: T) => DirType): { type: DirType; items: T[] }[] {
  return TYPES.map((type) => ({ type, items: items.filter((x) => typeOf(x) === type) })).filter((g) => g.items.length);
}

/** Nom de domaine affiché sous un lien (sans « www. »), ou vide si l'adresse est illisible. */
export function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}
