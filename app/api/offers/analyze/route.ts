import { requireUser, HttpError } from "@/lib/supabase/server";
import { handle } from "@/lib/http";
import { getProfile } from "@/lib/profile";
import { extractOffer, analyzeOffer } from "@/lib/ai";
import { readOfferWithReader, goneMessage, detectSource, normalizeJobUrl, unreadableMessage } from "@/lib/fetch-offer";
import { markRecoGone } from "@/lib/offer-ops";
import { spendAi, AI_COST } from "@/lib/quota";
import { recoText } from "@/lib/reco-text";
import type { OfferAnalysis } from "@/lib/types";

export const maxDuration = 60;

type Body = { url?: string; text?: string; source?: string; external_id?: string; reco_id?: string; app_id?: string; force?: boolean; allow_partial?: boolean };

export async function POST(req: Request) {
  return handle(52_000, async () => {
    const { supabase, user } = await requireUser();
    const body = (await req.json()) as Body;
    const rawUrl = body.url?.trim() || undefined;
    const url = rawUrl ? normalizeJobUrl(rawUrl) : undefined;
    let text = (body.text?.trim() || "").slice(0, 30000);
    let extract = ""; // simple extrait de liste ou d'alerte : l'annonce n'a pas été lue en entier
    let partial = false;

    // Texte déjà en base pour cette offre recommandée (page lue par le favori, recherche automatique) : inutile de relire un site souvent bloqué
    if (!text && body.reco_id) {
      const { data: reco } = await supabase.from("recommendations").select("origin, snippet").eq("id", body.reco_id).maybeSingle();
      text = recoText(reco ?? {}).slice(0, 30000);
      extract = (reco?.snippet ?? "").trim();
    }

    // Déjà analysée : on la rouvre au lieu de consommer du quota IA pour rien
    // (sauf si cette analyse n'était qu'une estimation d'après un extrait et qu'on a maintenant l'annonce entière : on la refait)
    let upgradeId: string | null = null;
    if (url && !body.force) {
      const { data: dup } = await supabase.from("offers").select("id, score, analysis").in("url", [...new Set([url, rawUrl!])]).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (dup) {
        if (dup.analysis?.estimated && text.length >= 300) upgradeId = dup.id;
        else {
          await link(supabase, body, dup.id, dup.score, dup.analysis?.recommended_variant);
          return { id: dup.id, existing: true };
        }
      }
    }

    if (!text && url) {
      const read = await readOfferWithReader(url);
      // Annonce retirée : inutile de dépenser de l'IA dessus, et on la range pour qu'elle ne revienne pas dans À trier
      if (read.gone) {
        if (body.reco_id) await markRecoGone(supabase, body.reco_id);
        throw new HttpError(410, goneMessage(Boolean(body.reco_id)));
      }
      text = read.text ?? "";
    }
    // Page illisible (Indeed, LinkedIn, Glassdoor…) mais on a un extrait : on analyse quand même, le pourcentage sera marqué « estimé »
    if (!text && body.allow_partial && extract.length >= 150) {
      text = extract.slice(0, 30000);
      partial = true;
    }
    if (!text && url) throw new HttpError(422, unreadableMessage(url));
    if (text.length < 150) throw new HttpError(400, "Le texte de l'offre est trop court : colle l'annonce complète.");

    await spendAi(supabase, user, AI_COST.offer);
    const profile = await getProfile(supabase, user);
    const extracted = await extractOffer(text, url);
    const analysis: OfferAnalysis = { ...(await analyzeOffer(profile, extracted)), ...(partial ? { estimated: true } : {}) };

    const fields = {
      title: extracted.title,
      company: extracted.company,
      location: extracted.location,
      contract: extracted.contract,
      raw_text: text.slice(0, 30000),
      extracted,
      analysis,
      score: analysis.score,
    };
    let offerId: string;
    if (upgradeId) {
      const { error } = await supabase.from("offers").update(fields).eq("id", upgradeId);
      if (error) throw error;
      offerId = upgradeId;
    } else {
      const { data, error } = await supabase
        .from("offers")
        .insert({ user_id: user.id, url, source: body.source ?? detectSource(url), external_id: body.external_id ?? null, ...fields })
        .select("id")
        .single();
      if (error) throw error;
      offerId = data.id as string;
    }
    await link(supabase, body, offerId, analysis.score, analysis.recommended_variant);
    return { id: offerId, estimated: partial || undefined };
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
