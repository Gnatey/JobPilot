import { requireUser, HttpError } from "@/lib/supabase/server";
import { handle } from "@/lib/http";
import { getProfile } from "@/lib/profile";
import { auditProfile } from "@/lib/ai";
import { isSafe, isValid } from "@/lib/profile-fix";
import { spendAi, AI_COST } from "@/lib/quota";

export const maxDuration = 60;

/**
 * « Faire le point » : l'IA relit le profil et propose (doublons, projets rangés en expérience, questions utiles).
 * Elle ne modifie rien : chaque proposition est renvoyée avec « auto » (applicable sans risque) ou à valider d'un clic.
 */
export async function POST() {
  return handle(52_000, async () => {
    const { supabase, user } = await requireUser();
    const profile = await getProfile(supabase, user);
    const filled = profile.experiences.reduce((n, e) => n + e.achievements.length, 0) + profile.projects.length;
    if (filled < 3) throw new HttpError(400, "Ton profil est presque vide : dépose ton CV (Mon CV) ou remplis-le d'abord, puis je pourrai le relire.");
    await spendAi(supabase, user, AI_COST.cv);
    const r = await auditProfile(profile);
    // Seules les propositions qui s'appliquent vraiment au profil actuel, sans chiffre inventé
    const proposals = r.proposals.filter((p) => isValid(profile, p)).map((p) => ({ ...p, auto: isSafe(p) }));
    return { proposals, questions: r.questions, notes: r.notes };
  });
}
