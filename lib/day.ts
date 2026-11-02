import type { SupabaseClient } from "@supabase/supabase-js";
import type { Profile, SavedCriteria, DayList } from "./types";
import type { SearchCriteria } from "./sources";
import { searchAll, hasSource } from "./sources";
import { today } from "./format";
import { RECO_COLS, toReco, type RecoRow } from "./reco-query";
import { computeLearning } from "./learning";
import { fitCheck, roleAffinity, titleMatchesRoles } from "./fit";
import { CONTRACT_CODE, DEFAULT_DAILY_QUOTA, MAX_DAILY_QUOTA, MAX_TARGET_ROLES, normalizeZone, zoneDepartments } from "./onboarding";
import { getProfileById, patchPreferences } from "./profile";
import { storeSearchOffers } from "./sync";
import { spendAi, AI_COST } from "./quota";
import { HttpError } from "./supabase/server";

const WINDOWS = ["1", "3", "7", "14", "31"];
const CODES = ["CDI", "CDD", "MIS", "LIB", "ALT", "STG"];

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
    contracts: c.contracts, experience: "", publishedWithin: c.publishedWithin, remoteOnly: c.remoteOnly, exclude: c.exclude ?? "", maxYears: c.maxYears ?? null,
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
  const { data } = await supabase.from("recommendations").select(RECO_COLS).eq("user_id", userId).in("status", ["new", "analyzed"]).eq("senior", false)
    .order("quick_score", { ascending: false }).limit(800);
  const oldest = Date.now() - (Number(crit.publishedWithin) + 1) * 864e5;
  const exclude = (crit.exclude ?? "").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);
  const out: Pooled[] = [];
  for (const row of (data ?? []) as unknown as RecoRow[]) {
    if (skip.has(row.id)) continue;
    const t = row.received_at ? Date.parse(row.received_at) : NaN;
    if (!Number.isNaN(t) && t < oldest) continue;
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

  // Pas assez d'offres en réserve : recherche sur le web avec les mêmes critères
  if (picked.length < quota && hasSource() && !opts.noWeb) {
    try {
      await spendAi(supabase, { email: user.email ?? null }, AI_COST.search);
      web.searched = true;
      const found = await searchAll(toSearchCriteria(crit), { maxRequests: 10 });
      const learning = await computeLearning(supabase, user.id);
      await storeSearchOffers(supabase, user.id, profile, learning, found.offers, toSearchCriteria(crit));
      picked = await pool(supabase, user.id, profile, crit, skip);
    } catch (e) {
      web.error = e instanceof Error ? e.message : "Recherche web impossible pour le moment.";
    }
  }

  const take = picked.slice(0, quota).map((p) => p.id);
  const ids = [...day.ids, ...take];
  if (take.length) {
    await patchPreferences(supabase, user.id, { day: { date: day.date, ids, batches: day.batches + 1 } });
    day.ids = ids;
  }

  let message: string | undefined;
  if (take.length < quota) {
    const lack = take.length ? `Je n'ai trouvé que ${take.length} offre${take.length > 1 ? "s" : ""} sur ${quota} qui correspondent` : "Aucune nouvelle offre ne correspond";
    message = `${lack} à « ${crit.roles.join(", ")} » sur les ${crit.publishedWithin === "1" ? "dernières 24 h" : `${crit.publishedWithin} derniers jours`}.`
      + (!hasSource() ? " Aucune source de recherche automatique n'est branchée : les nouvelles offres viennent de tes alertes Gmail." : web.error ? ` La recherche web a échoué (${web.error}).` : " Élargis la période, la zone ou les postes, puis réessaie.");
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
