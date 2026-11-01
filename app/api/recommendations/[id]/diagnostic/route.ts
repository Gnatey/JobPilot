import { requireUser, HttpError } from "@/lib/supabase/server";
import { handle } from "@/lib/http";
import { readOffer, goneMessage } from "@/lib/fetch-offer";
import { createAnalyzedOffer, markRecoGone } from "@/lib/offer-ops";
import { externalId } from "@/lib/sources";
import { recoText } from "@/lib/reco-text";

export const maxDuration = 60;

/**
 * « Voir le diagnostic » : lance la vraie analyse (IA) d'une offre recommandée, à partir de l'annonce déjà lue
 * ou, à défaut, de la page elle-même. Sans texte exploitable, on le dit clairement au lieu d'inventer un score.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(52_000, async () => {
    const { id } = await ctx.params;
    const { supabase, user } = await requireUser();
    const { data: reco } = await supabase.from("recommendations").select("*").eq("id", id).single();
    if (!reco) throw new HttpError(404, "Offre introuvable");
    if (reco.offer_id) return { offer_id: reco.offer_id };

    if (reco.url) {
      const { data: dup } = await supabase.from("offers").select("id").eq("url", reco.url).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (dup) {
        await supabase.from("recommendations").update({ status: reco.status === "accepted" ? "accepted" : "analyzed", offer_id: dup.id }).eq("id", id);
        return { offer_id: dup.id };
      }
    }

    let text = recoText(reco);
    if (text.length < 300 && reco.url) {
      const read = await readOffer(reco.url);
      if (read.gone) {
        await markRecoGone(supabase, id);
        throw new HttpError(410, goneMessage(true));
      }
      text = read.text ?? "";
    }
    if (text.length < 300) {
      throw new HttpError(422, "Je n'ai pas le texte complet de cette annonce. Ouvre-la dans ton navigateur et clique sur le favori « Envoyer à JobPilot », ou colle le texte.");
    }
    const offer = await createAnalyzedOffer(supabase, user, {
      text, url: reco.url, source: reco.source,
      external_id: /^(ft|az|jb):/.test(reco.dedupe_key ?? "") ? externalId(reco.dedupe_key) : null,
      decision: reco.status === "accepted" ? "accepted" : null,
    });
    await supabase.from("recommendations").update({ status: reco.status === "accepted" ? "accepted" : "analyzed", offer_id: offer.id }).eq("id", id);
    return { offer_id: offer.id };
  });
}
