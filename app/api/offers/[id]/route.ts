import { requireUser, HttpError } from "@/lib/supabase/server";
import { handle } from "@/lib/http";
import { deletionReason, planOfferDeletion, REJECTABLE_RECO } from "@/lib/offer-delete";

/**
 * Supprime une offre. Ses documents partent avec elle.
 * Une candidature jamais envoyée (à postuler, abandonnée, offre plus disponible) disparaît aussi du suivi ;
 * une candidature envoyée est conservée, simplement détachée de l'offre.
 * Une recommandation encore « analysée » redevient « à trier » ; une recommandation déjà tranchée garde sa décision (elle nourrit l'apprentissage).
 * Avec une raison (corps `{ reason }`, la même liste que « Je ne postule pas »), la recommandation est écartée avec cette raison : le tri apprend
 * — sauf si une candidature est partie, auquel cas la décision « oui » reste.
 */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { supabase } = await requireUser();
    const reason = deletionReason(((await req.json().catch(() => ({}))) as { reason?: unknown }).reason);
    const { data: offer } = await supabase.from("offers").select("id").eq("id", id).maybeSingle();
    if (!offer) throw new HttpError(404, "Offre introuvable");
    const { data: apps } = await supabase.from("applications").select("status, applied_at").eq("offer_id", id);
    const plan = planOfferDeletion(apps, reason);
    await supabase.from("applications").delete().eq("offer_id", id).in("status", ["a_postuler", "abandonne", "expiree"]).is("applied_at", null);
    // Avant la suppression de l'offre : ensuite, la recommandation n'a plus de lien avec elle
    if (plan.rejectRecos) {
      await supabase.from("recommendations").update({ status: "rejected", reject_reason: reason, decided_at: new Date().toISOString() }).eq("offer_id", id).in("status", [...REJECTABLE_RECO]);
    } else {
      await supabase.from("recommendations").update({ status: "new" }).eq("offer_id", id).eq("status", "analyzed");
    }
    const { error } = await supabase.from("offers").delete().eq("id", id);
    if (error) throw error;
    return { ok: true };
  });
}
