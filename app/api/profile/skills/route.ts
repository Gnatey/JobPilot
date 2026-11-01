import { requireUser } from "@/lib/supabase/server";
import { handle } from "@/lib/http";
import { getProfile } from "@/lib/profile";
import { addSkills, dismissSkills } from "@/lib/skills";

type Body = { add?: { category?: string; skill?: string }[]; dismiss?: string[] };

/** Enregistre la décision de la personne : compétences confirmées (ajoutées au profil) ou refusées (plus reproposées). */
export async function POST(req: Request) {
  return handle(async () => {
    const { supabase, user } = await requireUser();
    const body = (await req.json()) as Body;
    let profile = await getProfile(supabase, user);
    const add = (Array.isArray(body.add) ? body.add : []).slice(0, 20).filter((a) => typeof a?.skill === "string").map((a) => ({ category: String(a.category ?? ""), skill: String(a.skill) }));
    const dismiss = (Array.isArray(body.dismiss) ? body.dismiss : []).slice(0, 20).filter((s): s is string => typeof s === "string");
    if (add.length) profile = addSkills(profile, add);
    if (dismiss.length) profile = dismissSkills(profile, dismiss);
    const { error } = await supabase.from("profiles").upsert({ user_id: user.id, data: profile, updated_at: new Date().toISOString() });
    if (error) throw error;
    return { ok: true };
  });
}
