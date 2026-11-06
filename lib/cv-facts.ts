import { parsePeriod } from "./cv-format";
import { sameCompany, stemsOf } from "./cv-guard";
import { normText } from "./profile-fix";
import type { CvDoc, Education, Experience, Profile } from "./types";

/**
 * Les FAITS du CV viennent du profil, jamais de l'IA (sans IA, sans réseau, testé).
 *
 * L'IA rédige le titre, le résumé, les puces et l'ordre des compétences. Mais elle ne doit pas décider quelles formations
 * existent (un Bachelor disparu laissait un trou d'un an entre le DUT et le Master), ni changer un intitulé de poste,
 * une date, un nom d'entreprise ou un niveau de langue. Ici, tout cela est remis tel que le profil l'écrit.
 * Seul ce qu'on ne peut pas remettre (un diplôme ou une certification absents du profil, une entreprise inconnue) est signalé dans
 * « notes_for_candidate ». Corriger une erreur de l'IA ne fait aucune note : le CV est juste, c'est tout.
 */

const YEAR = /(?:19|20)\d{2}/g;

/** Dates d'une formation écrites comme sur un CV : « 2023-2025 », « 2023 », « 2023 - en cours ». */
export function educationDates(e: Pick<Education, "start" | "end">): string {
  const s = String(e.start ?? "").trim();
  const n = String(e.end ?? "").trim();
  const years = `${s} ${n}`.match(YEAR) ?? [];
  if (!years.length) return [s, n].filter(Boolean).join(" - ");
  if (n && !(n.match(YEAR) ?? []).length) return `${years[0]} - ${n}`;
  const first = years[0];
  const last = years[years.length - 1];
  return first === last ? first : `${first}-${last}`;
}

/**
 * « OpenClassrooms : Python, SQL, Excel, SQL » devient « OpenClassrooms : Python, SQL, Excel » : un intitulé écrit deux fois dans le profil
 * (cela arrive quand deux listes sont fusionnées) ne se répète pas sur le CV. Les virgules entre parenthèses ne séparent rien.
 */
export function dedupeCert(c: string): string {
  const m = /^([^:()]{1,40}:\s*)([\s\S]*)$/.exec(c);
  const head = m ? m[1] : "";
  const body = m ? m[2] : c;
  const parts: string[] = [];
  let depth = 0, cur = "";
  for (const ch of body) {
    if (ch === "(") depth++;
    if (ch === ")") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) { parts.push(cur); cur = ""; } else cur += ch;
  }
  parts.push(cur);
  const seen = new Set<string>();
  const out = parts.map((x) => x.trim()).filter((x) => { const k = normText(x); if (!k || seen.has(k)) return false; seen.add(k); return true; });
  return head + out.join(", ");
}

const CEFR = /\b[abc][12]\b/;

/**
 * Le niveau tel qu'on l'écrit entre parenthèses sur un CV. Le profil peut porter « B1-B2 (intermédiaire) » : écrit tel quel il donnerait
 * « Anglais (B1-B2 (intermédiaire)) ». On garde le niveau chiffré et on laisse tomber la glose ; sans niveau chiffré, la glose suit une virgule.
 * Un mot de niveau (« Langue maternelle », « Courant ») prend une minuscule ; « B1-B2 » reste tel quel.
 */
export function cleanLevel(level: string | undefined): string {
  let t = (level ?? "").trim().replace(/\s+/g, " ");
  const m = t.match(/^(.*?)\s*\(([^()]*)\)\s*$/);
  if (m?.[1]) t = CEFR.test(normText(m[1])) ? m[1].trim() : `${m[1].trim()}, ${m[2].trim()}`;
  else if (m) t = m[2].trim();
  return /^[A-ZÀ-Ý][a-zà-ÿ]/.test(t) ? t[0].toLowerCase() + t.slice(1) : t;
}

