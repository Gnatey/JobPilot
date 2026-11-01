import { requireUser } from "@/lib/supabase/server";
import { handle } from "@/lib/http";
import { sendDailyRecap } from "@/lib/recap";

/** Bouton « M'envoyer un test maintenant » des Réglages. */
export async function POST() {
  return handle(async () => {
    const { supabase, user } = await requireUser();
    return sendDailyRecap(supabase, user.id, { force: true });
  });
}
