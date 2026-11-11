/**
 * Titre du CV (« headline ») : celui de l'OFFRE, pas un titre choisi par l'IA (7 novembre, retour de Juliana : offre « Administrateur base de données H/F »
 * chez Klesia, CV intitulé « Data Engineer »). Sa règle de profil : « Un seul titre de poste, aligné sur l'intitulé de l'offre ». Dans son export, la
 * MÊME offre Klesia avait déjà deux CV avec deux titres (« Administrateur Base de Données », « Data Analyst ») : le prompt laissait l'IA juger si
 * l'offre « correspond au profil » et, sinon, prendre le titre de la cible. Logique pure, testée par tests/cv-title.test.ts.
 *
 * - `cleanOfferTitle` : l'intitulé de l'offre débarrassé de « H/F », des parenthèses, du lieu et du reste après « - » (« Data Analyst - Data Services Factory (F/H) » donne « Data Analyst »).
 * - `alignHeadline` : remplace le titre de l'IA par cet intitulé, sauf pour une offre qui vise un niveau senior (le profil est junior : on ne s'intitule pas « Senior »).
 * - `sameTitle` : deux titres désignent-ils le même métier ? Sert au contrôle des CV déjà enregistrés (lib/cv-check.ts).
 */
import { norm } from "./offers-filter";

