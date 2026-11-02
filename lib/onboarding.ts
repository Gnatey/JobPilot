import type { OnboardingAnswers, Profile, SearchZone, Target } from "./types";

/* Choix proposés par le questionnaire (importés aussi par les routes API) */
export const CONTRACT_OPTIONS = ["CDI", "CDD", "Freelance", "Alternance", "Stage", "Intérim"];
export const REMOTE_OPTIONS = ["Présentiel", "Hybride", "Full remote"];
/** `max` : nombre d'années demandées au-delà duquel une offre est jugée hors de portée (null = pas de limite) */
export const YEAR_BANDS: { label: string; max: number | null }[] = [
  { label: "Moins d'1 an", max: 2 },
  { label: "1 à 3 ans", max: 3 },
  { label: "3 à 5 ans", max: 5 },
  { label: "5 ans et plus", max: null },
];
export const AVAILABILITY = ["Immédiate", "Sous 1 mois", "Sous 3 mois"];
export const SEARCH_SINCE = ["Je commence", "1 à 3 mois", "3 à 6 mois", "6 mois à 1 an", "Plus d'un an"];
export const APPS_PER_WEEK = ["0 à 2", "3 à 5", "6 à 10", "Plus de 10"];
/** Candidatures visées par jour : taille de la liste du jour proposée par la page Recherche. */
export const DAILY_QUOTA = ["3", "5", "10", "15", "20", "30"];
export const DEFAULT_DAILY_QUOTA = 10;
export const MAX_DAILY_QUOTA = 50;
/** Contrats du questionnaire → codes des sources d'offres (Recherche). */
export const CONTRACT_CODE: Record<string, string> = { CDI: "CDI", CDD: "CDD", "Intérim": "MIS", Freelance: "LIB", Alternance: "ALT", Stage: "STG" };
export const RESPONSES = ["Aucune réponse", "Des refus, pas d'entretien", "Des entretiens, pas d'offre", "Ça avance"];
/** Postes visés : 5 au maximum (questionnaire et page Recherche). */
export const MAX_TARGET_ROLES = 5;
/** Une recherche par lieu : on plafonne la zone à 5 pour garder des recherches rapides. */
export const MAX_ZONE = 5;

export const emptyAnswers = (): OnboardingAnswers => ({
  target_roles: [], contracts: [], zone: null, location: "", mobility: "", remote: [], experience_years: [],
  availability: "", salary: "", search_since: "", applications_per_week: "", daily_quota: "", responses: "", blockers: "", sectors: [],
});

export const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 30);
const words = (s: string) => slug(s).split("_").filter((w) => w.length > 3);

/* ---------- Zone de recherche ---------- */

export function zoneIsValid(z: SearchZone | null | undefined): boolean {
  if (!z) return false;
  if (z.scope === "france") return true;
  return z.scope === "departement" ? z.departments.length > 0 : z.cities.length > 0;
}

/** Codes de départements à interroger (vide = toute la France). */
export function zoneDepartments(z: SearchZone | null | undefined): string[] {
  if (!z || z.scope === "france") return [];
  const codes = z.scope === "departement" ? z.departments.map((d) => d.code) : z.cities.map((c) => c.dept);
  return [...new Set(codes.filter(Boolean))].slice(0, MAX_ZONE);
}

export function zoneLabel(z: SearchZone | null | undefined): string {
  if (!z) return "";
  if (z.scope === "france") return "France entière";
  if (z.scope === "departement") return `Départements : ${z.departments.map((d) => `${d.name} (${d.code})`).join(", ")}`;
  return `Villes : ${z.cities.map((c) => `${c.name} (${c.dept})`).join(", ")}`;
}

/* ---------- Validation ---------- */

export type Missing = { key: string; message: string };

/** Réponses obligatoires qui manquent. */
export function missingAnswers(a: OnboardingAnswers): Missing[] {
  const m: Missing[] = [];
  if (!a.target_roles.length) m.push({ key: "target_roles", message: "Choisis au moins un poste." });
  if (!a.contracts.length) m.push({ key: "contracts", message: "Choisis au moins un type de contrat." });
  if (!zoneIsValid(a.zone)) {
    const scope = a.zone?.scope;
    m.push({ key: "zone", message: !scope ? "Choisis une zone de recherche." : scope === "departement" ? "Ajoute au moins un département." : "Ajoute au moins une ville." });
  }
  if (!a.experience_years.length) m.push({ key: "experience_years", message: "Choisis au moins une tranche d'expérience." });
  if (!a.availability) m.push({ key: "availability", message: "Indique ta disponibilité." });
  if (!a.search_since) m.push({ key: "search_since", message: "Indique où en est ta recherche." });
  if (!a.applications_per_week) m.push({ key: "applications_per_week", message: "Indique combien de candidatures tu envoies par semaine." });
  return m;
}

/* ---------- Lecture tolérante (réponses reçues par l'API) ---------- */

const strs = (v: unknown, max = 40): string[] =>
  (Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : []).map((x) => String(x).trim().slice(0, 120)).filter(Boolean).slice(0, max);
const str = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 500) : "");

