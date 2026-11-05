import { createClient } from "@supabase/supabase-js";
import { requireUser, HttpError } from "@/lib/supabase/server";
import { handle } from "@/lib/http";
import { SAFE_SUPABASE_KEY, SAFE_SUPABASE_URL } from "@/lib/env";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Vérifie l'ancien mot de passe sans toucher à la session du navigateur.
 * (Se reconnecter côté navigateur ferait retomber la session au niveau 1 : avec la vérification
 * en deux étapes activée, Supabase refuserait ensuite le changement de mot de passe.)
 */
export async function POST(req: Request) {
  return handle(async () => {
    const { supabase, user } = await requireUser();
    await rateLimit(supabase, "password");
    const { password } = (await req.json()) as { password?: string };
    if (!user.email || !password) throw new HttpError(400, "Ancien mot de passe manquant.");
    const tmp = createClient(SAFE_SUPABASE_URL, SAFE_SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const { error } = await tmp.auth.signInWithPassword({ email: user.email, password });
    if (error) throw new HttpError(401, "L'ancien mot de passe n'est pas le bon.");
    await tmp.auth.signOut({ scope: "local" }).catch(() => {}); // ferme seulement cette session temporaire
    return { ok: true };
  });
}
