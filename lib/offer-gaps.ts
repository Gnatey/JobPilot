/**
 * Écarts entre une offre et le profil : ce que l'annonce demande (mots-clés, indispensable) et que le profil ne dit nulle part.
 * Logique pure (aucune IA, aucun réseau), testée par tests/offer-gaps.test.ts.
 *
 * Pourquoi : le CV ne peut écrire que ce que le profil dit. Une offre qui parle de « nomenclatures » ou de « gammes » alors que le profil ne
 * les cite pas donne un CV à côté du sujet, sans que personne sache pourquoi. Chaque écart se traite en une phrase :
 * - « Je l'ai fait » : la réponse de la personne est lue par le flux « À compléter » (answerQuestion), qui propose une ligne du profil à valider ;
 * - « Pas fait » : noté sur l'offre, le CV et la lettre ne le revendiquent jamais.
 * Rien n'est inventé : un écart n'est qu'une question posée à la personne.
 */
import type { OfferExtract, Profile } from "./types";
import { STOP } from "./fit";

export type Gap = { term: string; from: "keyword" | "must_have" };
export type GapKind = "yes" | "no";

const MAX_GAPS = 8;
const MAX_TERM = 90;
const MAX_MARKED = 40;

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const words = (s: string) => fold(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 2);
/** Forme comparable d'un mot : pluriel retiré, cinq lettres au plus (« nomenclatures » = « nomenclature », « bases » = « base »). */
const key = (w: string) => {
  const s = w.length > 4 && /[sx]$/.test(w) ? w.slice(0, -1) : w;
  return s.length <= 4 ? s : s.slice(0, 5);
};

/** Mots d'une exigence qui ne disent rien de la compétence demandée (« bonne maîtrise de… », « première expérience »). */
const GENERIC_ASK = new Set([
  "maitrise", "maitriser", "connaissance", "connaissances", "bonne", "bon", "bonnes", "avancee", "avance", "avancees", "solide", "solides", "experience", "experiences",
  "premiere", "premier", "capacite", "aptitude", "sens", "esprit", "niveau", "minimum", "annee", "annees", "atout", "apprecie", "appreciee", "souhaite", "souhaitee",
  "requis", "requise", "necessaire", "notion", "notions", "familiarite", "comprehension", "autonomie", "rigueur", "domaine", "environnement", "equipe", "equipes",
  "poste", "mission", "missions", "profil", "plus", "tres", "bien", "une", "etre", "avoir", "faire", "gerer", "assurer", "realiser", "participer", "veiller",
]);
/** Une exigence de diplôme ou d'années d'expérience n'est pas une compétence à raconter : le profil la montre par la formation ou les dates. */
const NOT_A_SKILL = /\bbac\b|\bbts\b|\bdut\b|\bbachelor\b|\bmba\b|\blicence\b|\bmiage\b|diplom|\bmaster\b(?!\s+data)|\bdoctorat\b|\d+\s*(?:[-–/]\s*\d+\s*)?(?:ans?|annees?|mois)\b|\ban(s|nees?)? d.?exp|experience de \d/i;
/** Un montant, une fourchette de salaire. */
const MONEY = /€|\beuros?\b|\d\s*k\b|\bsalaire\b|\bremuneration\b/i;
/** Des mots qui disent un type de contrat, un rythme ou une durée, jamais une compétence (tous les mots du terme doivent en faire partie). */
const NON_SKILL_WORDS = new Set([
  "cdi", "cdd", "stage", "stagiaire", "alternance", "apprentissage", "interim", "freelance", "portage", "temps", "plein", "partiel", "full", "time", "part",
  "remote", "teletravail", "hybride", "presentiel", "hf", "fh", "mf", "mois", "semaine", "semaines", "jour", "jours", "an", "ans", "annee", "annees",
  "brut", "net", "annuel", "annuels", "mensuel", "eur", "euro", "euros", "salaire", "remuneration", "de", "par", "et", "a",
]);
const containsSeq = (hay: string[], needle: string[]) => needle.length > 0 && hay.some((_, i) => needle.every((w, j) => hay[i + j] === w));

