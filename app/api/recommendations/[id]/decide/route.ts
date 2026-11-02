import { requireUser, HttpError } from "@/lib/supabase/server";
import { handle } from "@/lib/http";
import { fetchOfferText } from "@/lib/fetch-offer";
import { createAnalyzedOffer, ensureApplication, ensureGivenUp, undoGivenUp } from "@/lib/offer-ops";
import { externalId } from "@/lib/sources";
import { recoText } from "@/lib/reco-text";
import { cleanReason } from "@/lib/types";

export const maxDuration = 60;

type Body = { decision: "accept" | "reject" | "restore"; reason?: string; analyze?: boolean; to_suivi?: boolean };

/**
 * « Je candidate » : l'offre passe tout de suite dans le suivi (À postuler). L'analyse par l'IA, qui coûte du quota,
 * n'est lancée qu'au moment de préparer le CV (ou avec analyze: true).
 * « Pas pour moi » : elle passe dans les Écartées avec sa raison ; l'app en tire des règles de tri.
 * Depuis le Tri rapide (to_suivi), elle est en plus rangée dans Suivi, en Abandonné.
 * « Remettre à trier » : annule l'un ou l'autre, y compris la candidature créée à la volée.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(52_000, async () => {
    const { id } = await ctx.params;
    const { supabase, user } = await requireUser();
    const body = (await req.json()) as Body;
    const { decision, analyze, to_suivi } = body;
    const reason = cleanReason(body.reason) ?? undefined; // « autre » peut porter un pourquoi libre, borné
    const { data: reco } = await supabase.from("recommendations").select("*").eq("id", id).single();
    if (!reco) throw new HttpError(404, "Offre introuvable");
    const now = new Date().toISOString();

    if (decision === "reject") {
      await supabase.from("recommendations").update({ status: "rejected", reject_reason: reason ?? "autre", decided_at: now }).eq("id", id);
      if (reco.offer_id) await supabase.from("offers").update({ decision: "rejected", reject_reason: reason ?? "autre" }).eq("id", reco.offer_id);
      if (to_suivi) {
        const { data: o } = reco.offer_id ? await supabase.from("offers").select("score, contract").eq("id", reco.offer_id).maybeSingle() : { data: null };
        await ensureGivenUp(supabase, user, {
          offer_id: reco.offer_id, company: reco.company, title: reco.title, url: reco.url, location: reco.location, contract: o?.contract ?? null, channel: reco.source, score: o?.score ?? null,
        }, reason);
      }
      return { ok: true };
    }

    if (decision === "restore") {
      await supabase.from("recommendations").update({ status: reco.offer_id ? "analyzed" : "new", reject_reason: null, decided_at: null }).eq("id", id);
      if (reco.offer_id) await supabase.from("offers").update({ decision: null, reject_reason: null }).eq("id", reco.offer_id);
      // Annuler un « Pas pour moi » du Tri rapide : la ligne d'Abandonné disparaît du suivi
      if (reco.status === "rejected") await undoGivenUp(supabase, { offer_id: reco.offer_id, url: reco.url, title: reco.title, company: reco.company });
      // Annuler un « Je candidate » : on retire la candidature créée si rien n'a encore été fait dessus
      if (reco.status === "accepted") {
        const q = supabase.from("applications").select("id").eq("status", "a_postuler");
        const { data: apps } = await (reco.offer_id ? q.eq("offer_id", reco.offer_id) : reco.url ? q.eq("url", reco.url) : q.eq("title", reco.title ?? "").eq("company", reco.company ?? ""));
        for (const a of apps ?? []) {
          const { count } = await supabase.from("documents").select("id", { count: "exact", head: true }).eq("application_id", a.id);
          if (!count) await supabase.from("applications").delete().eq("id", a.id);
        }
      }
      return { ok: true };
    }

    // accept
    let offer = reco.offer_id ? (await supabase.from("offers").select("*").eq("id", reco.offer_id).single()).data : null;
    if (offer) {
      await supabase.from("offers").update({ decision: "accepted", reject_reason: null }).eq("id", offer.id);
    } else if (analyze) {
      let text = recoText(reco);
      if (text.length < 300 && reco.url) text = (await fetchOfferText(reco.url)) ?? "";
      if (text.length >= 300) {
        try {
          offer = await createAnalyzedOffer(supabase, user, {
            text, url: reco.url, source: reco.source,
            external_id: /^(ft|az|jb):/.test(reco.dedupe_key ?? "") ? externalId(reco.dedupe_key) : null, decision: "accepted",
          });
        } catch (e) {
          // Quota IA du jour atteint : la candidature est créée quand même, l'analyse se fera plus tard
          if (!(e instanceof HttpError && e.status === 429)) throw e;
        }
      }
    }

    const applicationId = await ensureApplication(supabase, user, {
      offer_id: offer?.id ?? null,
      company: offer?.company || reco.company,
      title: offer?.title || reco.title,
      url: reco.url ?? offer?.url,
      location: offer?.location || reco.location,
      contract: offer?.contract ?? null,
      channel: reco.source,
      score: offer?.score ?? null, // un seul pourcentage par offre : celui de l'analyse complète (le pré-tri n'est pas recopié dans le suivi)
      cv_variant: offer?.analysis?.recommended_variant ?? null,
    });
    await supabase.from("recommendations").update({ status: "accepted", decided_at: now, reject_reason: null, offer_id: offer?.id ?? null }).eq("id", id);
    return { application_id: applicationId, offer_id: offer?.id ?? null, needs_text: !offer };
  });
}
