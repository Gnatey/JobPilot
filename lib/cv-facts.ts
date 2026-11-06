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

/** « Français (maternel) · Anglais (B1-B2) » */
export const languagesText = (langs: Profile["languages"]): string =>
  (langs ?? []).filter((l) => l?.name?.trim()).map((l) => (l.level?.trim() ? `${l.name.trim()} (${l.level.trim()})` : l.name.trim())).join(" · ");

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
  // Mêmes langues et mêmes niveaux, quel que soit l'ordre ou la ponctuation (« Anglais B2, français natif » = « Français (natif) · Anglais (B2) »)
  const words = (t: string) => normText(t).split(" ").filter(Boolean).sort().join(" ");
  if (words(languages) !== words(cv.languages ?? "")) report.languages = true;

  /* Certifications : seulement celles du profil (l'IA en choisit, elle n'en crée pas). */
  const certPool = (profile.certifications ?? []).join(" ");
  const certifications = (cv.certifications ?? []).filter((c) => {
    if (!c?.trim() || share(c, certPool) >= GROUNDED) return !!c?.trim();
    report.inventedCerts.push(c);
    notes.push(`J'ai retiré la certification « ${c} » : elle ne figure pas dans ton profil.`);
    return false;
  });

  const have = cv.notes_for_candidate ?? [];
  return { cv: { ...cv, education, experiences, languages, certifications, notes_for_candidate: [...have, ...notes.filter((n) => !have.includes(n))] }, report };
}
