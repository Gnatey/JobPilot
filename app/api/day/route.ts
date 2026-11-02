import { requireUser } from "@/lib/supabase/server";
import { handle } from "@/lib/http";
import { getProfile } from "@/lib/profile";
import { ensureFit } from "@/lib/fit-stock";
import { buildDay } from "@/lib/day";

export const maxDuration = 60;

/** Bouton 2 de la page Recherche : « Préparer ma journée », puis « Voir d'autres offres du même type » (`more`). */
export async function POST(req: Request) {
  return handle(52_000, async () => {
    const { supabase, user } = await requireUser();
    const { more } = (await req.json().catch(() => ({}))) as { more?: boolean };
    const profile = await getProfile(supabase, user);
    await ensureFit(supabase, user.id, profile).catch(() => null);
    return buildDay(supabase, user, profile, { more: more === true });
  });
}