/**
 * Ce que l'IA range parfois dans les mots-clés alors que ce n'est pas une compétence : le type de contrat (« CDI »), une durée (« 1-2 ans »), un salaire
 * (« 40 000 € - 45 000 € »), un diplôme (« MIAGE »), un code, et ce que la fiche dit déjà du lieu, du contrat, du télétravail, du niveau, du salaire ou de l'entreprise
 * (« Nucourt »). Demander « tu connais Nucourt ? » n'a aucun sens (retour de Juliana, 16 novembre 2026, sur l'offre LHH).
 */
export function notASkill(term: string, x: Partial<OfferExtract> | null | undefined): boolean {
  if (NOT_A_SKILL.test(fold(term)) || MONEY.test(term)) return true;
  if (/^[\d\s.,/+\-–()%€]+$/.test(term)) return true;
  const w = words(term);
  if (w.length && w.every((k) => NON_SKILL_WORDS.has(k))) return true;
  if (!x) return false;
  for (const f of [x.location, x.contract, x.remote, x.seniority, x.salary]) {
    if (typeof f === "string" && f.trim() && containsSeq(words(f), w)) return true;
  }
  return typeof x.company === "string" && !!x.company.trim() && sameTerm(x.company, term);
}

/** Un point qu'un simple « Oui, je connais » peut ajouter aux compétences du profil : un mot-clé court, jamais une phrase d'exigence. */
export function canAddAsSkill(term: string, from: Gap["from"]): boolean {
  const t = term.replace(/\s+/g, " ").trim();
  return from === "keyword" && t.length >= 2 && t.length <= 40 && t.split(" ").length <= 5;
}
/** Catégorie du profil où atterrit un « Oui » sans détail (la personne la déplace ensuite dans Profil si elle veut). */
export const GAP_SKILL_CATEGORY = "Autres compétences";

/** Tout ce que le profil dit de ce que la personne sait faire : expériences, projets, compétences, formations, certifications. */
export function profileKeys(p: Profile): Set<string> {
  const parts: string[] = [];
  for (const e of p.experiences ?? []) {
    parts.push(e.role, e.company, e.sector ?? "", e.type ?? "");
    for (const a of e.achievements ?? []) parts.push(a.text, ...(a.tags ?? []));
  }
  for (const e of p.education ?? []) parts.push(e.degree, e.school, ...(e.details ?? []));
  for (const pr of p.projects ?? []) parts.push(pr.name, pr.description, ...(pr.tags ?? []));
  for (const [cat, items] of Object.entries(p.skills ?? {})) parts.push(cat, ...(items ?? []));
  parts.push(...(p.certifications ?? []));
  return new Set(words(parts.join(" ")).map(key));
}

/** Mots distinctifs d'une exigence (sans mots vides ni mots génériques), sous leur forme comparable. */
function distinctive(term: string): string[] {
  return [...new Set(words(term).filter((w) => !STOP.has(w) && !GENERIC_ASK.has(w)).map(key))];
}

const sameTerm = (a: string, b: string) => fold(a).replace(/[^a-z0-9]+/g, " ").trim() === fold(b).replace(/[^a-z0-9]+/g, " ").trim();

/** Écarts déjà traités sur cette offre (listes nettoyées). */
export function gapsState(extracted: unknown): { yes: string[]; no: string[] } {
  const g = (extracted as { gaps?: { yes?: unknown; no?: unknown } } | null | undefined)?.gaps;
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()).map((x) => x.trim().slice(0, MAX_TERM)) : []);
  return { yes: list(g?.yes), no: list(g?.no) };
}

/** Ce que la personne dit ne pas avoir fait : à donner aux IA qui rédigent (« ne le revendique jamais »). */
export const refusedTerms = (extracted: unknown): string[] => gapsState(extracted).no;

