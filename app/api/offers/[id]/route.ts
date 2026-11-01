import { requireUser, HttpError } from "@/lib/supabase/server";
import { handle } from "@/lib/http";

/**
 * Supprime une offre. Ses documents partent avec elle.
 * Une candidature jamais envoyée (à postuler, abandonnée, offre plus disponible) disparaît aussi du suivi ;
 * une candidature envoyée est conservée, simplement détachée de l'offre.
 * Une recommandation encore « analysée » redevient « à trier » ; une recommandation déjà tranchée garde sa décision (elle nourrit l'apprentissage).
 */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { supabase } = await requireUser();
    const { data: offer } = await supabase.from("offers").select("id").eq("id", id).maybeSingle();
    if (!offer) throw new HttpError(404, "Offre introuvable");
    await supabase.from("applications").delete().eq("offer_id", id).in("status", ["a_postuler", "abandonne", "expiree"]).is("applied_at", null);
    await supabase.from("recommendations").update({ status: "new" }).eq("offer_id", id).eq("status", "analyzed");
    const { error } = await supabase.from("offers").delete().eq("id", id);
    if (error) throw error;
    return { ok: true };
  });
}
