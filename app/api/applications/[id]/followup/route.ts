import { requireUser, HttpError } from "@/lib/supabase/server";
import { handle } from "@/lib/http";
import { getProfile } from "@/lib/profile";
import { generateFollowup } from "@/lib/ai";
import { spendAi, AI_COST } from "@/lib/quota";

export const maxDuration = 60;

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(52_000, async () => {
    const { id } = await ctx.params;
    const { supabase, user } = await requireUser();
    const { data: app } = await supabase.from("applications").select("*").eq("id", id).single();
    if (!app) throw new HttpError(404, "Candidature introuvable");
    await spendAi(supabase, user, AI_COST.followup);
    const profile = await getProfile(supabase, user);
    const draft = await generateFollowup(profile, app);
    await supabase.from("documents").insert({ user_id: user.id, application_id: id, offer_id: app.offer_id, kind: "relance", content: draft });
    return draft;
  });
}
