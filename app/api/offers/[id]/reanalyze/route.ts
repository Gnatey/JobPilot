import { requireUser, HttpError } from "@/lib/supabase/server";
import { handle } from "@/lib/http";
import { getProfile } from "@/lib/profile";
import { extractOffer, analyzeOffer } from "@/lib/ai";
import { readOfferWithReader, goneMessage } from "@/lib/fetch-offer";
import { spendAi, AI_COST } from "@/lib/quota";
import { mergeReread, withColumns } from "@/lib/offer-fiche";
import { readPastedText } from "@/lib/offer-text";
import { must } from "@/lib/db-must";

export const maxDuration = 60;

/**
 * Refait l'analyse d'une offre (profil mis à jour, analyse ratée, score qui paraît faux). Les CV et lettres déjà écrits ne bougent pas.
 * Compte pour une analyse dans le quota du jour.
 * - `source: "fiche"` : l'analyse repart de la fiche telle qu'elle est (celle que la personne a corrigée à la main), sans relire l'annonce.
 * - `text` : la personne a collé l'annonce ENTIÈRE (« Coller l'annonce », lib/offer-text.ts) : elle remplace le texte gardé, est relue par l'IA, puis analysée ;
 *   ce que la personne a rempli à la main dans la fiche est conservé (`mergeReread`). Le texte est rangé AVANT d'appeler l'IA : s'il échoue (IA saturée,
 *   limite du jour), il reste sur l'offre et « Refaire l'analyse » le relira.
 * - sinon (par défaut) : l'annonce gardée est relue, puis analysée ; ce que la personne a rempli à la main dans la fiche est conservé (`mergeReread`).
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(52_000, async () => {
    const { id } = await ctx.params;
    const { supabase, user } = await requireUser();
    const body = (await req.json().catch(() => ({}))) as { source?: unknown; text?: unknown };
    const fromFiche = body.source === "fiche";
    const hasText = body.text !== undefined && !fromFiche;
    const pasted = hasText ? readPastedText(body.text) : null;
    if (pasted && !pasted.ok) throw new HttpError(400, pasted.error);
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

    let text = pasted?.ok ? pasted.text : String(offer.raw_text ?? "").trim();
    // Texte collé : rangé tout de suite sur l'offre, avant de dépenser de l'IA (il n'est jamais perdu si l'analyse échoue)
    if (pasted?.ok) must(await supabase.from("offers").update({ raw_text: text }).eq("id", id), "Le texte de l'annonce");
    if (!pasted && text.length < 300 && offer.url) {
      const read = await readOfferWithReader(offer.url);
      if (read.gone) throw new HttpError(410, goneMessage(false, read.why));
      text = read.text ?? text;
    }
    if (text.length < 150) throw new HttpError(422, "Je n'ai plus le texte de cette annonce : colle-le dans « Analyser une offre ».");

    try {
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
    } catch (e) {
      // Limite du jour, IA saturée… : le texte collé est resté sur l'offre, on le dit
      if (pasted && e instanceof HttpError && e.status !== 401) e.message = `${e.message} Le texte que tu as collé est gardé sur l'offre : « Refaire l'analyse » le relira.`;
      throw e;
    }
  });
}
