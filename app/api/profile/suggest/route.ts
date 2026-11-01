import { requireUser } from "@/lib/supabase/server";
import { handle } from "@/lib/http";
import { getProfile } from "@/lib/profile";
import { suggestSkills } from "@/lib/ai";
import { fresh } from "@/lib/skills";
import { spendAi, AI_COST } from "@/lib/quota";
import { HttpError } from "@/lib/supabase/server";

export const maxDuration = 60;

/** Cherche ce que la personne sait probablement déjà sans l'avoir écrit (à confirmer une par une). */
export async function POST() {
  return handle(52_000, async () => {
    const { supabase, user } = await requireUser();
    const profile = await getProfile(supabase, user);
    const filled = Object.values(profile.skills ?? {}).flat().length + profile.experiences.length + profile.education.length;
    if (filled < 3) throw new HttpError(400, "Ton profil est presque vide : dépose ton CV (Mon CV) ou remplis-le d'abord, puis je pourrai te faire des suggestions.");
    await spendAi(supabase, user, AI_COST.insights);
    const list = await suggestSkills(profile, profile.preferences?.dismissed_skills ?? []);
    return { suggestions: fresh(profile, list) };
  });
}
