import { requireAdminApi } from "@/lib/admin-guard";
import { handle } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { probeSources } from "@/lib/sources";

export const maxDuration = 30;

/**
 * Réservé à l'admin : vérifie chaque source d'offres branchée avec une vraie requête (clé valable, quota, réponse).
 * Une requête par source, donc plafonnée (le quota gratuit est partagé par tous les comptes).
 */
export async function POST() {
  return handle(25_000, async () => {
    const { supabase } = await requireAdminApi();
    await rateLimit(supabase, "testSources");
    return { sources: await probeSources() };
  });
}
