import { requireUser, HttpError } from "@/lib/supabase/server";
import { handle } from "@/lib/http";
import { getProfile, patchPreferences } from "@/lib/profile";
import { activeCriteria, sameCriteria, sanitizeSaved, toSearchCriteria } from "@/lib/day";
import { ensureFit } from "@/lib/fit-stock";
import { DEFAULT_DAILY_QUOTA, MAX_DAILY_QUOTA } from "@/lib/onboarding";

const SAVED_NAME = "Mes critères";

/**
 * Bouton 1 de la page Recherche : « Enregistrer mes critères ».
 * Le jeu enregistré remplace le précédent (hier « Data Analyst », aujourd'hui « Data BI »). La recherche automatique du matin
 * suit ces critères ; les anciennes recherches automatiques sont mises en pause (elles restent listées, réactivables).
 * Si les critères changent, la liste du jour est à refaire.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const { supabase, user } = await requireUser();
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const crit = sanitizeSaved(body);
    if (!crit.roles.length) throw new HttpError(400, "Choisis au moins un poste.");
    const quota = typeof body.daily_quota === "number" && Number.isFinite(body.daily_quota) ? Math.max(1, Math.min(MAX_DAILY_QUOTA, Math.round(body.daily_quota))) : DEFAULT_DAILY_QUOTA;

    const profile = await getProfile(supabase, user);
    const before = profile.preferences?.criteria ?? null;
    const changed = !sameCriteria(before, crit) && !(before == null && sameCriteria(activeCriteria(profile), crit));
    await patchPreferences(supabase, user.id, { criteria: crit, daily_quota: quota, ...(changed ? { day: null } : {}) });

    // Recherche du matin : une seule recherche gérée par l'app, les autres en pause
    const search = toSearchCriteria(crit);
    const { data: mine } = await supabase.from("searches").select("id").eq("user_id", user.id).eq("name", SAVED_NAME).limit(1);
    let id = mine?.[0]?.id as string | undefined;
    if (id) await supabase.from("searches").update({ criteria: search, auto: true }).eq("id", id);
    else id = (await supabase.from("searches").insert({ name: SAVED_NAME, criteria: search, auto: true }).select("id").single()).data?.id;
    const { data: paused } = id ? await supabase.from("searches").update({ auto: false }).eq("user_id", user.id).eq("auto", true).neq("id", id).select("id") : { data: [] };

    // Les offres déjà reçues sont revues avec les nouveaux postes
    const fresh = await getProfile(supabase, user);
    await ensureFit(supabase, user.id, fresh).catch(() => null);
    return { ok: true, changed, paused: paused?.length ?? 0, saved_at: crit.saved_at };
  });
}
