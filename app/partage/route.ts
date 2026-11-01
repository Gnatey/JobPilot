import { NextResponse, type NextRequest } from "next/server";

/** Cible du bouton « Partager » du téléphone : renvoie l'annonce partagée vers l'analyse automatique. */
export function GET(req: NextRequest) {
  const url = new URL("/offres/nouvelle", req.url);
  url.searchParams.set("auto", "1");
  url.searchParams.set("then", "cv");
  for (const k of ["title", "text", "url"]) {
    const v = req.nextUrl.searchParams.get(k);
    if (v) url.searchParams.set(k, v.slice(0, 12000));
  }
  return NextResponse.redirect(url);
}
