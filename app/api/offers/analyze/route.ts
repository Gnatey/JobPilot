import { requireUser, HttpError } from "@/lib/supabase/server";
import { handle } from "@/lib/http";
import { getProfile } from "@/lib/profile";
import { extractOffer, analyzeOffer } from "@/lib/ai";
import { readOffer, goneMessage, detectSource, normalizeJobUrl } from "@/lib/fetch-offer";
import { markRecoGone } from "@/lib/offer-ops";
import { spendAi, AI_COST } from "@/lib/quota";

export const maxDuration = 60;

type Body = { url?: string; text?: string; source?: string; external_id?: string; reco_id?: string; app_id?: string; force?: boolean };

export async function POST(req: Request) {
  return handle(52_000, async () => {
    const { supabase, user } = await requireUser();
    const body = (await req.json()) as Body;
    const rawUrl = body.url?.trim() || undefined;
    const url = rawUrl ? normalizeJobUrl(rawUrl) : undefined;
    let text = (body.text?.trim() || "").slice(0, 30000);

    // Déjà analysée : on la rouvre au lieu de consommer du quota IA pour rien
    if (url && !body.force) {
      const { data: dup } = await supabase.from("offers").select("id, score, analysis").in("url", [...new Set([url, rawUrl!])]).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (dup) {
        await link(supabase, body, dup.id, dup.score, dup.analysis?.recommended_variant);
        return { id: dup.id, existing: true };
      }
    }

    if (!text && url) {
      const read = await readOffer(url);
      // Annonce retirée : inutile de dépenser de l'IA dessus, et on la range pour qu'elle ne revienne pas dans À trier
      if (read.gone) {
        if (body.reco_id) await markRecoGone(supabase, body.reco_id);
        throw new HttpError(410, goneMessage(Boolean(body.reco_id)));
      }
      text = read.text ?? "";
      if (!text) throw new HttpError(422, "Impossible de lire cette page (LinkedIn et Indeed bloquent souvent la lecture automatique). Colle le texte de l'offre.");
    }
    if (text.length < 150) throw new HttpError(400, "Le texte de l'offre est trop court : colle l'annonce complète.");

    await spendAi(supabase, user, AI_COST.offer);
    const profile = await getProfile(supabase, user);
    const extracted = await extractOffer(text, url);
    const analysis = await analyzeOffer(profile, extracted);

    const { data, error } = await supabase
      .from("offers")
      .insert({
        user_id: user.id,
        url,
        source: body.source ?? detectSource(url),
        external_id: body.external_id ?? null,
        title: extracted.title,
        company: extracted.company,
        location: extracted.location,
        contract: extracted.contract,
        raw_text: text.slice(0, 30000),
        extracted,
        analysis,
        score: analysis.score,
      })
      .select("id")
      .single();
    if (error) throw error;
    await link(supabase, body, data.id, analysis.score, analysis.recommended_variant);
    return { id: data.id };
  });
}

type Sb = Awaited<ReturnType<typeof requireUser>>["supabase"];

/** Rattache l'offre analysée à la recommandation et/ou à la candidature d'où elle vient. */
async function link(supabase: Sb, body: Body, offerId: string, score: number | null, variant?: string) {
  if (body.reco_id) {
    const { data: r } = await supabase.from("recommendations").select("status").eq("id", body.reco_id).maybeSingle();
    await supabase.from("recommendations").update({ status: r?.status === "accepted" ? "accepted" : "analyzed", offer_id: offerId }).eq("id", body.reco_id);
  }
  if (body.app_id) {
    await supabase.from("applications").update({ offer_id: offerId, score, cv_variant: variant ?? null }).eq("id", body.app_id);
    await supabase.from("offers").update({ decision: "accepted" }).eq("id", offerId);
    await supabase.from("documents").update({ application_id: body.app_id }).eq("offer_id", offerId).is("application_id", null);
  }
}
