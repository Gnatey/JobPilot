import type { SupabaseClient } from "@supabase/supabase-js";
import type { Profile, SavedCriteria, DayList } from "./types";
import type { SearchCriteria } from "./sources";
import { searchAll, hasSource } from "./sources";
import { today } from "./format";
import { toReco, type RecoRow } from "./reco-query";
import { recoCols } from "./posted-db";
import { recoWhen, whenMs } from "./posted";
import { computeLearning } from "./learning";
import { fitCheck, roleAffinity, titleMatchesRoles } from "./fit";
import { CONTRACT_CODE, DEFAULT_DAILY_QUOTA, MAX_DAILY_QUOTA, MAX_TARGET_ROLES, normalizeZone, zoneDepartments } from "./onboarding";
import { getProfileById, patchPreferences } from "./profile";
import { storeSearchOffers } from "./sync";
import { leftovers, type StoreStats } from "./search-store";
import { explainDay } from "./search-why";
import type { Dropped } from "./sources";
import { spendAi, AI_COST } from "./quota";
import { HttpError } from "./supabase/server";

const WINDOWS = ["0", "1", "3", "7", "14", "31"];
/**
 * Jours que la liste du jour regarde. Période décochée (« 0 ») : 1 mois, le maximum d'une recherche limitée ; au-delà, Recommandées range de toute façon les offres
 * non décidées en Masquées après 3 semaines (lib/reco-age.ts), elles ne pourraient pas servir. L'aperçu « Voir les offres trouvées » n'a, lui, aucune limite.
 */
export const dayWindow = (v: string | undefined | null): number => (v === "0" ? 31 : Number(v) || 14);
const CODES = ["CDI", "CDD", "MIS", "LIB", "ALT", "STG"];

/** « sur les 14 derniers jours », « sur les dernières 24 h », « sur le dernier mois (la liste du jour ne remonte pas plus loin) » quand la période est décochée. */
export const dayLabel = (v: string | undefined | null) =>
  v === "0" ? "sur le dernier mois (la liste du jour ne remonte pas plus loin, même sans limite de période)" : v === "1" ? "sur les dernières 24 h" : `sur les ${dayWindow(v)} derniers jours`;

export const dailyQuota = (p: Profile) => Math.max(1, Math.min(MAX_DAILY_QUOTA, p.preferences?.daily_quota ?? DEFAULT_DAILY_QUOTA));

/** Critères en vigueur : ceux validés dans Recherche, à défaut ce que le questionnaire a donné. */
export function activeCriteria(p: Profile): SavedCriteria {
  const c = p.preferences?.criteria;
  if (c?.roles?.length) return c;
  return {
    roles: (p.targets ?? []).map((t) => t.title).filter(Boolean).slice(0, MAX_TARGET_ROLES),
    zone: p.preferences?.search_zone ?? null,
    contracts: [...new Set((p.preferences?.contracts ?? []).map((k) => CONTRACT_CODE[k]).filter(Boolean))],
    publishedWithin: "14",
    maxYears: p.preferences?.max_years ?? null,
    saved_at: "",
  };
}

/** Le format attendu par les sources d'offres (et par la table des recherches sauvegardées). */
export function toSearchCriteria(c: SavedCriteria): SearchCriteria {
  return {
    keywords: c.roles.join(", "),
    departments: zoneDepartments(c.zone),
    cities: c.zone?.scope === "ville" ? c.zone.cities.map((x) => x.name) : [],
    contracts: c.contracts, experience: "", publishedWithin: String(dayWindow(c.publishedWithin)) as SearchCriteria["publishedWithin"], remoteOnly: c.remoteOnly, exclude: c.exclude ?? "", maxYears: c.maxYears ?? null,
  };
}

/** Critères reçus du navigateur : valeurs connues, tailles raisonnables. */
export function sanitizeSaved(raw: unknown): SavedCriteria {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const roles = [...new Set((Array.isArray(r.roles) ? r.roles : []).map((x) => String(x).trim().slice(0, 80)).filter(Boolean))].slice(0, MAX_TARGET_ROLES);
  const years = typeof r.maxYears === "number" && Number.isFinite(r.maxYears) ? Math.max(0, Math.min(40, Math.round(r.maxYears))) : null;
  return {
    roles,
    zone: normalizeZone(r.zone),
    contracts: (Array.isArray(r.contracts) ? r.contracts : []).map(String).filter((c) => CODES.includes(c)),
    publishedWithin: (WINDOWS.includes(String(r.publishedWithin)) ? String(r.publishedWithin) : "14") as SavedCriteria["publishedWithin"],
    remoteOnly: r.remoteOnly === true,
    exclude: String(r.exclude ?? "").slice(0, 200),
    maxYears: years,
    saved_at: new Date().toISOString(),
  };
}

