import { requireUser, HttpError } from "@/lib/supabase/server";
import { handle } from "@/lib/http";
import { getProfile } from "@/lib/profile";
import { answerQuestion } from "@/lib/ai";
import { hasContent } from "@/lib/profile-fix";
import { dateLine } from "@/lib/format";
import { spendAi, AI_COST } from "@/lib/quota";
import { timeLeft } from "@/lib/budget";
import { answerGap, applyGapAnswer, markGapDb } from "@/lib/offer-gaps-db";

export const maxDuration = 60;

/**
 * Écarts avec l'offre (voir lib/offer-gaps.ts), trois gestes :
 * - `answer` : lit la réponse de la personne (même IA et mêmes garde-fous que « À compléter ») et rend la réponse + l'avant / après. Compte pour une action d'IA. Rien n'est enregistré.
 * - `apply` : enregistre dans le profil les lignes validées (revérifiées ici) et note l'écart « fait » sur l'offre.
 * - `no` : « pas fait » : noté sur l'offre, le CV et la lettre ne le revendiquent jamais. Sans IA.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(52_000, async () => {
    const { id } = await ctx.params;
    const { supabase, user } = await requireUser();
    const body = (await req.json().catch(() => ({}))) as { action?: unknown; term?: unknown; answer?: unknown; ops?: unknown };

    if (body.action === "no") return markGapDb(supabase, id, body.term, "no");
    if (body.action === "apply") return applyGapAnswer(supabase, user, id, body.term, body.answer, body.ops);
    if (body.action !== "answer") throw new HttpError(400, "Action inconnue.");

    const { data: offer } = await supabase.from("offers").select("id").eq("id", id).maybeSingle();
    if (!offer) throw new HttpError(404, "Offre introuvable");
    const profile = await getProfile(supabase, user);
    await spendAi(supabase, user, AI_COST.document);
    return answerGap(profile, body.term, body.answer, dateLine(),
      (question, answer, retry) => answerQuestion(profile, question, answer, retry),
      (answer) => hasContent(answer) && timeLeft() > 20_000);
  });
}
