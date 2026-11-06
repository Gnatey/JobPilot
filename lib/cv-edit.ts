import { nameKey } from "./cv-format";
import type { CvDoc, Profile } from "./types";

/**
 * Modifications d'un CV GÉNÉRÉ (logique pure, testée par tests/cv-edit.test.ts, aucune dépendance à React).
 * Les modèles de CV (components/cv-templates.tsx) les appellent sur une copie du CV : tout texte du CV se modifie en cliquant dessus.
 * Règle commune, la même que pour la lettre : un texte vidé disparaît (une puce, un projet, une ligne de compétences, une certification),
 * et « Entrée » dans une puce en ouvre une nouvelle.
 */

export function setExp(cv: CvDoc, i: number, k: "role" | "company" | "location" | "dates", text: string): void {
  const e = cv.experiences[i];
  if (e) e[k] = text.trim();
}

export function setEdu(cv: CvDoc, i: number, k: "degree" | "school" | "dates", text: string): void {
  const e = cv.education[i];
  if (e) e[k] = text.trim();
}

/** Une puce modifiée. Plusieurs lignes (Entrée) donnent plusieurs puces, un texte vidé retire la puce. */
export function setBullet(cv: CvDoc, i: number, j: number, text: string): void {
  const bullets = cv.experiences[i]?.bullets;
  if (!bullets) return;
  const parts = text.split(/\n+/).map((x) => x.trim()).filter(Boolean);
  bullets.splice(j, 1, ...parts);
}

/** Nom ou description d'un projet. Un projet dont le nom ET la description sont vidés disparaît. */
export function setProject(cv: CvDoc, i: number, k: "name" | "description", text: string): void {
  const p = cv.projects[i];
  if (!p) return;
  p[k] = text.trim();
  if (!p.name && !p.description) cv.projects.splice(i, 1);
}

/** Intitulé ou contenu d'une ligne de compétences. Une ligne entièrement vidée disparaît. */
export function setSkill(cv: CvDoc, i: number, k: "label" | "items", text: string): void {
  const s = cv.skills[i];
  if (!s) return;
  s[k] = text.trim();
  if (!s.label && !s.items) cv.skills.splice(i, 1);
}

/** Langues, centres d'intérêt ou certifications (lignes séparées par « · » à l'écran). */
export function setTail(cv: CvDoc, field: "languages" | "certifications" | "extras", text: string): void {
  const t = text.trim();
  if (field === "certifications") cv.certifications = t.split(/\s*·\s*/).map((x) => x.trim()).filter(Boolean);
  else if (field === "languages") cv.languages = t;
  else cv.extras = t;
}

/** Une certification de la colonne latérale. Vidée, elle disparaît. */
export function setCert(cv: CvDoc, k: number, text: string): void {
  const t = text.trim();
  if (!t) cv.certifications.splice(k, 1);
  else cv.certifications[k] = t;
}

/** Dates écrites en marge sur deux lignes (« Sept 2024 –⏎Sept 2025 ») : remises sur une ligne à l'enregistrement. */
export const joinDates = (text: string): string => text.replace(/\s*\n\s*/g, " ").trim();

/**
 * Projets « Toujours sur mes CV » (case du profil) : ils figurent sur chaque CV généré, même si l'offre ne les cite pas.
 * Le texte vient du profil quand l'IA ne l'a pas retenu (elle garde sa propre formulation sinon). Un CV tient sur une page :
 * au-delà de `max`, on retire d'abord les projets non épinglés, en commençant par la fin (les plus pertinents pour l'offre restent devant).
 */
export function pinProjects(cv: CvDoc, profile: Profile, max = 3): CvDoc {
  const pinned = (profile.projects ?? []).filter((p) => p.pin && p.name?.trim());
  if (!pinned.length) return cv;
  const same = (a: string, b: string) => {
    const x = nameKey(a), y = nameKey(b);
    return x.length >= 3 && y.length >= 3 && (x === y || x.includes(y) || y.includes(x));
  };
  const mine = cv.projects ?? [];
  const added = pinned
    .filter((p) => !mine.some((m) => same(m.name, p.name)))
    .map((p) => ({ name: p.name.trim(), description: (p.description?.trim() || (p.tags ?? []).join(", ")).trim(), ...(p.link?.trim() ? { link: p.link.trim() } : {}) }));
  const list = [...mine, ...added];
  const isPinned = (name: string) => pinned.some((p) => same(p.name, name));
  while (list.length > max) {
    let k = -1;
    for (let n = list.length - 1; n >= 0; n--) if (!isPinned(list[n].name)) { k = n; break; }
    list.splice(k >= 0 ? k : list.length - 1, 1);
  }
  return { ...cv, projects: list };
}

/**
 * Tirets insécables (U+2010, U+2011) remplacés par un tiret simple, dans tout le texte du CV : « CI‑CD » n'est pas lu comme « CI-CD »
 * par les logiciels de tri de candidatures, et rien ne le montre à l'écran. Le tiret insécable vient souvent du profil lui-même.
 */
export function cleanCvText<T>(value: T): T {
  if (typeof value === "string") return value.replace(/[‐‑]/g, "-") as T;
  if (Array.isArray(value)) return value.map((v) => cleanCvText(v)) as T;
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, cleanCvText(v)])) as T;
  return value;
}