/**
 * La liste du jour en cours est-elle à refaire ? Oui si les critères ont changé, OU si la personne a changé « Candidatures par jour » :
 * sinon « Préparer ma journée » reprenait la liste déjà prête (10 offres à trancher) alors qu'elle venait d'en demander 4 (11 novembre).
 */
export const dayIsStale = (criteriaChanged: boolean, quotaBefore: number, quotaAfter: number) => criteriaChanged || quotaBefore !== quotaAfter;

/** Deux jeux de critères identiques (la date d'enregistrement mise à part) ? */
export const sameCriteria = (a?: SavedCriteria | null, b?: SavedCriteria | null) => {
  const k = (c?: SavedCriteria | null) => JSON.stringify(c ? { ...c, saved_at: "" } : null);
  return k(a) === k(b);
};

export type DayResult = {
  ids: string[];          // toute la liste du jour
  added: number;          // offres ajoutées par cet appel
  left: number;           // offres de la liste pas encore tranchées
  quota: number;
  web?: { searched: boolean; error?: string };
  message?: string;
};

type Pooled = { id: string; score: number };

/** Offres déjà reçues qui correspondent aux critères, meilleures d'abord. Aucune IA. */
async function pool(supabase: SupabaseClient, userId: string, profile: Profile, crit: SavedCriteria, skip: Set<string>): Promise<Pooled[]> {
  const learning = await computeLearning(supabase, userId);
  const { data } = await supabase.from("recommendations").select(await recoCols(supabase)).eq("user_id", userId).in("status", ["new", "analyzed"]).eq("senior", false)
    .order("quick_score", { ascending: false }).limit(800);
  const oldest = Date.now() - (dayWindow(crit.publishedWithin) + 1) * 864e5;
  const exclude = (crit.exclude ?? "").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);
  const out: Pooled[] = [];
  for (const row of (data ?? []) as unknown as RecoRow[]) {
    if (skip.has(row.id)) continue;
    const t = whenMs(recoWhen(row)); // date de publication sur le site quand on la connaît, sinon date d'arrivée ; sans date : on garde
    if (Number.isFinite(t) && t < oldest) continue;
    const r = toReco(row, profile, learning, true);
    if (r.senior) continue;
    const blob = `${row.title ?? ""} ${row.snippet ?? ""}`.toLowerCase();
    if (exclude.some((w) => blob.includes(w))) continue;
    if (crit.remoteOnly && !/t[ée]l[ée]travail|remote|distanciel|hybride/.test(blob)) continue;
    if (crit.maxYears != null && r.years != null && r.years > crit.maxYears) continue;
    if (!fitCheck(profile, { title: row.title ?? "", text: `${row.snippet ?? ""} ${row.location ?? ""}` }, { roles: crit.roles, contracts: crit.contracts }).ok) continue;
    // Les postes du jour, et eux seuls : hier « Data Analyst », aujourd'hui « Data BI »
    if (!titleMatchesRoles(row.title ?? "", crit.roles) && r.matched.length < 3) continue;
    // Le poste demandé d'abord (« Consultant BI » avant « Data Analyst » quand on cherche du BI), puis la compatibilité avec le profil
    out.push({ id: row.id, score: roleAffinity(row.title ?? "", crit.roles) * 80 + r.score });
  }
  return out.sort((a, b) => b.score - a.score);
}

/**
 * « Préparer ma journée » : choisit, parmi les offres déjà reçues, les meilleures pour les critères du jour,
 * autant que le quota de candidatures. S'il en manque, cherche sur le web (sources branchées). Aucune IA pour la sélection.
 * `more` : ajoute un nouveau lot du même type à la liste du jour. `noWeb` : tâche du matin, qui a déjà fait sa recherche.
 */