/** « H/F », « F/H », « M/F », « H/F/X », avec ou sans parenthèses, séparés par / ou un point. */
const GENDER = /\(?(?<![\p{L}\d])[hfm]\s*[/.]\s*[hfmwx](?:\s*[/.]\s*[hfmwx])?(?![\p{L}\d])\)?/giu;
/** Niveau que le profil (junior) n'a pas. */
const SENIOR = /(?<![\p{L}\d])(s[eé]nior|confirm[eé]e?s?|exp[eé]riment[eé]e?s?|lead|expert|principal|head of|directeur|directrice)(?![\p{L}\d])/iu;
/** Étiquette collée devant le métier par un titre de page ou un site : « Emploi - », « Offre d'emploi : », « CDI - ». Seulement suivie d'un séparateur : « Stage data analyst » reste entier. */
const LEADING_LABEL = /^\s*(?:offre\s+d['’]\s*emploi|offre\s+de\s+stage|offre|emploi|annonce|job|recrutement|cdd|cdi|int[eé]rim|stage|alternance)\s+[-–—|:/]\s+(?=\S)/i;
/** Il ne reste que l'étiquette (« Emploi - H/F ») : ce n'est pas un métier, le titre de l'IA est gardé. */
const BARE_LABEL = /^(?:offre(?:\s+d['’]\s*emploi)?|emploi|annonce|job|recrutement|cdd|cdi|int[eé]rim|stage|alternance)$/i;
/** Segment de fin qui nomme le site ou l'espace recrutement, pas le métier : « BPCE Recrutement », « Acme Carrières », « Careers ». */
const SITE_SEGMENT = /(?<![\p{L}\d])(?:recrutement|carri[eè]res?|careers?|jobs?|emploi|offres?\s+d['’]emploi)(?![\p{L}\d])/iu;
/** Type de contrat resté au bout du métier : « Data scientist CDD », « Data scientist CDI 12 mois ». */
const TRAILING_CONTRACT = /\s+(?:cdd|cdi|int[eé]rim)(?:\s+(?:de\s+)?\d+\s*(?:mois|ans?))?\s*$/i;
const SMALL = new Set(["de", "des", "du", "la", "le", "les", "en", "et", "d", "l", "à", "a", "au", "aux", "pour", "sur", "dans", "par"]);
export const MAX_TITLE = 70;

export const isSeniorTitle = (t: string) => SENIOR.test(t);

/** « ADMINISTRATEUR BASE DE DONNÉES » devient « Administrateur Base de Données » ; un titre déjà en minuscules et majuscules n'est pas touché. */
function sentenceCase(t: string): string {
  if (t !== t.toUpperCase() || t === t.toLowerCase()) return t;
  return t.toLowerCase().split(" ").map((w, i) => (i > 0 && SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(" ");
}

/** Intitulé de l'offre prêt à servir de titre de CV, ou « » si on n'en tire rien de propre (vide, trop long). */
export function cleanOfferTitle(raw: string | null | undefined): string {
  let t = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  t = t.replace(GENDER, " ");
  t = t.replace(/\((?!(?:e|es|ne|se|ère|rice)\))[^)]*\)/gi, " "); // (France entière), (Talentsoft)… sauf les marques de genre « (e) »
  t = t.replace(/(?<![\p{L}\d])full[\s-]?remote(?![\p{L}\d])/giu, " ");
  // Titre de page d'un site de recrutement (« Emploi - Data scientist CDD (F/H) - BPCE Recrutement », 11 novembre) : le mot d'étiquette devant le métier n'en fait pas partie
  while (LEADING_LABEL.test(t)) t = t.replace(LEADING_LABEL, "");
  // Le métier est avant le premier séparateur (« - », « – », « | », « : », « / » entourés d'espaces) : le reste est un lieu, un service, un second métier
  let segs = t.split(/\s+[-–—|:/]\s+|\s*[|]\s*/).map((s) => s.trim()).filter(Boolean);
  // …ou le nom du site qui publie (« BPCE Recrutement », « Acme Carrières ») : retiré même quand le métier tient en un mot
  const before = segs.length;
  while (segs.length > 1 && SITE_SEGMENT.test(segs[segs.length - 1])) segs = segs.slice(0, -1);
  if (segs.length > 1 && segs[0].split(" ").length >= 2) t = segs[0];
  else if (segs.length && segs.length < before) t = segs.join(" - "); // le séparateur d'origine est gardé sinon : « Data / AI Analyst » ne change pas
  t = t.replace(TRAILING_CONTRACT, "");
  t = t.replace(/\s+/g, " ").replace(/^[\s\-–—,.:;/]+|[\s\-–—,.:;/]+$/g, "").trim();
  if (t.length < 3 || t.length > MAX_TITLE || BARE_LABEL.test(t)) return "";
  return sentenceCase(t);
}

export type Aligned = { headline: string; aligned: boolean; reason: "ok" | "no-title" | "senior"; offerTitle: string };

/** Le titre du CV devient l'intitulé de l'offre. Offre sans titre exploitable ou visant un niveau senior : le titre de l'IA reste (et `reason` le dit). */
export function alignHeadline(aiHeadline: string | null | undefined, offerTitle: string | null | undefined): Aligned {
  const keep = String(aiHeadline ?? "").trim();
  const t = cleanOfferTitle(offerTitle);
  if (!t) return { headline: keep, aligned: false, reason: "no-title", offerTitle: "" };
  if (isSeniorTitle(t)) return { headline: keep, aligned: false, reason: "senior", offerTitle: t };
  return { headline: t, aligned: true, reason: "ok", offerTitle: t };
}

/** Racine d'un mot : sans accents, sans pluriel ni « e » final (« Bases » et « Base », « analyste » et « analyst » se rejoignent). */
const stem = (w: string) => norm(w).replace(/[^a-z0-9]/g, "").replace(/(?:es|s|x|e)$/, "");
const tokens = (t: string) => new Set(norm(t).replace(/'/g, " ").split(/[^a-z0-9]+/).filter((w) => w && !SMALL.has(w)).map(stem).filter(Boolean));

/** Même métier : tous les mots de l'un se retrouvent dans l'autre (« Data Analyst » et « Data Analyst Junior », « Base » et « Bases »). Un titre vide ne correspond à rien. */
export function sameTitle(a: string | null | undefined, b: string | null | undefined): boolean {
  const ta = tokens(cleanOfferTitle(a) || String(a ?? ""));
  const tb = tokens(cleanOfferTitle(b) || String(b ?? ""));
  if (!ta.size || !tb.size) return false;
  const [small, big] = ta.size <= tb.size ? [ta, tb] : [tb, ta];
  return [...small].every((w) => big.has(w));
}

/**
 * CV réutilisé pour une AUTRE offre (route generate, `reuse_id`) : le contenu est copié tel quel, donc le titre resterait celui de la première offre
 * (un CV « Data Engineer » copié sur une offre « Administrateur base de données »). Renvoie une copie dont le titre est celui de la nouvelle offre
 * (sauf offre de niveau senior ou sans titre exploitable : titre inchangé). Le CV source n'est jamais modifié.
 */
export function withOfferTitle<T extends { headline?: string }>(cv: T, offerTitle: string | null | undefined): T {
  if (!cv || typeof cv !== "object") return cv;
  const a = alignHeadline(cv.headline, offerTitle);
  return a.aligned ? { ...cv, headline: a.headline } : cv;
}
