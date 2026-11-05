import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { CONFIRMED_COOKIE, returnTarget } from "@/lib/auth-return";

/** Corps commun de /auth/callback (connexion par e-mail, mot de passe oublié) et /auth/confirme (confirmation d'inscription). */
export async function handleAuthReturn(req: NextRequest, confirmation: boolean) {
  const q = req.nextUrl.searchParams;
  const code = q.get("code");
  let exchanged = false;
  if (code) {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    exchanged = !error;
  }
  const target = returnTarget({ hasCode: Boolean(code), exchanged, hasError: q.has("error") || q.has("error_code"), confirmation, next: q.get("next") });
  const res = NextResponse.redirect(new URL(target.to, req.url));
  // Témoin lisible par la page (aucun secret) : 2 minutes suffisent pour arriver dans l'appli
  if (target.flag) res.cookies.set(CONFIRMED_COOKIE, "1", { maxAge: 120, path: "/", sameSite: "lax", secure: req.nextUrl.protocol === "https:" });
  return res;
}
