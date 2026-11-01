import { requireUser } from "@/lib/supabase/server";
import { handle } from "@/lib/http";
import { activeSources } from "@/lib/sources";

/** Sources d'offres automatiques branchées sur cette installation (pour adapter la page Recherche). */
export async function GET() {
  return handle(async () => {
    await requireUser();
    return { sources: activeSources().map((s) => ({ id: s.id, label: s.label })) };
  });
}