/** Zone reçue de l'API : on ne garde que des valeurs connues (cinq départements ou villes au plus). */
export function normalizeZone(raw: unknown): SearchZone | null {
  const z = raw as Partial<SearchZone> | null | undefined;
  return z && (z.scope === "france" || z.scope === "departement" || z.scope === "ville")
    ? {
        scope: z.scope,
        departments: (Array.isArray(z.departments) ? z.departments : []).slice(0, MAX_ZONE).map((d) => ({ code: str(d?.code), name: str(d?.name) })).filter((d) => d.code),
        cities: (Array.isArray(z.cities) ? z.cities : []).slice(0, MAX_ZONE).map((c) => ({ name: str(c?.name), dept: str(c?.dept), deptName: str(c?.deptName) || undefined })).filter((c) => c.name),
      }
    : null;
}

export function normalizeAnswers(raw: unknown): OnboardingAnswers {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const zone = normalizeZone(r.zone);
  return {
    target_roles: strs(r.target_roles, MAX_TARGET_ROLES),
    contracts: strs(r.contracts, 8),
    zone,
    location: str(r.location),
    mobility: str(r.mobility),
    remote: strs(r.remote, 4),
    experience_years: strs(r.experience_years, 4),
    availability: str(r.availability),
    salary: str(r.salary),
    search_since: str(r.search_since),
    applications_per_week: str(r.applications_per_week),
    daily_quota: /^\d{1,2}$/.test(str(r.daily_quota)) ? String(Math.max(1, Math.min(MAX_DAILY_QUOTA, Number(str(r.daily_quota))))) : "",
    responses: str(r.responses),
    blockers: str(r.blockers),
    sectors: strs(r.sectors, 12),
  };
}

/** Ne garde de la zone que la liste correspondant au choix actif (France, départements ou villes). */
export function cleanZone(z: SearchZone | null): SearchZone | null {
  if (!z) return null;
  return { scope: z.scope, departments: z.scope === "departement" ? z.departments : [], cities: z.scope === "ville" ? z.cities : [] };
}

/** Complète les champs déduits (texte de la zone) avant envoi ou enregistrement. */
export function withZoneText(a: OnboardingAnswers): OnboardingAnswers {
  const zone = cleanZone(a.zone);
  return { ...a, zone, mobility: zoneLabel(zone), location: zone?.scope === "ville" ? zone.cities.map((c) => c.name).join(", ") : "" };
}

/* ---------- Application au profil ---------- */

/** Limite d'années demandées : la plus haute des tranches cochées ; « 5 ans et plus » supprime la limite. */
export function maxYearsOf(bands: string[]): number | undefined {
  const known = YEAR_BANDS.filter((b) => bands.includes(b.label));
  if (!known.length || known.some((b) => b.max === null)) return undefined;
  return Math.max(...known.map((b) => b.max as number));
}

/** Intitulés visés → cibles du profil (en gardant le positionnement déjà rédigé pour un intitulé connu). */
export function mergeTargets(existing: Target[], roles: string[], hints: { title: string; pitch: string }[] = []): Target[] {
  const out: Target[] = [];
  const used = new Set<string>();
  for (const title of roles.slice(0, MAX_TARGET_ROLES)) {
    const known = existing.find((t) => slug(t.title) === slug(title));
    const ws = new Set(words(title));
    const hint = hints.find((h) => words(h.title).some((w) => ws.has(w)));
    let id = known?.id || slug(title) || "cible";
    while (used.has(id)) id += "_2";
    used.add(id);
    out.push({ id, title, pitch: known?.pitch || hint?.pitch || "" });
  }
  // Les cibles déjà présentes mais non cochées restent disponibles pour les CV
  for (const t of existing) if (!out.some((o) => slug(o.title) === slug(t.title)) && !used.has(t.id)) { out.push(t); used.add(t.id); }
  return out;
}

/** Applique les réponses du questionnaire au profil (préférences, mobilité, métiers visés). */
export function applyAnswers(p: Profile, a: OnboardingAnswers, hints: { title: string; pitch: string }[] = []): Profile {
  const prefs: Profile["preferences"] = {
    ...p.preferences,
    contracts: a.contracts.length ? a.contracts : p.preferences.contracts,
    onboarded: true,
  };
  prefs.remote = a.remote.length ? a.remote.join(", ") : p.preferences.remote;
  if (a.salary) prefs.salary = a.salary;
  if (a.sectors.length) prefs.sectors = a.sectors;
  if (a.zone) prefs.search_zone = a.zone;
  if (a.daily_quota) prefs.daily_quota = Number(a.daily_quota);
  if (a.experience_years.length) {
    const max = maxYearsOf(a.experience_years);
    if (max === undefined) delete prefs.max_years;
    else prefs.max_years = max;
  }
  return {
    ...p,
    identity: {
      ...p.identity,
      // « city » reste la ville où tu habites (extraite du CV) : la zone de recherche est une autre information
      mobility: zoneLabel(a.zone) || p.identity.mobility,
      availability: a.availability || p.identity.availability,
    },
    targets: a.target_roles.length ? mergeTargets(p.targets ?? [], a.target_roles, hints) : p.targets,
    preferences: prefs,
  };
}
