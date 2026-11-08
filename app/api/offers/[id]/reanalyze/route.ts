import { requireUser, HttpError } from "@/lib/supabase/server";
import { handle } from "@/lib/http";
import { getProfile } from "@/lib/profile";
import { extractOffer, analyzeOffer } from "@/lib/ai";
import { readOfferWithReader, goneMessage } from "@/lib/fetch-offer";
import { spendAi, AI_COST } from "@/lib/quota";

export const maxDuration = 60;

/**
 * Refait l'analyse d'une offre (profil mis à jour, analyse ratée, score qui paraît faux) sur le texte déjà gardé.
 * Les CV et lettres déjà écrits ne bougent pas. Compte pour une analyse dans le quota du jour.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(52_000, async () => {
    const { id } = await ctx.params;
    const { supabase, user } = await requireUser();
    const { data: offer } = await supabase.from("offers").select("*").eq("id", id).maybeSingle();
    if (!offer) throw new HttpError(404, "Offre introuvable");

    let text = String(offer.raw_text ?? "").trim();
    if (text.length < 300 && offer.url) {
      const read = await readOfferWithReader(offer.url);
      if (read.gone) throw new HttpError(410, goneMessage(false, read.why));
      text = read.text ?? text;
    }
    if (text.length < 150) throw new HttpError(422, "Je n'ai plus le texte de cette annonce : colle-le dans « Analyser une offre ».");

    await spendAi(supabase, user, AI_COST.offer);
    const profile = await getProfile(supabase, user);
    const extracted = await extractOffer(text, offer.url ?? undefined);
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
