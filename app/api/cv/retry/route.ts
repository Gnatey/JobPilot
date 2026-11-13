import { getLocale } from "@/lib/i18n/server";
import { after } from "next/server";
import { requireUser, HttpError } from "@/lib/supabase/server";
import { handle } from "@/lib/http";
import { diagState } from "@/lib/diagnostic-state";
import { runCvAnalysis } from "@/lib/cv-job";
import { normalizeAnswers } from "@/lib/onboarding";
import { spendAi, AI_COST } from "@/lib/quota";

export const maxDuration = 300;

/** Relance une analyse de CV échouée avec le texte déjà enregistré (inutile de redéposer le fichier). */
export async function POST(req: Request) {
  return handle(async () => {
    const { supabase, user } = await requireUser();
    const { id } = (await req.json().catch(() => ({}))) as { id?: string };
    if (!id) throw new HttpError(400, "Analyse introuvable.");
    const { data: d } = await supabase.from("diagnostics").select("id, answers, content, created_at").eq("id", id).maybeSingle();
    if (!d) throw new HttpError(404, "Analyse introuvable.");
    const st = diagState(d.content, d.created_at);
    if (st.state === "done") throw new HttpError(409, "Cette analyse est déjà terminée.");
    if (st.state === "pending") throw new HttpError(409, "L'analyse est déjà en cours.");
    const text = (d.content as { text?: string }).text;
    if (!text || text.length < 200) throw new HttpError(400, "Le texte du CV n'est plus là : dépose-le à nouveau.");
    const answers = d.answers ? normalizeAnswers(d.answers) : null;

    await spendAi(supabase, user, AI_COST.cvDiagnosis);
    const startedAt = new Date().toISOString();
    const { error } = await supabase.from("diagnostics").update({ content: { status: "pending", started_at: startedAt, text } }).eq("id", id);
    if (error) throw error;
    const lang = await getLocale(); // lue ici : dans after(), la requête n'est plus là
    after(() => runCvAnalysis(supabase, { userId: user.id, rowId: id, text, answers, startedAt, lang }));
    return { ok: true };
  });
}
