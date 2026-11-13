import { after } from "next/server";
import { requireUser, HttpError } from "@/lib/supabase/server";
import { handle } from "@/lib/http";
import { getProfile } from "@/lib/profile";
import { fileToText } from "@/lib/cv-text";
import { cleanExtractedText } from "@/lib/clean-text";
import { runCvAnalysis } from "@/lib/cv-job";
import { stripPageMarks } from "@/lib/profile-fix";
import { applyAnswers, missingAnswers, normalizeAnswers, withZoneText } from "@/lib/onboarding";
import type { OnboardingAnswers } from "@/lib/types";
import { spendAi, AI_COST } from "@/lib/quota";

// L'analyse tourne après la réponse (jusqu'à cette durée) ; la page du diagnostic se met à jour toute seule
export const maxDuration = 300;

export async function POST(req: Request) {
  return handle(async () => {
    const { supabase, user } = await requireUser();
    const form = await req.formData();
    const kind = form.get("kind") === "onboarding" ? "onboarding" : "refresh";
    let answers: OnboardingAnswers | null = null;
    if (form.get("answers")) {
      try { answers = withZoneText(normalizeAnswers(JSON.parse(String(form.get("answers"))))); } catch { throw new HttpError(400, "Réponses illisibles : reviens au questionnaire."); }
      if (kind === "onboarding") {
        const missing = missingAnswers(answers);
        if (missing.length) throw new HttpError(400, `Il manque une réponse obligatoire : ${missing[0].message}`);
      }
    }
    const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0).slice(0, 6);
    const pasted = cleanExtractedText(String(form.get("text") ?? "")).trim();

    const parts: string[] = [];
    for (const f of files) parts.push(`=== CV : ${f.name} ===\n${stripPageMarks(await fileToText(f))}`);
    if (pasted) parts.push(`=== CV collé ===\n${stripPageMarks(pasted)}`);
    const text = parts.join("\n\n");
    if (text.length < 200) throw new HttpError(400, "Dépose au moins un CV (PDF, Word ou texte).");

    await spendAi(supabase, user, AI_COST.cvDiagnosis);

    // Les réponses du questionnaire sont enregistrées tout de suite : même si l'analyse échoue, rien n'est perdu
    const current = await getProfile(supabase, user);
    if (answers) await supabase.from("profiles").upsert({ user_id: user.id, data: applyAnswers(current, answers), updated_at: new Date().toISOString() });

    const startedAt = new Date().toISOString();
    const { data, error } = await supabase
      .from("diagnostics")
      .insert({
        user_id: user.id, kind, answers, files: files.map((f) => f.name).concat(pasted ? ["texte collé"] : []),
        content: { status: "pending", started_at: startedAt, text }, proposed_profile: null, applied: false,
      })
      .select("id")
      .single();
    if (error) throw error;

    after(() => runCvAnalysis(supabase, { userId: user.id, rowId: data.id, text, answers, startedAt }));
    return { id: data.id };
  });
}
