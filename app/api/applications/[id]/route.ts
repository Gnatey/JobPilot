import { requireUser, HttpError } from "@/lib/supabase/server";
import { handle } from "@/lib/http";
import { isRemovableToApply } from "@/lib/app-pick";
import { deletionReason } from "@/lib/offer-delete";
import { rejectRecosOfApplication } from "@/lib/offer-ops";

/**
 * Supprime une ligne « À analyser » d'Offres & CV (candidature sans analyse), avec une raison facultative (corps `{ reason }`).
 * Seule une ligne jamais envoyée peut partir par ici : une candidature envoyée se gère dans Suivi. Une ligne « À postuler » avec une date d'envoi
 * laissée par une ancienne synchro, sans note, contact, salaire ni entretien, part aussi (`isRemovableToApply`) : elle bloquait la suppression.
 */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { supabase } = await requireUser();
    const reason = deletionReason(((await req.json().catch(() => ({}))) as { reason?: unknown }).reason);
    const { data: app } = await supabase.from("applications").select("id, title, company, url, status, applied_at, notes, contact, salary, interview_at").eq("id", id).maybeSingle();
    if (!app) throw new HttpError(404, "Ligne introuvable");
    if (!isRemovableToApply(app)) throw new HttpError(409, "Cette candidature est déjà envoyée : elle se gère dans Suivi.");
    if (reason) await rejectRecosOfApplication(supabase, app, reason);
    const { error } = await supabase.from("applications").delete().eq("id", id);
    if (error) throw error;
    return { ok: true };
  });
}
