import { requireUser, HttpError } from "@/lib/supabase/server";
import { handle } from "@/lib/http";
import { getProfile } from "@/lib/profile";
import { generateFollowup } from "@/lib/ai";
import { spendAi, AI_COST } from "@/lib/quota";
import { isFollowupStatus, nextFollowupAfterDraft } from "@/lib/followup";

export const maxDuration = 60;

/**
 * Brouillon de relance : seulement après un entretien ou une épreuve (Entretien, Test / Cas), jamais pour une candidature sans entretien.
 * Une fois rédigé, la prochaine relance n'est proposée que dans 7 jours (`next_action_at`), pas chaque jour.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(52_000, async () => {
    const { id } = await ctx.params;
    const { supabase, user } = await requireUser();
    const { data: app } = await supabase.from("applications").select("*").eq("id", id).single();
    if (!app) throw new HttpError(404, "Candidature introuvable");
    if (!isFollowupStatus(app.status)) throw new HttpError(409, "Une relance se rédige après un entretien ou une épreuve. Passe d'abord la candidature à « Entretien » ou « Test / Cas ».");
    await spendAi(supabase, user, AI_COST.followup);
    const profile = await getProfile(supabase, user);
    const draft = await generateFollowup(profile, app);
    await supabase.from("documents").insert({ user_id: user.id, application_id: id, offer_id: app.offer_id, kind: "relance", content: draft });
    await supabase.from("applications").update({ next_action_at: nextFollowupAfterDraft() }).eq("id", id);
    return draft;
  });
}
