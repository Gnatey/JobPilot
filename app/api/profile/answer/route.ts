import { requireUser, HttpError } from "@/lib/supabase/server";
import { handle } from "@/lib/http";
import { getProfile } from "@/lib/profile";
import { answerQuestion } from "@/lib/ai";
import { hasContent, vetOps } from "@/lib/profile-fix";
import { spendAi, AI_COST } from "@/lib/quota";
import { timeLeft } from "@/lib/budget";

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
    let raw = await answerQuestion(profile, question, answer);
    let ops = vetOps(profile, raw, answer);
    // Réponse riche mais rien d'utilisable (le modèle s'arrête parfois à un « je ne sais pas » en début de phrase) : une seconde lecture, même quota
    if (!ops.length && hasContent(answer) && timeLeft() > 20_000) {
      raw = await answerQuestion(profile, question, answer, true);
      ops = vetOps(profile, raw, answer);
    }
    // `proposed` : ce que l'IA a proposé avant vérification, pour dire à la personne pourquoi il n'y a rien à valider
    return { ops, proposed: raw.length };
  });
}
