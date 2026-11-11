import type { Profile } from "./types";
import { quickScore } from "./quick-score";

/**
 * « Cette offre est-elle faite pour toi ? » — le filtre qui garde hors de ta liste ce que tu n'as pas demandé :
 * stages et alternances si tu n'as pas coché ces contrats, métiers qui n'ont rien à voir avec tes cibles.
 * Gratuit (aucune IA) et sans effet tant que le questionnaire n'est pas rempli : sans réponses, on ne sait pas ce que tu cherches.
 * Une offre masquée n'est jamais supprimée : elle reste récupérable dans Recommandées › Masquées.
 */

export type ContractKind = "stage" | "alternance";

const strip = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/* ---------- Type de contrat ---------- */

// Dans le titre : des mots entiers (« backstage » ne compte pas ; « apprentissage automatique » non plus)
const TITLE_STAGE = /(^|[^a-z])(stages?|stagiaires?|interns?|internships?)(?![a-z])/;
const TITLE_ALT = /alternan(ce|t|te)s?(?![a-z])|(^|[^a-z])apprenti(e|s|es)?(?![a-z])|contrat (d['’ ]?)?apprentissage|en apprentissage|contrat (de )?professionnalisation|contrat pro(?![a-z])|work[- ]?study|apprenticeship/;
// Dans le texte de l'annonce : seulement des formulations sans ambiguïté
const TEXT_STAGE = /convention de stage|dur[ee]e du stage|stage de \d+(\s*(a|à|-)\s*\d+)?\s*(mois|semaines)|stage de fin d['’ ]?etudes|type de contrat\s*:?\s*stage|contrat\s*:\s*stage/;
const TEXT_ALT = /contrat d['’ ]?alternance|contrat d['’ ]?apprentissage|contrat de professionnalisation|poste en alternance|en alternance\b|type de contrat\s*:?\s*(alternance|apprentissage)|contrat\s*:\s*alternance/;

/** Types spéciaux annoncés par l'offre (stage, alternance). Vide = contrat classique ou non précisé. */
export function detectContracts(title: string, text = ""): ContractKind[] {
  const t = strip(title);
  const x = strip(text.slice(0, 6000));
  const out: ContractKind[] = [];
  if (TITLE_STAGE.test(t) || TEXT_STAGE.test(x)) out.push("stage");
  if (TITLE_ALT.test(t) || TEXT_ALT.test(x)) out.push("alternance");
  return out;
}

/** Les types spéciaux acceptés, d'après une liste de contrats (« Stage », « Alternance » ou les codes « STG », « ALT »). */
function acceptedKinds(contracts: string[]): Set<ContractKind> {
  const set = new Set<ContractKind>();
  for (const c of contracts) {
    const x = strip(c);
    if (x === "stg" || x.startsWith("stage")) set.add("stage");
    if (x === "alt" || x.startsWith("altern") || x.startsWith("apprenti")) set.add("alternance");
  }
  return set;
}

/** Contrat classique cité dans le titre ET choisi par la personne (« Data Analyst CDI ou alternance ») : l'offre lui convient. */
function mentionsChosenContract(title: string, contracts: string[]): boolean {
  const t = strip(title);
  const chosen = contracts.map(strip);
  return (
    (/(^|[^a-z])cdi(?![a-z])/.test(t) && chosen.some((c) => c === "cdi")) ||
    (/(^|[^a-z])cdd(?![a-z])/.test(t) && chosen.some((c) => c === "cdd")) ||
    (/interim/.test(t) && chosen.some((c) => c === "interim" || c === "mis")) ||
    (/freelance/.test(t) && chosen.some((c) => c === "freelance" || c === "lib"))
  );
}

/* ---------- Métier ---------- */

const STOP = new Set(["de", "du", "la", "le", "les", "des", "un", "une", "et", "en", "au", "aux", "pour", "the", "and", "of", "to", "for", "hf", "fh", "h", "f", "sur", "chez", "par", "dans", "avec"]);
/** Mots qui ne disent rien du métier : « chef de projet » ne rapproche pas deux métiers. */
const GENERIC = new Set([
  "chef", "projet", "projets", "responsable", "charge", "chargee", "ingenieur", "ingenieure", "consultant", "consultante", "manager", "assistant", "assistante",
  "technicien", "technicienne", "developpeur", "developpeuse", "gestionnaire", "expert", "experte", "senior", "junior", "lead", "adjoint", "adjointe",
  "directeur", "directrice", "agent", "conseiller", "conseillere", "specialiste", "referent", "referente", "stagiaire", "stage", "alternance", "alternant",
  "alternante", "apprenti", "cdi", "cdd", "poste", "equipe", "service", "mission", "confirme", "confirmee", "debutant", "debutante", "france", "paris",
]);
/** Mots de sens voisin, ramenés à une seule forme. */
const CANON: Record<string, string> = {
  analyste: "analyst", analystes: "analyst", analysts: "analyst",
  donnees: "data", donnee: "data", datas: "data",
  decisionnel: "bi", decisionnelle: "bi", decisionnels: "bi",
  scientist: "scientist", scientifique: "scientist",
  ingenieure: "ingenieur", developpeuse: "developpeur", developer: "developpeur", engineer: "ingenieur",
  comptable: "comptable", comptables: "comptable",
};
const canon = (w: string) => CANON[w] ?? w;

/**
 * Expressions longues et leur sigle (11 novembre, Juliana : « consultant SI » ne sortait presque rien) : « SI » n'était reconnu que s'il était écrit tel quel,
 * donc « Consultant Système d'Information » était jugé sans rapport avec la recherche « consultant SI » et masqué comme « éloigné ».
 * Appliqué sur le texte déjà sans accents ni majuscules.
 */
const ACRONYMS: [RegExp, string][] = [
  [/(?<![a-z0-9])systemes?\s+d\W{0,2}\s*informations?(?![a-z0-9])/g, " si "],
  [/(?<![a-z0-9])business\s+intelligence(?![a-z0-9])/g, " bi "],
  [/(?<![a-z0-9])intelligence\s+artificielle(?![a-z0-9])/g, " ia "],
];

/** Mots du titre (2 lettres conservées : « BI », « IA »), sans mots vides, formes voisines unifiées, expressions longues ramenées à leur sigle. */
export function titleTokens(s: string): string[] {
  const t = ACRONYMS.reduce((acc, [re, short]) => acc.replace(re, short), strip(s));
  return t.split(/[^a-z0-9+#]+/).filter((w) => w.length >= 2 && !STOP.has(w)).map(canon);
}
const distinctive = (ws: string[]) => ws.filter((w) => !GENERIC.has(w));

/**
 * Le titre se rapproche-t-il des postes visés ? Oui s'il partage un mot qui dit le métier (data, BI, analyst…).
 * Si les postes visés n'ont que des mots génériques (« Chef de projet »), les mots génériques suffisent.
 */
export function titleMatchesRoles(title: string, roles: string[]): boolean {
  const tw = new Set(titleTokens(title));
  const targets = roles.map(titleTokens).filter((w) => w.length);
  if (!targets.length) return true; // rien à comparer
  return targets.some((rw) => {
    const d = distinctive(rw);
    return (d.length ? d : rw).some((w) => tw.has(w));
  });
}

/** De 0 à 1 : à quel point le titre ressemble au meilleur des postes demandés (part de ses mots-clés présents dans le titre). */
export function roleAffinity(title: string, roles: string[]): number {
  const tw = new Set(titleTokens(title));
  let best = 0;
  for (const role of roles) {
    const rw = titleTokens(role);
    const key = distinctive(rw).length ? distinctive(rw) : rw;
    if (!key.length) continue;
    best = Math.max(best, key.filter((w) => tw.has(w)).length / key.length);
  }
  return best;
}

/* ---------- Verdict ---------- */

export type FitReason = "fit_stage" | "fit_alternance" | "fit_metier";
export type Fit = { ok: true } | { ok: false; reason: FitReason; detail: string };

export const FIT_LABELS: Record<FitReason, string> = {
  fit_stage: "Stage (tu n'as pas coché ce contrat)",
  fit_alternance: "Alternance (tu n'as pas coché ce contrat)",
  fit_metier: "Métier éloigné de tes postes visés",
};
export const isFitReason = (r?: string | null): r is FitReason => r === "fit_stage" || r === "fit_alternance" || r === "fit_metier";
/** Le visiteur a explicitement remis l'offre dans sa liste : le filtre ne la masque plus. */
export const KEPT = "garde";

type Opts = {
  /** Postes du jour (page Recherche) : ils s'ajoutent aux postes du questionnaire. */
  roles?: string[];
  /** Contrats cochés dans une recherche (codes ou libellés) : ils restreignent encore le questionnaire. Vide = pas de restriction. */
  contracts?: string[];
};

/** Les postes visés : ceux du profil + ceux demandés dans la recherche du moment. */
export function targetRoles(profile: Profile, extra: string[] = []): string[] {
  return [...new Set([...(profile.targets ?? []).map((t) => t.title), ...extra].map((s) => s.trim()).filter(Boolean))];
}

export function fitCheck(profile: Profile, offer: { title: string; text?: string }, opts: Opts = {}): Fit {
  const chosen = profile.preferences?.contracts ?? [];
  const text = offer.text ?? "";

  // 1. Contrat : on ne juge que si la personne a dit ce qu'elle voulait
  if (chosen.length) {
    const found = detectContracts(offer.title, text);
    if (found.length) {
      const fromProfile = acceptedKinds(chosen);
      const restrict = opts.contracts?.length ? acceptedKinds(opts.contracts) : null;
      const allowed = (k: ContractKind) => fromProfile.has(k) && (!restrict || restrict.has(k));
      if (!found.some(allowed) && !mentionsChosenContract(offer.title, chosen)) {
        const k = found[0];
        return { ok: false, reason: k === "stage" ? "fit_stage" : "fit_alternance", detail: k === "stage" ? "stage" : "alternance" };
      }
    }
  }

  // 2. Métier : aucun mot en commun avec les postes visés et trop peu de compétences du profil dans l'annonce
  const roles = targetRoles(profile, opts.roles);
  if (roles.length && !titleMatchesRoles(offer.title, roles)) {
    const skills = quickScore(profile, offer.title, text).matched.length;
    if (skills < 3) return { ok: false, reason: "fit_metier", detail: `aucun point commun avec ${roles.slice(0, 3).join(", ")}` };
  }
  return { ok: true };
}

/** Empreinte de ce qui décide du filtre : quand elle change, le stock d'offres est revu une fois. */
export function fitSignature(profile: Profile, roles: string[] = []): string {
  const p = profile.preferences ?? ({} as Profile["preferences"]);
  const raw = JSON.stringify([
    [...(p.contracts ?? [])].sort(), (profile.targets ?? []).map((t) => t.title).sort(), [...roles].sort(), p.max_years ?? null, "v1",
  ]);
  let h = 2166136261;
  for (let i = 0; i < raw.length; i++) { h ^= raw.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}
