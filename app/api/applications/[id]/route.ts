import { requireUser, HttpError } from "@/lib/supabase/server";
import { handle } from "@/lib/http";
import { isUnsentApp } from "@/lib/app-pick";
import { deletionReason } from "@/lib/offer-delete";
import { rejectRecosOfApplication } from "@/lib/offer-ops";

/**
 * Supprime une ligne « À analyser » d'Offres & CV (candidature sans analyse), avec une raison facultative (corps `{ reason }`).
 * Seule une ligne jamais envoyée peut partir par ici : une candidature envoyée se gère dans Suivi.
 */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { supabase } = await requireUser();
    const reason = deletionReason(((await req.json().catch(() => ({}))) as { reason?: unknown }).reason);
    const { data: app } = await supabase.from("applications").select("id, title, company, url, status, applied_at").eq("id", id).maybeSingle();
    if (!app) throw new HttpError(404, "Ligne introuvable");
    if (!isUnsentApp(app)) throw new HttpError(409, "Cette candidature est déjà envoyée : elle se gère dans Suivi.");
    if (reason) await rejectRecosOfApplication(supabase, app, reason);
    const { error } = await supabase.from("applications").delete().eq("id", id);
    if (error) throw error;
    return { ok: true };
  });
}
