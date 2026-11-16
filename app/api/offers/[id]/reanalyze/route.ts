import { requireUser, HttpError } from "@/lib/supabase/server";
import { handle } from "@/lib/http";
import { getProfile } from "@/lib/profile";
import { extractOffer, analyzeOffer } from "@/lib/ai";
import { readOfferWithReader, goneMessage } from "@/lib/fetch-offer";
import { spendAi, AI_COST } from "@/lib/quota";
import { mergeReread, withColumns } from "@/lib/offer-fiche";

export const maxDuration = 60;

/**
 * Refait l'analyse d'une offre (profil mis à jour, analyse ratée, score qui paraît faux). Les CV et lettres déjà écrits ne bougent pas.
 * Compte pour une analyse dans le quota du jour.
 * - `source: "fiche"` : l'analyse repart de la fiche telle qu'elle est (celle que la personne a corrigée à la main), sans relire l'annonce.
 * - sinon (par défaut) : l'annonce gardée est relue, puis analysée ; ce que la personne a rempli à la main dans la fiche est conservé (`mergeReread`).
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(52_000, async () => {
    const { id } = await ctx.params;
    const { supabase, user } = await requireUser();
    const fromFiche = ((await req.json().catch(() => ({}))) as { source?: unknown }).source === "fiche";
    const { data: offer } = await supabase.from("offers").select("*").eq("id", id).maybeSingle();
    if (!offer) throw new HttpError(404, "Offre introuvable");

    if (fromFiche) {
      if (!offer.extracted) throw new HttpError(422, "Cette offre n'a pas encore de fiche : lance d'abord l'analyse.");
      await spendAi(supabase, user, AI_COST.offer);
      const profile = await getProfile(supabase, user);
      const analysis = await analyzeOffer(profile, withColumns(offer.extracted, offer));
      const { error } = await supabase.from("offers").update({ analysis, score: analysis.score }).eq("id", id);
      if (error) throw error;
      await supabase.from("applications").update({ score: analysis.score }).eq("offer_id", id); // un seul pourcentage par offre
      return { score: analysis.score, before: offer.score ?? null };
    }

    let text = String(offer.raw_text ?? "").trim();
    if (text.length < 300 && offer.url) {
      const read = await readOfferWithReader(offer.url);
      if (read.gone) throw new HttpError(410, goneMessage(false, read.why));
      text = read.text ?? text;
    }
    if (text.length < 150) throw new HttpError(422, "Je n'ai plus le texte de cette annonce : colle-le dans « Analyser une offre ».");

    await spendAi(supabase, user, AI_COST.offer);
    const profile = await getProfile(supabase, user);
    const read = await extractOffer(text, offer.url ?? undefined);
    const extracted = mergeReread(offer.extracted, read, offer); // ce que la personne a rempli à la main reste
    const analysis = await analyzeOffer(profile, extracted);
    const { error } = await supabase.from("offers").update({
      title: extracted.title || offer.title, company: extracted.company || offer.company, location: extracted.location || offer.location,
      contract: extracted.contract ?? offer.contract, raw_text: text.slice(0, 30000), extracted, analysis, score: analysis.score,
    }).eq("id", id);
    if (error) throw error;
    await supabase.from("applications").update({ score: analysis.score }).eq("offer_id", id); // un seul pourcentage par offre
    return { score: analysis.score, before: offer.score ?? null };
  });
}
