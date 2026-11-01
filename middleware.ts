import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SAFE_SUPABASE_KEY as SUPABASE_ANON_KEY, SAFE_SUPABASE_URL as SUPABASE_URL, supabaseConfigured } from "@/lib/env";

// La page d'accueil (/) est publique : elle présente le site aux visiteurs et mène à la connexion
const PUBLIC = ["/login", "/auth", "/api/gmail/callback", "/configuration", "/mentions-legales", "/confidentialite"];

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Variables Supabase absentes : on affiche la page de configuration au lieu de planter
  if (!supabaseConfigured()) {
    if (path.startsWith("/configuration")) return NextResponse.next();
    if (path.startsWith("/api/")) return NextResponse.json({ error: "Application non configurée : voir /configuration" }, { status: 503 });
    const url = request.nextUrl.clone();
    url.pathname = "/configuration";
    return NextResponse.redirect(url);
  }

  let response = NextResponse.next({ request });
  let user: { sub?: string; aal?: string } | null = null;
  let needsCode = false; // vérification en deux étapes activée, mais code pas encore saisi pour cette session
  try {
    const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });
    const { data } = await supabase.auth.getClaims();
    user = data?.claims?.sub ? data.claims : null;
    if (user && user.aal !== "aal2") {
      // Lecture locale (aucun appel réseau) : y a-t-il un second facteur à demander ?
      const { data: level } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      needsCode = level?.nextLevel === "aal2" && level.currentLevel !== "aal2";
    }
  } catch {
    user = null; // Supabase injoignable : on traite comme non connecté
  }

  // Mot de passe saisi mais pas le code à 6 chiffres : seule la page du code est accessible
  if (user && needsCode && !path.startsWith("/login/verification") && !path.startsWith("/auth")) {
    if (path.startsWith("/api/")) return NextResponse.json({ error: "Vérification en deux étapes requise." }, { status: 401 });
    const url = request.nextUrl.clone();
    url.pathname = "/login/verification";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Déjà connecté : la page de connexion n'a plus de raison d'être
  if (user && path === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (!user && path !== "/" && !PUBLIC.some((p) => path.startsWith(p)) && !path.startsWith("/api/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|.*\\.(?:png|svg|webmanifest)$).*)"],
};