export async function buildDay(supabase: SupabaseClient, user: { id: string; email?: string | null }, profile: Profile, opts: { more?: boolean; noWeb?: boolean } = {}): Promise<DayResult> {
  const crit = activeCriteria(profile);
  if (!crit.roles.length) throw new HttpError(400, "Choisis au moins un poste, puis enregistre tes critères.");
  const quota = dailyQuota(profile);
  const d0 = profile.preferences?.day;
  const day: DayList = d0 && d0.date === today() ? d0 : { date: today(), ids: [], batches: 0 };

  const undecided = async () => {
    if (!day.ids.length) return 0;
    const { count } = await supabase.from("recommendations").select("id", { count: "exact", head: true }).in("id", day.ids.slice(0, 300)).in("status", ["new", "analyzed"]);
    return count ?? 0;
  };
  // « Préparer ma journée » une deuxième fois : on reprend la liste en cours tant qu'il reste des offres à trancher
  if (!opts.more && day.ids.length) {
    const left = await undecided();
    if (left > 0) return { ids: day.ids, added: 0, left, quota, message: `Ta liste du jour est déjà prête : ${left} offre${left > 1 ? "s" : ""} à trancher.` };
  }

  const skip = new Set(day.ids);
  let picked = await pool(supabase, user.id, profile, crit, skip);
  const web: DayResult["web"] = { searched: false };
  // Ce que la recherche web a lu et écarté, pour dire pourquoi la liste est incomplète
  let read = 0;
  let variants: string[] = [];
  let dropped: Dropped = { exclude: 0, remote: 0, years: 0, contract: 0, old: 0 };
  let stats: StoreStats | null = null;

  // Pas assez d'offres en réserve : recherche sur le web avec les mêmes critères
  if (picked.length < quota && hasSource() && !opts.noWeb) {
    try {
      await spendAi(supabase, { email: user.email ?? null }, AI_COST.search);
      web.searched = true;
      const found = await searchAll(toSearchCriteria(crit), { maxRequests: 10 });
      const learning = await computeLearning(supabase, user.id);
      const st = { read: 0, far: 0, low: 0, asked: 0, senior: 0, known: 0, fresh: 0 };
      await storeSearchOffers(supabase, user.id, profile, learning, found.offers, toSearchCriteria(crit), st);
      read = found.read; dropped = found.dropped; variants = found.variants; stats = st;
      picked = await pool(supabase, user.id, profile, crit, skip);
    } catch (e) {
      web.error = e instanceof Error ? e.message : "Recherche web impossible pour le moment.";
    }
  }

  const take = picked.slice(0, quota).map((p) => p.id);
  // Ce que CETTE recherche a rangé dans « À trier » sans que la liste du jour le prenne est retiré : demander 4 offres ne remplit pas Recommandées de 13
  const spare = leftovers(stats?.ids, take);
  for (let i = 0; i < spare.length; i += 100) {
    const { error } = await supabase.from("recommendations").delete().eq("user_id", user.id).eq("status", "new").in("id", spare.slice(i, i + 100));
    if (error) { console.error("Offres en trop non retirées", error.message); break; }
  }
  const ids = [...day.ids, ...take];
  if (take.length) {
    await patchPreferences(supabase, user.id, { day: { date: day.date, ids, batches: day.batches + 1 } });
    day.ids = ids;
  }

  let message: string | undefined;
  if (take.length < quota) {
    const lack = take.length ? `Je n'ai trouvé que ${take.length} offre${take.length > 1 ? "s" : ""} sur ${quota} qui correspondent` : "Aucune nouvelle offre ne correspond";
    message = `${lack} à « ${crit.roles.join(", ")} » ${dayLabel(crit.publishedWithin)}.`
      + explainDay({ sourcesOn: hasSource(), web, period: crit.publishedWithin, maxYears: crit.maxYears, read, dropped, stats, variants });
  }
  return { ids, added: take.length, left: await undecided(), quota, web, message };
}

/** Tâche du matin : la liste du jour est prête quand la personne ouvre l'app (seulement si elle a validé des critères dans Recherche). */
export async function prepareDayAuto(supabase: SupabaseClient, userId: string): Promise<{ added: number } | { skipped: string }> {
  const profile = await getProfileById(supabase, userId);
  if (!profile.preferences?.criteria?.roles?.length) return { skipped: "pas de critères validés" };
  if (profile.preferences.day?.date === today()) return { skipped: "liste déjà prête" };
  const r = await buildDay(supabase, { id: userId, email: null }, profile, { noWeb: true });
  return { added: r.added };
}
