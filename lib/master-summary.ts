import type { Profile } from "./types";

/**
 * Ce que le profil contient, compté en code (aucune IA) : sert à l'écran du diagnostic d'un CV maître, qui ne note pas le CV
 * mais dit ce que l'app y a lu (17 novembre 2026).
 */
export function profileCounts(p: Pick<Profile, "experiences" | "education" | "projects" | "skills" | "certifications" | "languages">) {
  return {
    experiences: p.experiences.length,
    achievements: p.experiences.reduce((n, e) => n + e.achievements.length, 0),
    education: p.education.length,
    projects: p.projects.length,
    skills: Object.values(p.skills ?? {}).flat().length,
    certifications: p.certifications.length,
    languages: p.languages.length,
  };
}
export type ProfileCounts = ReturnType<typeof profileCounts>;
