import type { Profile, SkillSuggestion } from "./types";

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9+#]/g, "");

/** La compétence est-elle déjà dans le profil (même écrite autrement) ou a-t-elle été refusée ? */
export function alreadyKnown(profile: Profile, skill: string): boolean {
  const k = norm(skill);
  if (!k) return true;
  const all = Object.values(profile.skills ?? {}).flat().map(norm);
  const dismissed = (profile.preferences?.dismissed_skills ?? []).map(norm);
  return all.includes(k) || dismissed.includes(k);
}

export const fresh = (profile: Profile, list: SkillSuggestion[] | undefined) =>
  (Array.isArray(list) ? list : []).filter((s) => s && typeof s.skill === "string" && s.skill.trim() && !alreadyKnown(profile, s.skill));

/** Ajoute des compétences confirmées dans la bonne catégorie du profil (sans doublon). */
export function addSkills(profile: Profile, add: { category: string; skill: string }[]): Profile {
  const skills: Record<string, string[]> = { ...(profile.skills ?? {}) };
  for (const { category, skill } of add) {
    const s = skill.trim().slice(0, 60);
    if (!s || alreadyKnown({ ...profile, skills }, s)) continue;
    const wanted = category.trim().slice(0, 60) || "Autres outils";
    const existing = Object.keys(skills).find((c) => norm(c) === norm(wanted)) ?? wanted;
    skills[existing] = [...(skills[existing] ?? []), s];
  }
  return { ...profile, skills };
}

export function dismissSkills(profile: Profile, names: string[]): Profile {
  const cur = profile.preferences?.dismissed_skills ?? [];
  const next = [...new Set([...cur, ...names.map((n) => n.trim().slice(0, 60)).filter(Boolean)])].slice(-200);
  return { ...profile, preferences: { ...profile.preferences, dismissed_skills: next } };
}