/** « Français (maternel) · Anglais (B1-B2) » */
export const languagesText = (langs: Profile["languages"]): string =>
  (langs ?? []).filter((l) => l?.name?.trim()).map((l) => { const lv = cleanLevel(l.level); return lv ? `${l.name.trim()} (${lv})` : l.name.trim(); }).join(" · ");

/** Coupe « Français (langue maternelle), Anglais (B1-B2) » sur · , ; sans couper ce qui est entre parenthèses. */
function splitLanguages(text: string): string[] {
  const out: string[] = [];
  let depth = 0, cur = "";
  for (const ch of text) {
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    if (depth === 0 && /[·,;|\n]/.test(ch)) { out.push(cur); cur = ""; } else cur += ch;
  }
  return [...out, cur].map((x) => normText(x)).filter(Boolean);
}

const NATIVE = /\b(maternel|maternelle|natif|native|natale|bilingue)\b/;
const stems = (t: string) => t.split(" ").filter((w) => w.length > 2).map((w) => w.slice(0, 4)).sort().join(" ");

/** Même niveau ? Niveaux chiffrés (B1-B2) identiques, ou tous deux « langue maternelle », ou mêmes mots. */
function sameLevel(p: string, c: string): boolean {
  const codes = (t: string) => [...new Set(t.match(new RegExp(CEFR.source, "g")) ?? [])].sort().join(",");
  if (codes(p) || codes(c)) return codes(p) === codes(c);
  if (NATIVE.test(p) || NATIVE.test(c)) return NATIVE.test(p) === NATIVE.test(c);
  return stems(p) === stems(c);
}

/**
 * Les langues du CV disent-elles la même chose que le profil ? Mêmes langues, mêmes niveaux, quelle que soit la façon de l'écrire
 * (« Français (maternel) » = « Français (Langue maternelle) », « B1‑B2 » = « B1-B2 (intermédiaire) », ordre libre). Une langue en trop,
 * une langue absente ou un autre niveau (C1 au lieu de B1-B2) = différent.
 */
export function sameLanguages(cvText: string, langs: Profile["languages"]): boolean {
  const prof = (langs ?? []).filter((l) => l?.name?.trim());
  const segs = splitLanguages(cvText ?? "");
  const used = new Set<number>();
  for (const l of prof) {
    const name = normText(l.name);
    const i = segs.findIndex((s, k) => !used.has(k) && (s === name || s.startsWith(name + " ")));
    if (i < 0) return false;
    used.add(i);
    if (!sameLevel(normText(l.level ?? ""), segs[i].slice(name.length).trim())) return false;
  }
  return used.size === segs.length;
}

const periodOf = (p: Experience) => [p.start, p.end].filter(Boolean).join(" - ");
/** Même début et même fin, quelle que soit la façon de l'écrire (« Sept 2022 – Sept 2023 » = « sept. 2022 - sept. 2023 »). */
const samePeriod = (a: string, b: string) => {
  const x = parsePeriod(a);
  const y = parsePeriod(b);
  return !!x && !!y && x.start === y.start && x.end === y.end;
};
/** Part des mots de `a` qu'on retrouve dans `b`. */
const share = (a: string, b: string) => {
  const sa = stemsOf(a);
  const sb = stemsOf(b);
  return sa.size ? [...sa].filter((x) => sb.has(x)).length / sa.size : 0;
};

const GROUNDED = 0.6;

export type FactsReport = {
  /** Formations du profil que l'IA avait laissées de côté (remises). */
  restored: string[];
  /** Formations écrites par l'IA mais absentes du profil (retirées). */
  inventedEducation: string[];
  roles: { company: string; from: string; to: string }[];
  dates: { company: string; from: string; to: string }[];
  /** Certifications absentes du profil (retirées). */
  inventedCerts: string[];
  /** Entreprises du CV qui ne sont dans aucune expérience du profil (laissées, signalées). */
  unknownCompanies: string[];
  languages: boolean;
};

