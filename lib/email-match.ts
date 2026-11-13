/**
 * Rapprochement d'un email avec une candidature suivie, et statut qui en découle.
 * Pur (aucun réseau) : testé à part. Principe : en cas de doute, on ne touche à aucune carte (un mail non rangé se corrige d'un clic,
 * une candidature passée « Refusée » à tort disparaît du suivi sans que personne le voie).
 */

export type AppRef = { id: string; company: string; title: string; status: string };
export type MailRef = { company: string; subject: string; snippet: string; jobTitle?: string; category: string };
export type Match<A extends AppRef = AppRef> = { app: A; exact: boolean; titled: boolean };

const flat = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const words = (s: string) => flat(s).split(/[^a-z0-9]+/).filter(Boolean);

/* ---------- Statuts ---------- */

const RANK: Record<string, number> = { a_postuler: 0, postule: 1, relance: 2, entretien: 3, test: 4, offre: 5, refuse: 6, abandonne: 6, expiree: 6 };
const TARGET: Record<string, string> = { accuse_reception: "postule", entretien: "entretien", test: "test", offre: "offre", refus: "refuse" };
/** Une candidature n'est « refusée » que si elle a été envoyée et n'est pas déjà tranchée. */
const SENT = ["postule", "relance", "entretien", "test"];
const FINAL = ["refuse", "abandonne", "expiree"];

/** Nouveau statut après un email de cette catégorie, ou null si rien ne doit changer. */
export function nextStatus(cur: string, category: string): string | null {
  const target = TARGET[category];
  if (!target) return null;
  if (target === "refuse") return SENT.includes(cur) ? target : null; // jamais sur une carte « À postuler » : rien n'a été envoyé
  return RANK[target] > (RANK[cur] ?? 0) && cur !== "refuse" ? target : null;
}

/* ---------- Mes propres messages ---------- */

export const fromAddress = (from: string) => (/<([^>]+)>/.exec(from)?.[1] ?? from).trim().toLowerCase();

/** Messages envoyés, brouillons, ou écrits depuis l'adresse connectée : ce ne sont pas des réponses d'un recruteur. */
export function isOwnMail(m: { from: string; labels?: string[] }, own: string) {
  if (m.labels?.some((l) => l === "SENT" || l === "DRAFT")) return true;
  return !!own && fromAddress(m.from) === own.trim().toLowerCase();
}

/* ---------- Entreprise ---------- */

/** Mots qui ne distinguent pas une entreprise d'une autre. */
const NOISE = new Set([
  "sa", "sas", "sarl", "group", "groupe", "france", "francaise", "francais", "international", "the", "de", "du", "des", "la", "le", "les", "et", "and", "of",
  "societe", "cabinet", "consulting", "conseil", "conseils", "services", "service", "solutions", "digital", "technologies", "technology", "tech", "it", "esn", "ssii",
  "recrutement", "rh", "interim", "emploi",
]);

export function companyTokens(name: string): string[] {
  const all = words(name);
  const kept = all.filter((w) => w.length > 1 && !NOISE.has(w));
  return kept.length ? kept : all;
}

/** « exact » : mêmes mots distinctifs ; « partial » : tous les mots de l'une sont dans l'autre (Air / Air Liquide) ; null : entreprises différentes. */
export function companyMatch(a: string, b: string): "exact" | "partial" | null {
  const ta = companyTokens(a), tb = companyTokens(b);
  if (!ta.length || !tb.length) return null;
  if (ta.join("") === tb.join("")) return "exact";
  const [small, big] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  return small.every((w) => big.includes(w)) ? "partial" : null;
}

/* ---------- Intitulé ---------- */

const TITLE_STOP = new Set([
  "de", "du", "des", "la", "le", "les", "un", "une", "et", "en", "pour", "au", "aux", "chez", "cdi", "cdd", "stage", "alternance", "freelance", "interim",
  "poste", "offre", "mission", "junior", "senior", "confirme", "debutant", "niveau",
]);
const stem = (w: string) => w.slice(0, 5);

export function titleTokens(title: string): string[] {
  return [...new Set(words(title).filter((w) => w.length > 2 && !TITLE_STOP.has(w)).map(stem))];
}

/** Part des mots de l'intitulé retrouvés dans le mail (objet, extrait, intitulé lu par l'IA). */
function titleScore(title: string, m: MailRef) {
  const ts = titleTokens(title);
  const seen = new Set(words(`${m.jobTitle ?? ""} ${m.subject} ${m.snippet}`).map(stem));
  const hit = ts.filter((t) => seen.has(t)).length;
  const score = ts.length ? hit / ts.length : 0;
  return { of: ts.length, hit, score, proof: ts.length > 0 && hit >= Math.min(2, ts.length) && score >= 0.6 };
}

/* ---------- Choix de la candidature ---------- */

/**
 * La candidature visée par ce mail, ou null. Règles :
 * - même entreprise (mots entiers, jamais « contient ») ;
 * - un refus ne peut viser qu'une candidature envoyée ;
 * - une carte « À postuler » ou une entreprise seulement proche ne sont retenues que si l'intitulé du poste est dans le mail ;
 * - un mail qui nomme un poste dont AUCUN mot n'est dans l'intitulé de la carte vise un autre poste de la même entreprise : aucune carte
 *   (13 novembre : une seule carte « Postulé » chez Storm Group, un mail pour une autre offre de ce recruteur l'a passée en Entretien) ;
 * - plusieurs cartes possibles : on prend celle dont l'intitulé colle nettement le mieux, sinon aucune.
 */
export function matchApplication<A extends AppRef>(apps: A[], m: MailRef): Match<A> | null {
  if (!m.company.trim()) return null;
  const named = !!m.jobTitle?.trim();
  const found = apps.flatMap((app) => {
    const k = companyMatch(app.company, m.company);
    if (!k) return [];
    const t = titleScore(app.title, m);
    return [{ app, exact: k === "exact", otherJob: named && t.of > 0 && t.hit === 0, ...t }];
  });

  const pool = found.filter((c) => {
    if (c.otherJob) return false;
    if (m.category === "refus" && !SENT.includes(c.app.status)) return false;
    return (c.exact && c.app.status !== "a_postuler") || c.proof;
  });
  const live = pool.filter((c) => !FINAL.includes(c.app.status));
  const use = live.length ? live : pool;
  if (!use.length) return null;

  const ranked = [...use].sort((a, b) => b.score - a.score || b.of - a.of || Number(b.exact) - Number(a.exact));
  const [best, second] = ranked;
  if (second) {
    const clear = best.score - second.score >= 0.25 || (best.score === second.score && best.score > 0 && best.of > second.of);
    if (!clear) return null;
  }
  return { app: best.app, exact: best.exact, titled: best.proof };
}