/**
 * Les écarts de l'offre : mots-clés d'abord (dans l'ordre de l'annonce), puis exigences de « Indispensable ».
 * Un mot-clé est couvert quand tous ses mots distinctifs sont dans le profil (les deux tiers à partir de trois mots) ;
 * une phrase d'exigence quand la moitié l'est. Les écarts déjà traités (`gaps.yes` / `gaps.no`) ne reviennent pas. 8 au plus.
 */
export function offerGaps(extracted: Partial<OfferExtract> | null | undefined, profile: Profile, max = MAX_GAPS): Gap[] {
  if (!extracted) return [];
  const have = profileKeys(profile);
  const done = gapsState(extracted);
  const handled = (t: string) => [...done.yes, ...done.no].some((d) => sameTerm(d, t));
  const out: Gap[] = [];
  const listed = new Set<string>();

  const consider = (raw: unknown, from: Gap["from"]) => {
    if (typeof raw !== "string") return;
    const term = raw.replace(/\s+/g, " ").trim().replace(/^[-–•*·]\s+/, "").slice(0, MAX_TERM);
    if (term.length < 2 || handled(term) || out.some((g) => sameTerm(g.term, term))) return;
    if (notASkill(term, extracted)) return;
    const ks = distinctive(term);
    if (!ks.length) return;
    const found = ks.filter((k) => have.has(k)).length;
    const need = from === "keyword" ? (ks.length >= 3 ? Math.ceil(ks.length * 0.67) : ks.length) : Math.ceil(ks.length * 0.5);
    if (found >= need) return;
    if (from === "must_have" && ks.every((k) => listed.has(k))) return; // déjà couvert par un mot-clé listé
    ks.forEach((k) => listed.add(k));
    out.push({ term, from });
  };

  // l'extrait vient d'une IA : un champ qui n'est pas une liste est ignoré (jamais d'erreur sur la page de l'offre)
  for (const k of Array.isArray(extracted.keywords) ? extracted.keywords : []) consider(k, "keyword");
  for (const m of Array.isArray(extracted.must_have) ? extracted.must_have : []) consider(m, "must_have");
  return out.slice(0, max);
}

/** La question posée à la personne, lue ensuite par le flux « À compléter » (route /api/profile/answer ou /api/offers/:id/gaps). */
export const gapQuestion = (term: string) =>
  `Cette offre demande « ${term.slice(0, MAX_TERM)} », que ton profil ne dit pas. L'as-tu déjà fait ? Où, pour qui, avec quels outils ?`;

/** L'extrait avec un écart de plus noté comme traité (jamais de doublon, 40 au plus par liste, le plus récent gardé). */
export function markGap(extracted: unknown, term: string, kind: GapKind): OfferExtract {
  const x = (extracted && typeof extracted === "object" ? extracted : {}) as OfferExtract;
  const t = term.replace(/\s+/g, " ").trim().slice(0, MAX_TERM);
  const cur = gapsState(x);
  const next = (list: string[]) => [...list.filter((d) => !sameTerm(d, t)), t].slice(-MAX_MARKED);
  const gaps = { yes: kind === "yes" ? next(cur.yes) : cur.yes.filter((d) => !sameTerm(d, t)), no: kind === "no" ? next(cur.no) : cur.no.filter((d) => !sameTerm(d, t)) };
  return { ...x, gaps };
}

/** Consigne pour les prompts du CV et de la lettre : ce que la personne dit ne pas avoir fait n'est jamais écrit comme un acquis. */
export function refusedLine(extracted: unknown): string {
  const no = refusedTerms(extracted);
  if (!no.length) return "";
  return `La personne a dit ne PAS avoir fait : ${no.map((t) => `« ${t} »`).join(", ")}. Ne l'écris jamais comme un acquis, une expérience ni une compétence.`;
}
