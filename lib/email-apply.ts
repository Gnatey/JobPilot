import type { SupabaseClient } from "@supabase/supabase-js";
import { nextStatus } from "./email-match";

/**
 * Un e-mail de recruteur lu par la synchro : on fait avancer la candidature visée, PUIS on range l'e-mail.
 * Audit du 16 novembre 2026 : avant, l'e-mail était rangé d'abord et l'erreur de la mise à jour de la candidature était ignorée.
 * Une candidature qui ne se mettait pas à jour restait donc sans changement pour de bon, car la synchro suivante voyait l'e-mail
 * « déjà connu » et ne le relisait plus.
 * Maintenant : si l'une des deux écritures échoue, `ok` est faux, la synchro le sait (`partial`, pas d'avance de la date de synchro)
 * et l'e-mail sera relu la fois suivante. Rejouable sans risque : une candidature déjà avancée ne bouge pas deux fois (`nextStatus`).
 */
export type MailRow = { id: string; threadId: string; from: string; subject: string; snippet: string; date: string };
export type AppRow = { id: string; status: string; applied_at?: string | null };

export async function applyEmail(
  supabase: SupabaseClient,
  userId: string,
  m: MailRow,
  category: string,
  app?: AppRow
): Promise<{ ok: boolean; moved: boolean }> {
  let moved = false;
  if (app) {
    const patch: Record<string, unknown> = { last_email_at: m.date };
    const target = nextStatus(app.status, category);
    if (target) {
      patch.status = target;
      if (target === "postule" && !app.applied_at) patch.applied_at = m.date.slice(0, 10);
      // Plus de date de relance : elle se déduit de la date de l'entretien (lib/followup.ts), pas de l'arrivée de l'email d'invitation
      if (["refuse", "offre", "entretien", "test"].includes(target)) patch.next_action_at = null;
    }
    const { error } = await supabase.from("applications").update(patch).eq("id", app.id);
    if (error) {
      console.error(`[synchro] candidature non mise à jour (${String((error as { code?: unknown }).code ?? "?")}) ${String(error.message ?? "")}`);
      return { ok: false, moved: false };
    }
    if (target) {
      app.status = target; // les e-mails suivants de la même synchro voient la nouvelle étape
      moved = true;
    }
  }
  const { error } = await supabase.from("emails").upsert(
    { user_id: userId, gmail_id: m.id, thread_id: m.threadId, from_addr: m.from, subject: m.subject, snippet: m.snippet, received_at: m.date, category, application_id: app?.id ?? null },
    { onConflict: "user_id,gmail_id" }
  );
  if (error) {
    console.error(`[synchro] e-mail non rangé (${String((error as { code?: unknown }).code ?? "?")}) ${String(error.message ?? "")}`);
    return { ok: false, moved };
  }
  return { ok: true, moved };
}
