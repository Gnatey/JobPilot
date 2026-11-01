import { requireUser, HttpError } from "@/lib/supabase/server";
import { handle } from "@/lib/http";
import { getProfile } from "@/lib/profile";
import { answerQuestion } from "@/lib/ai";
import { vetOps } from "@/lib/profile-fix";
import { spendAi, AI_COST } from "@/lib/quota";

export const maxDuration = 60;

/** Transforme la réponse à une question « À compléter » en modifications du profil. Rien n'est enregistré ici : la personne valide avant/après. */
export async function POST(req: Request) {
  return handle(52_000, async () => {
    const { supabase, user } = await requireUser();
    const body = (await req.json().catch(() => ({}))) as { question?: unknown; answer?: unknown };
    const question = typeof body.question === "string" ? body.question.trim().slice(0, 600) : "";
    const answer = typeof body.answer === "string" ? body.answer.trim().slice(0, 1500) : "";
    if (!question) throw new HttpError(400, "Question manquante.");
    if (answer.length < 2) throw new HttpError(400, "Écris ta réponse d'abord.");
    const profile = await getProfile(supabase, user);
    await spendAi(supabase, user, AI_COST.document);
    const ops = vetOps(profile, await answerQuestion(profile, question, answer), answer);
    return { ops };
  });
}
