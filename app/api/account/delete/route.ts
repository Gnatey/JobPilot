import { createClient } from "@supabase/supabase-js";
import { requireUser, HttpError } from "@/lib/supabase/server";
import { handle } from "@/lib/http";

/** Supprime le compte et toutes ses données (les tables sont reliées en cascade à l'utilisateur). */
export async function POST(req: Request) {
  return handle(async () => {
    const { supabase, user } = await requireUser();
    const { confirm } = (await req.json()) as { confirm?: string };
    if (confirm !== "SUPPRIMER") throw new HttpError(400, "Tape SUPPRIMER pour confirmer.");
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new HttpError(501, "La suppression du compte demande SUPABASE_SERVICE_ROLE_KEY dans Vercel. Ajoute-la, redéploie, puis recommence.");

    // On coupe d'abord l'accès Gmail chez Google
    const { data: g } = await supabase.from("gmail_accounts").select("refresh_token").eq("user_id", user.id).maybeSingle();
    if (g?.refresh_token) await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(g.refresh_token)}`, { method: "POST" }).catch(() => {});

    const admin = createClient(url, key, { auth: { persistSession: false } });
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) throw new HttpError(500, `Suppression impossible : ${error.message}`);
    return { ok: true };
  });
}
