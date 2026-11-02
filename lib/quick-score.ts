import type { Profile } from "./types";
import type { Learning } from "./learning";

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Sigles de deux lettres qui disent le métier (« BI », « IA ») : ils comptent comme des mots. */
const SHORT = new Set(["bi", "ia", "ai", "ml", "ux", "ui", "rh", "hr"]);
export const words = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9+#]+/).filter((w) => w.length > 2 || SHORT.has(w));

/** Années d'expérience demandées par l'offre (null si non précisé). */
export function requiredYears(text: string): number | null {
  const t = text.toLowerCase();
  if (/d[ée]butant(e)?s? accept|jeune dipl[ôo]m|sans exp[ée]rience|0 ?(à|-) ?2 ans/.test(t)) return 0;
  const m =
    t.match(/(\d{1,2})\s*(?:\+|ans? et plus|ans? minimum|ans? min)/) ??
    t.match(/minimum\s*(?:de\s*)?(\d{1,2})\s*ans?/) ??
    t.match(/(\d{1,2})\s*(?:à|-)\s*\d{1,2}\s*ans?\s*(?:d['’ ]exp|minimum|en|sur|dans)/) ??
    t.match(/(\d{1,2})\s*ans?\s*(?:d['’ ]exp[ée]rience|d['’ ]exp|of experience|years)/) ??
    t.match(/exp[ée]rience\s*(?:de|d['’ ]au moins|minimum)\s*(\d{1,2})\s*ans?/) ??
    t.match(/(\d{1,2})\s*an\(s\)/);
  if (m) return Number(m[1]);
  if (/(^|[^a-z])(senior|lead|head of|directeur|directrice|expert)(?![a-zà-ÿ])/.test(t)) return 5;
  if (/(^|[^a-z])confirm[ée]e?s?(?![a-zà-ÿ])/.test(t)) return 3;
  return null;
}

/**
 * Niveau de pré-tri affiché à la place du pourcentage tant que l'offre n'a pas été analysée par l'IA.
 * Un seul pourcentage existe par offre : celui de l'analyse complète. Le pré-tri, lui, ne sert qu'à classer.
 */
export type PreBand = { id: "top" | "maybe" | "far"; label: string; hint: string };
export function preBand(score: number | null | undefined): PreBand {
  const s = score ?? 0;
  if (s >= 70) return { id: "top", label: "Bonne piste", hint: "Beaucoup de points communs avec ton profil" };
  if (s >= 50) return { id: "maybe", label: "À regarder", hint: "Quelques points communs avec ton profil" };
  return { id: "far", label: "Peu probable", hint: "Peu de points communs avec ton profil" };
}
/** Seuils proposés dans les filtres de tri (même vocabulaire que les pastilles). */
export const PRE_FILTERS = [
  { min: 0, label: "Toutes les offres" },
  { min: 50, label: "À regarder et mieux" },
  { min: 70, label: "Bonnes pistes seulement" },
] as const;

export type Quick = { score: number; matched: string[]; senior: boolean; years: number | null; penalties: string[] };

/**
 * Pré-score gratuit (sans IA) :
 * compétences du profil présentes dans le texte + proximité du titre avec les métiers visés,
 * moins les pénalités apprises des offres écartées et de l'expérience demandée.
 */
const compiled = new WeakMap<Profile, { skills: { name: string; re: RegExp }[]; targetWords: Set<string> }>();
/** Les expressions régulières du profil sont construites une seule fois (la page Recommandées score des centaines d'offres). */
function prepare(profile: Profile) {
  let c = compiled.get(profile);
  if (!c) {
    const names = [...new Set(Object.values(profile.skills).flat().map((s) => s.toLowerCase()))].filter((s) => s.length > 1);
    c = {
      skills: names.map((name) => ({ name, re: new RegExp(`(^|[^a-z0-9])${esc(name)}([^a-z0-9]|$)`) })),
      targetWords: new Set(profile.targets.flatMap((t) => words(t.title))),
    };
    compiled.set(profile, c);
  }
  return c;
}

export function quickScore(profile: Profile, title: string, text: string, learning?: Learning | null, company?: string): Quick {
  const blob = `${title} ${text}`.toLowerCase();
  const { skills, targetWords } = prepare(profile);
  const matched = skills.filter((s) => s.re.test(blob)).map((s) => s.name);
  const tw = words(title);
  const titleHit = tw.length ? tw.filter((w) => targetWords.has(w)).length / tw.length : 0;

  const penalties: string[] = [];
  let score = matched.length * 8 + titleHit * 45;

  // Sans limite choisie (« 5 ans et plus », ou questionnaire pas encore rempli), aucune offre n'est jugée trop exigeante
  const maxYears = profile.preferences.max_years;
  const years = requiredYears(blob);
  const senior = maxYears != null && years != null && years > maxYears;
  if (senior) {
    score -= 25;
    penalties.push(`demande ${years} ans d'expérience`);
  }

  if (learning) {
    if (company && learning.blockedCompanies.includes(company.toLowerCase().trim())) {
      score -= 60;
      penalties.push("entreprise écartée");
    }
    const bad = tw.filter((w) => learning.penaltyWords.includes(w));
    if (bad.length) {
      score -= 12 * bad.length;
      penalties.push(`mots souvent écartés : ${bad.join(", ")}`);
    }
    const good = tw.filter((w) => learning.boostWords.includes(w));
    if (good.length) score += 6 * good.length;
  }

  return { score: Math.max(0, Math.min(100, Math.round(score))), matched: matched.slice(0, 8), senior, years, penalties };
}
