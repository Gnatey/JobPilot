import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { authUrl } from "@/lib/gmail";

export async function GET(req: NextRequest) {
  try {
    await requireUser();
    const state = crypto.randomUUID();
    const res = NextResponse.redirect(authUrl(state, req.nextUrl.searchParams.get("recap") === "1"));
    res.cookies.set("gmail_state", state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/" });
    return res;
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur" }, { status: 400 });
  }
}
