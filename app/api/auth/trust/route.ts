import { NextResponse } from "next/server";
import { getUser, supabaseServer } from "@/lib/supabase/server";
import { TRUST_COOKIE, justVerifiedCode, reauthDays, signTrust, trustSecret } from "@/lib/reauth";

export const dynamic = "force-dynamic";

/**
 * « Ne plus demander le code sur cet appareil » : appelée juste après la saisie réussie du code à 6 chiffres.
 * Le cookie (signé, illisible par les scripts) n'est posé que si le jeton prouve que le code vient d'être saisi, au nom de cette personne.
 */
export async function POST() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  const secret = trustSecret();
  if (!secret) return NextResponse.json({ error: "Cette option n'est pas disponible pour le moment." }, { status: 503 });

  const { data } = await (await supabaseServer()).auth.getClaims();
  const now = Date.now();
  if (!justVerifiedCode(data?.claims as { aal?: unknown; amr?: unknown } | undefined, now)) {
    return NextResponse.json({ error: "Saisis d'abord le code à 6 chiffres." }, { status: 403 });
  }
  const value = await signTrust(user.id, now, secret);
  if (!value) return NextResponse.json({ error: "Cette option n'est pas disponible pour le moment." }, { status: 503 });

  const days = reauthDays(user.email);
  const res = NextResponse.json({ ok: true, days });
  res.cookies.set(TRUST_COOKIE, value, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: days * 86_400 });
  return res;
}
