import type { CvDoc, Profile } from "./types";

/* Mise en forme commune des CV : nom du fichier, ordre des dates, coordonnées et liens cliquables. Aucune dépendance à React. */

type Id = Profile["identity"];
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/* ---------- Nom du fichier ---------- */

/** « Juliana NIAPOH » → prénom « Juliana », nom « NIAPOH » (le nom est le groupe de mots en majuscules, sinon le dernier mot). */
export function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return { first: parts[0] ?? "", last: "" };
  const upper = (w: string) => w.length > 1 && w === w.toUpperCase() && w !== w.toLowerCase();
  const caps = parts.filter(upper);
  if (caps.length && caps.length < parts.length) return { first: parts.filter((w) => !upper(w)).join(" "), last: caps.join(" ") };
  return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] };
}

const part = (s: string) => fold(s).replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

/** Intitulé de poste réduit à l'essentiel : sans « H/F », sans lieu ni contrat après un tiret, 6 mots maximum. */
export function jobTitleForFile(title: string): string {
  let t = title
    .replace(/\((?:e|es|s|se|ère|rice|euse|trice)\)/gi, "")
    .replace(/\(?\s*\b(?:h\s*\/\s*f|f\s*\/\s*h|h\s*\/\s*f\s*\/\s*x|m\s*\/\s*f\s*\/\s*d|m\s*\/\s*w\s*\/\s*d)\b\s*\)?/gi, " ")
    .split(/\s[-–—|:]\s|\s\(|,|\s\/\s/)[0]
    .trim();
  const words = t.split(/\s+/).filter(Boolean).slice(0, 6);
  t = words.join(" ");
  if (t.length > 45) t = t.slice(0, 45).replace(/\s+\S*$/, "");
  return part(t);
}

const PREFIX: Record<string, string> = { cv: "CV", lettre: "Lettre_motivation", prep: "Preparation_entretien", relance: "Relance" };

/** Ex. : CV_NIAPOH_Juliana_Data_Analyst. Lisible par n'importe qui, sans accent ni espace (les logiciels de recrutement et les messageries n'aiment pas ça). */
export function docFileName(kind: string, identity: Id, offerTitle?: string | null, headline?: string | null): string {
  const { first, last } = splitName(identity.name || "");
  return [PREFIX[kind] ?? "Document", part(last), part(first), jobTitleForFile(offerTitle || headline || "")].filter(Boolean).join("_");
}

/* ---------- Ordre chronologique (le plus récent d'abord) ---------- */

const MONTHS: Record<string, number> = {
  janv: 1, jan: 1, janvier: 1, january: 1, fevr: 2, fev: 2, fevrier: 2, feb: 2, february: 2, mars: 3, mar: 3, march: 3, avr: 4, avril: 4, apr: 4, april: 4,
  mai: 5, may: 5, juin: 6, jun: 6, june: 6, juil: 7, juillet: 7, jul: 7, july: 7, aout: 8, aug: 8, august: 8, sept: 9, sep: 9, septembre: 9, september: 9,
  oct: 10, octobre: 10, october: 10, nov: 11, novembre: 11, november: 11, dec: 12, decembre: 12, december: 12,
};
const OPEN = /pr[eé]sent|aujourd|actuel|en cours|ce jour|maintenant|now|current|to date|depuis|since|\bà ce\b/i;

/** Début et fin d'une période écrite à la main (« Sept 2022 - Sept 2023 », « 2024 - présent »), en mois. null si aucune année n'est lisible. */
export function parsePeriod(text: string): { start: number; end: number } | null {
  const t = fold(String(text ?? "")).toLowerCase().replace(/\./g, " ");
  const found: { y: number; m: number | null }[] = [];
  const re = /(?:\b([a-z]{3,9})\s+)?\b((?:19|20)\d{2})\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) found.push({ y: +m[2], m: m[1] && MONTHS[m[1]] ? MONTHS[m[1]] : null });
  if (!found.length) return null;
  const a = found[0], b = found[1];
  const start = a.y * 12 + (a.m ?? 1);
  if (!b && OPEN.test(String(text ?? ""))) return { start, end: Number.POSITIVE_INFINITY }; // « 2024 - présent », « depuis 2024 »
  const last = b ?? a;
  return { start, end: last.y * 12 + (last.m ?? 12) };
}

/** Indices triés du plus récent au plus ancien. Si une date est illisible, l'ordre d'origine est conservé (on ne devine pas). */
export function recentFirst<T>(items: T[], dates: (x: T) => string): number[] {
  const idx = items.map((_, i) => i);
  const per = items.map((x) => parsePeriod(dates(x)));
  if (per.some((p) => !p)) return idx;
  return idx.sort((i, j) => {
    const a = per[i]!, b = per[j]!;
    if (a.end !== b.end) return a.end === Number.POSITIVE_INFINITY ? -1 : b.end === Number.POSITIVE_INFINITY ? 1 : b.end - a.end;
    return b.start - a.start || i - j;
  });
}

export const experiencesRecentFirst = (cv: CvDoc) => recentFirst(cv.experiences, (e) => e.dates).map((i) => ({ x: cv.experiences[i], i }));
export const educationRecentFirst = (cv: CvDoc) => recentFirst(cv.education, (e) => e.dates).map((i) => cv.education[i]);
/** Même ordre, avec la place de la formation dans le CV (pour la modifier à l'écran). */
export const educationEntries = (cv: CvDoc) => recentFirst(cv.education, (e) => e.dates).map((i) => ({ e: cv.education[i], i }));

