import { requireUser, HttpError } from "@/lib/supabase/server";
import { handle } from "@/lib/http";
import { getProfile } from "@/lib/profile";
import { answerQuestion } from "@/lib/ai";
import { finishAnswer } from "@/lib/answer-reply";
import { dateLine } from "@/lib/format";
import { hasContent } from "@/lib/profile-fix";
import { spendAi, AI_COST } from "@/lib/quota";
import { timeLeft } from "@/lib/budget";

export const maxDuration = 60;

/**
 * Répond à la préoccupation d'une question « À compléter » ET transforme la réponse de la personne en modifications du profil
 * (seulement si elle apporte un fait). Rien n'est enregistré ici : la personne lit la réponse et valide l'avant / après.
 */
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
    const today = dateLine();
    let result = finishAnswer(profile, await answerQuestion(profile, question, answer), question, answer, today);
    // Réponse riche mais ni réponse ni réécriture utilisable (le modèle s'arrête parfois à un « je ne sais pas » en début de phrase) : une seconde lecture, même quota
    if (!result.ops.length && !result.reply && hasContent(answer) && timeLeft() > 20_000) {
      result = finishAnswer(profile, await answerQuestion(profile, question, answer, true), question, answer, today);
    }
    return result;
  });
}
