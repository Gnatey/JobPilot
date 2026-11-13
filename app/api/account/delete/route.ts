import { createClient } from "@supabase/supabase-js";
import { requireUser, HttpError } from "@/lib/supabase/server";
import { handle } from "@/lib/http";
import { recentlyAuthenticated } from "@/lib/reauth";
import { openToken } from "@/lib/token-crypto";
import { rateLimit } from "@/lib/rate-limit";
import { isDeleteWord } from "@/lib/delete-word";

/** Supprime le compte et toutes ses données (les tables sont reliées en cascade à l'utilisateur). */
export async function POST(req: Request) {
  return handle(async () => {
    const { supabase, user } = await requireUser();
    await rateLimit(supabase, "deleteAccount");
    const { confirm } = (await req.json()) as { confirm?: string };
    if (!isDeleteWord(confirm)) throw new HttpError(400, "Tape SUPPRIMER pour confirmer.");
    // Action sans retour : seulement juste après une connexion (mot de passe, lien ou code), pas avec une vieille session restée ouverte
    const { data: auth } = await supabase.auth.getClaims();
    if (!recentlyAuthenticated(auth?.claims?.amr, Date.now())) throw new HttpError(403, "Pour ta sécurité, reconnecte-toi avant de supprimer ton compte : déconnecte-toi, reconnecte-toi, puis reviens ici dans les 10 minutes.");
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new HttpError(501, "La suppression du compte demande SUPABASE_SERVICE_ROLE_KEY dans Vercel. Ajoute-la, redéploie, puis recommence.");

    // On coupe d'abord l'accès Gmail chez Google
    const { data: g } = await supabase.from("gmail_accounts").select("refresh_token").eq("user_id", user.id).maybeSingle();
    const plain = g?.refresh_token ? await openToken(g.refresh_token, user.id).catch(() => null) : null; // illisible : on supprime quand même
    if (plain) await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(plain)}`, { method: "POST" }).catch(() => {});

    const admin = createClient(url, key, { auth: { persistSession: false } });
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) throw new HttpError(500, `Suppression impossible : ${error.message}`);
    return { ok: true };
  });
}
