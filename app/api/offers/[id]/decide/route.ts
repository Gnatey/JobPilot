import { requireUser, HttpError } from "@/lib/supabase/server";
import { handle } from "@/lib/http";
import { ensureApplication, ensureGivenUp, findApplication, undoGivenUp } from "@/lib/offer-ops";

/** Même logique que les recommandations, pour une offre analysée à la main. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { supabase, user } = await requireUser();
    const { decision, reason, status } = (await req.json()) as { decision: "accept" | "reject" | "restore" | "undo" | "unsend"; reason?: string; status?: string };
    const { data: offer } = await supabase.from("offers").select("*").eq("id", id).single();
    if (!offer) throw new HttpError(404, "Offre introuvable");

    // « Je ne postule pas » : l'offre part dans Suivi, en Abandonné (ou « Offre plus disponible »), avec sa raison pour l'apprentissage
    if (decision === "reject") {
      const app = await findApplication(supabase, { offer_id: id });
      if (app && !["a_postuler", "abandonne", "expiree"].includes(app.status)) {
        throw new HttpError(409, "Cette candidature est déjà envoyée : dans Suivi, utilise « Pas retenu » ou change son statut.");
      }
      await supabase.from("offers").update({ decision: "rejected", reject_reason: reason ?? "autre" }).eq("id", id);
      await supabase.from("recommendations").update({ status: "rejected", reject_reason: reason ?? "autre", decided_at: new Date().toISOString() }).eq("offer_id", id);
      await ensureGivenUp(supabase, user, {
        offer_id: id, company: offer.company, title: offer.title, url: offer.url, location: offer.location, contract: offer.contract, channel: offer.source, score: offer.score,
      }, reason);
      return { ok: true };
    }
    // Retour en arrière après « Je candidate » : l'offre sort du suivi tant que la candidature n'est pas partie
    if (decision === "undo") {
      const { data: app } = await supabase.from("applications").select("id,status").eq("offer_id", id).maybeSingle();
      if (app && app.status !== "a_postuler") throw new HttpError(409, "Cette candidature est déjà envoyée : annule d'abord l'envoi.");
      if (app) await supabase.from("applications").delete().eq("id", app.id);
      await supabase.from("offers").update({ decision: null, reject_reason: null }).eq("id", id);
      await supabase.from("recommendations").update({ status: "analyzed", reject_reason: null, decided_at: null }).eq("offer_id", id);
      return { ok: true };
    }
    // Retour en arrière après « J'ai envoyé ma candidature » : elle repasse à postuler
    if (decision === "unsend") {
      await supabase.from("applications").update({ status: "a_postuler", applied_at: null, next_action_at: null }).eq("offer_id", id).eq("status", "postule");
      return { ok: true };
    }
    if (decision === "restore") {
      await supabase.from("offers").update({ decision: null, reject_reason: null }).eq("id", id);
      await supabase.from("recommendations").update({ status: "analyzed", reject_reason: null, decided_at: null }).eq("offer_id", id);
      await undoGivenUp(supabase, { offer_id: id }, status); // status: « a_postuler » quand l'offre y était avant d'être abandonnée
      return { ok: true };
    }
    await supabase.from("offers").update({ decision: "accepted", reject_reason: null }).eq("id", id);
    await supabase.from("recommendations").update({ status: "accepted", decided_at: new Date().toISOString() }).eq("offer_id", id);
    const { data: cv } = await supabase.from("documents").select("variant").eq("offer_id", id).eq("kind", "cv").order("created_at", { ascending: false }).limit(1).maybeSingle();
    const applicationId = await ensureApplication(supabase, user, {
      offer_id: id, company: offer.company, title: offer.title, url: offer.url, location: offer.location, contract: offer.contract,
      channel: offer.source, score: offer.score, cv_variant: cv?.variant ?? offer.analysis?.recommended_variant ?? null,
    }, status ?? "a_postuler");
    return { application_id: applicationId };
  });
}
