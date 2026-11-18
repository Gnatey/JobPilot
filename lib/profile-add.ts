import { mergeExtracted } from "./profile-fix";
import type { Profile } from "./types";

/**
 * « Mettre à jour mon profil » (diagnostic d'un CV) : AJOUTER ce qui manque, jamais remplacer le profil par l'instantané du diagnostic
 * (logique pure, testée par tests/profile-add.test.ts).
 *
 * Avant (jusqu'au 17 novembre), le bouton écrivait le profil proposé tel quel. Ce profil avait été calculé au moment du dépôt du CV :
 * tout ce que la personne avait écrit dans son profil depuis (une réalisation ajoutée à la main, une règle, un réglage) disparaissait.
 * Maintenant : le profil d'AUJOURD'HUI reste la base, et on y ajoute ce que le diagnostic apporte et qu'il n'a pas (`mergeExtracted`, sans IA :
 * expériences et réalisations, formations, compétences, projets, certifications, centres d'intérêt, liens, questions à compléter).
 * Réglages, règles, cibles et mémoire des questions réglées restent ceux d'aujourd'hui.
 *
 * Limites : une ligne que la personne a modifiée ou supprimée depuis le diagnostic peut revenir sous son ancienne forme (un doublon, jamais une perte) ;
 * la réécriture « plus précise » de l'IA d'une réalisation déjà connue n'est pas appliquée ici (elle l'était au dépôt, sur l'instantané).
 */

export type Added = { experiences: number; achievements: number; education: number; projects: number; skills: number; certifications: number; languages: number; interests: number; links: number; todo: number };

const count = (p: Profile): Added => ({
  experiences: p.experiences.length,
  achievements: p.experiences.reduce((n, e) => n + e.achievements.length, 0),
  education: p.education.length,
  projects: p.projects.length,
  skills: Object.values(p.skills ?? {}).reduce((n, l) => n + l.length, 0),
  certifications: p.certifications.length,
  languages: p.languages.length,
  interests: p.interests.length,
  links: (p.identity.links ?? []).length,
  todo: p.todo.length,
});

export function addMissing(current: Profile, proposed: Profile): { profile: Profile; added: Added } {
  const merged = mergeExtracted(current, proposed).profile;
  // Une langue que le profil ne connaît pas encore s'ajoute (une langue connue garde son niveau : c'est la personne qui le règle)
  const known = new Set(merged.languages.map((l) => l.name.trim().toLowerCase()));
  const languages = [...merged.languages, ...(proposed.languages ?? []).filter((l) => l?.name?.trim() && !known.has(l.name.trim().toLowerCase()))];
  const profile: Profile = { ...merged, languages };
  const a = count(current), b = count(profile);
  const added = Object.fromEntries(Object.keys(a).map((k) => [k, Math.max(0, b[k as keyof Added] - a[k as keyof Added])])) as Added;
  return { profile, added };
}

const PLURAL: [keyof Added, string, string][] = [
  ["experiences", "expérience", "expériences"],
  ["achievements", "réalisation", "réalisations"],
  ["education", "formation", "formations"],
  ["projects", "projet", "projets"],
  ["skills", "compétence", "compétences"],
  ["certifications", "certification", "certifications"],
  ["languages", "langue", "langues"],
  ["interests", "centre d'intérêt", "centres d'intérêt"],
  ["links", "lien", "liens"],
  ["todo", "question à compléter", "questions à compléter"],
];

/** « 2 réalisations, 1 compétence » ; vide quand rien n'est ajouté. */
export function describeAdded(a: Added): string {
  return PLURAL.filter(([k]) => a[k] > 0).map(([k, one, many]) => `${a[k]} ${a[k] > 1 ? many : one}`).join(", ");
}
