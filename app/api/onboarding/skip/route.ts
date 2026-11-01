import { requireUser, HttpError } from "@/lib/supabase/server";
import { handle } from "@/lib/http";
import { getProfile } from "@/lib/profile";
import { applyAnswers, missingAnswers, normalizeAnswers, withZoneText } from "@/lib/onboarding";

/** « Passer le diagnostic » : on enregistre les réponses au questionnaire sans analyser de CV. */
export async function POST(req: Request) {
  return handle(async () => {
    const { supabase, user } = await requireUser();
    const body = await req.json().catch(() => ({}));
    const answers = withZoneText(normalizeAnswers(body?.answers));
    const missing = missingAnswers(answers);
    if (missing.length) throw new HttpError(400, `Il manque une réponse obligatoire : ${missing[0].message}`);

    const profile = await getProfile(supabase, user);
    const { error } = await supabase.from("profiles").upsert({ user_id: user.id, data: applyAnswers(profile, answers), updated_at: new Date().toISOString() });
    if (error) throw error;
    return { ok: true };
  });
}
