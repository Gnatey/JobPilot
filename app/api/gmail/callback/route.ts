import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer, getUser } from "@/lib/supabase/server";
import { appUrl, canSend, exchangeCode, gmailEmail } from "@/lib/gmail";
import { patchPreferences } from "@/lib/profile";
import { sealToken } from "@/lib/token-crypto";

export async function GET(req: NextRequest) {
  const back = (msg: string) => NextResponse.redirect(`${appUrl()}/parametres?gmail=${encodeURIComponent(msg)}`);
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (!code || !state || state !== req.cookies.get("gmail_state")?.value) return back("erreur");
  const supabase = await supabaseServer();
  const user = await getUser();
  if (!user) return NextResponse.redirect(`${appUrl()}/login`);
  try {
    const tok = await exchangeCode(code);
    if (!tok.refresh_token) return back("pas_de_refresh");
    const email = await gmailEmail(tok.access_token);
    await supabase.from("gmail_accounts").upsert({ user_id: user.id, email, refresh_token: await sealToken(tok.refresh_token, user.id) });
    // La permission d'envoi n'est accordée que si l'utilisateur a choisi d'activer le récap du matin
    const send = canSend(tok.scope);
    await patchPreferences(supabase, user.id, send ? { recap_send_ok: true, daily_recap: true } : { recap_send_ok: false });
    const res = back(send ? "recap_ok" : "ok");
    res.cookies.delete("gmail_state");
    return res;
  } catch {
    return back("erreur");
  }
}