export function enforceFacts(cv: CvDoc, profile: Profile): { cv: CvDoc; report: FactsReport } {
  const report: FactsReport = { restored: [], inventedEducation: [], roles: [], dates: [], inventedCerts: [], unknownCompanies: [], languages: false };
  const notes: string[] = [];

  /* Formations : TOUTES celles du profil, avec leurs dates. Un trou entre deux diplômes se voit tout de suite sur un CV. */
  const profEdu = (profile.education ?? []).filter((e) => e?.degree?.trim());
  let education = cv.education ?? [];
  if (profEdu.length) {
    const eduText = profEdu.map((e) => `${e.degree} ${e.school ?? ""}`).join(" ");
    for (const x of education) {
      if (x.degree && share(x.degree, eduText) < GROUNDED) {
        report.inventedEducation.push(x.degree);
        notes.push(`J'ai retiré la formation « ${x.degree} » : elle ne figure pas dans ton profil.`);
      }
    }
    const had = education.map((x) => normText(x.degree));
    report.restored = profEdu.filter((e) => !had.some((h) => h && (h === normText(e.degree) || h.includes(normText(e.degree)) || normText(e.degree).includes(h)))).map((e) => e.degree.trim());
    education = profEdu.map((e) => ({ degree: e.degree.trim(), school: (e.school ?? "").trim(), dates: educationDates(e) }));
  }

  /* Expériences : entreprise, poste, lieu et dates du profil (les puces restent celles de l'IA). */
  const used = new Set<Experience>();
  const experiences = (cv.experiences ?? []).map((e) => {
    const cands = (profile.experiences ?? []).filter((p) => !used.has(p) && sameCompany(p.company, e.company));
    if (!cands.length) {
      report.unknownCompanies.push(e.company);
      notes.push(`« ${e.company} » ne correspond à aucune expérience de ton profil : à vérifier.`);
      return e;
    }
    // Deux postes dans la même entreprise : on prend celui dont la période, puis l'intitulé, ressemble le plus
    const best = cands.map((p) => ({ p, score: (samePeriod(e.dates, periodOf(p)) ? 2 : 0) + share(p.role, e.role) })).sort((a, b) => b.score - a.score)[0].p;
    used.add(best);
    const role = best.role?.trim() ? best.role.trim() : e.role;
    if (normText(role) !== normText(e.role)) report.roles.push({ company: best.company, from: e.role, to: role });
    const period = periodOf(best);
    const keepDates = samePeriod(e.dates, period) || !parsePeriod(period);
    if (!keepDates) report.dates.push({ company: best.company, from: e.dates, to: period });
    return { ...e, company: best.company.trim() || e.company, role, location: best.location?.trim() || e.location, dates: keepDates ? e.dates : period };
  });

  /* Langues : celles du profil, avec leur niveau. */
  const languages = languagesText(profile.languages);
  if (!sameLanguages(cv.languages ?? "", profile.languages)) report.languages = true;

  /* Certifications : seulement celles du profil (l'IA en choisit, elle n'en crée pas). Un intitulé écrit deux fois n'apparaît qu'une fois. */
  const certPool = (profile.certifications ?? []).join(" ");
  const seenCerts = new Set<string>();
  const certifications = (cv.certifications ?? []).filter((c) => {
    if (!c?.trim() || share(c, certPool) >= GROUNDED) return !!c?.trim();
    report.inventedCerts.push(c);
    notes.push(`J'ai retiré la certification « ${c} » : elle ne figure pas dans ton profil.`);
    return false;
  }).map(dedupeCert).filter((c) => { const k = normText(c); if (seenCerts.has(k)) return false; seenCerts.add(k); return true; });

  const have = cv.notes_for_candidate ?? [];
  return { cv: { ...cv, education, experiences, languages, certifications, notes_for_candidate: [...have, ...notes.filter((n) => !have.includes(n))] }, report };
}