/* ---------- Coordonnées et liens ---------- */

export type Item = { text: string; href?: string };

export function contactItems(id: Id): Item[] {
  const out: Item[] = [];
  if (id.email) out.push({ text: id.email, href: `mailto:${id.email}` });
  if (id.phone) out.push({ text: id.phone, href: `tel:${id.phone.replace(/[^\d+]/g, "")}` });
  if (id.city) out.push({ text: id.city });
  if (id.mobility) out.push({ text: `Mobilité : ${id.mobility}` });
  return out;
}

type Link = { label: string; url: string };

/** Les trois liens attendus sur tout CV passent toujours en premier : LinkedIn, puis le portfolio, puis GitHub. */
const coreRank = (l: Link): number => {
  const s = `${l.label} ${l.url}`.toLowerCase();
  if (/linkedin/.test(s)) return 0;
  if (/portfolio|behance|dribbble|site\s*perso|mon\s*site/.test(s)) return 1;
  if (/github|gitlab/.test(s)) return 2;
  return 3;
};

const urlKey = (u: string) => u.trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/[/?#]+$/, "");
const STOP = new Set(["avec", "pour", "dans", "chez", "votre", "vous", "nous", "les", "des", "une", "est", "sur", "par", "plus", "cette", "site", "https", "http", "www", "vercel", "netlify", "streamlit", "github", "itch", "app", "com", "fr", "io", "html"]);
/** Radical court (4 lettres) : « recette », « recettes » et « recettage » se retrouvent. */
const stems = (s: string) => new Set(fold(s).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !STOP.has(w)).map((w) => w.slice(0, 4)));

/**
 * Choisit les liens d'un CV : LinkedIn, portfolio et GitHub d'abord, puis ceux qui parlent de l'offre
 * (un lien « Cahier de recettes » pour une offre de test, par exemple), puis le reste dans l'ordre du profil.
 * Aucun lien n'est écarté pour son nom : seul le nombre d'emplacements limite.
 */
export function pickLinks(links: Link[], hint = "", max = 4): Link[] {
  const want = stems(hint);
  const seen = new Set<string>();
  const clean = (links ?? []).filter((l) => l && l.url && l.url.trim()).filter((l) => {
    const k = urlKey(l.url);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const score = (l: Link) => { let n = 0; for (const w of stems(`${l.label} ${l.url}`)) if (want.has(w)) n++; return n; };
  return clean
    .map((l, i) => ({ l, i, r: coreRank(l), sc: score(l) }))
    .sort((a, b) => (a.r < 3 || b.r < 3 ? a.r - b.r : b.sc - a.sc) || a.i - b.i)
    .slice(0, Math.max(0, max))
    .map(({ l }) => l);
}

export const nameKey = (s: string) => fold(s).toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Ajoute au CV généré ce que l'IA n'a pas à inventer : le lien de chaque projet (repris du profil) et les liens de l'en-tête,
 * choisis selon l'offre. Aucune URL n'est jamais écrite par l'IA.
 */
export function attachLinks(cv: CvDoc, profile: Profile, hint: string): CvDoc {
  const known = profile.projects ?? [];
  const find = (name: string) => {
    const k = nameKey(name);
    if (k.length < 3) return undefined;
    return known.find((p) => nameKey(p.name) === k) ?? known.find((p) => { const q = nameKey(p.name); return q.length >= 3 && (q.includes(k) || k.includes(q)); });
  };
  return {
    ...cv,
    projects: (cv.projects ?? []).map((p) => { const link = find(p.name)?.link?.trim(); return link ? { ...p, link } : p; }),
    links: pickLinks(profile.identity?.links ?? [], `${hint} ${cv.headline ?? ""} ${(cv.ats_keywords_used ?? []).join(" ")}`, 4),
  };
}

/** Liens affichés en en-tête, chacun cliquable. `chosen` : ceux déjà choisis pour ce CV au moment de sa création. */
export function linkItems(id: Id, max = 4, chosen?: Link[]): Item[] {
  const src = chosen?.length ? pickLinks(chosen, "", max) : pickLinks(id.links ?? [], "", max);
  return src.map((l) => {
    const url = l.url.trim();
    return { text: url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""), href: /^https?:\/\//i.test(url) ? url : `https://${url}` };
  });
}

/* ---------- Langues, certifications, centres d'intérêt : chacun sur sa ligne, avec son étiquette ---------- */

export const certText = (c: string) => c.replace(/\s*:\s*/, " – ");

export type TailLine = { label: string; text: string; field: "languages" | "certifications" | "extras" };

export function tailLines(cv: CvDoc): TailLine[] {
  const out: TailLine[] = [];
  if (cv.languages?.trim()) out.push({ label: "Langues", text: cv.languages.trim(), field: "languages" });
  const certs = (cv.certifications ?? []).filter(Boolean).map(certText);
  if (certs.length) out.push({ label: certs.length > 1 ? "Certifications" : "Certification", text: certs.join(" · "), field: "certifications" });
  if (cv.extras?.trim()) out.push({ label: "Centres d'intérêt", text: cv.extras.trim(), field: "extras" });
  return out;
}

/** Titre de la rubrique selon ce qu'elle contient (jamais « certifications » s'il n'y en a pas). */
export function tailTitle(cv: CvDoc): string {
  const names = tailLines(cv).map((l) => (l.label.startsWith("Certification") ? "certifications" : l.label === "Langues" ? "langues" : "centres d'intérêt"));
  if (!names.length) return "";
  const s = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} et ${names[names.length - 1]}`;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
