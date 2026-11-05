import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SAFE_SUPABASE_KEY as SUPABASE_ANON_KEY, SAFE_SUPABASE_URL as SUPABASE_URL, supabaseConfigured } from "@/lib/env";
import { TRUST_COOKIE, sessionExpired, trustSecret, verifyTrust } from "@/lib/reauth";

// La page d'accueil (/) est publique : elle présente le site aux visiteurs et mène à la connexion
const PUBLIC = ["/login", "/auth", "/api/gmail/callback", "/configuration", "/mentions-legales", "/confidentialite"];

export async function proxy(request: NextRequest) {
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
  let user: { sub?: string; aal?: string; email?: string; amr?: unknown } | null = null;
  let needsCode = false; // vérification en deux étapes activée, mais code pas encore saisi pour cette session
  let expired = false; // session plus vieille que la durée permise (90 jours, 30 pour l'admin) : fermée ici
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
    // Un compte anonyme (sans e-mail) n'est pas un utilisateur de JobPilot : traité comme non connecté
    user = data?.claims?.sub && (data.claims as { is_anonymous?: boolean }).is_anonymous !== true ? data.claims : null;
    if (user && sessionExpired(user.amr, user.email, Date.now())) {
      // Reconnexion espacée : on ferme cette session (et elle seule : les autres appareils ne sont pas touchés)
      expired = true;
      user = null;
      try {
        await supabase.auth.signOut({ scope: "local" });
      } catch {
        // Supabase injoignable : on efface quand même les cookies de session ici
        request.cookies.getAll().filter((c) => /^sb-.*-auth-token/.test(c.name)).forEach((c) => {
          request.cookies.delete(c.name);
          response.cookies.set(c.name, "", { maxAge: 0, path: "/" });
        });
      }
    }
    if (user && user.aal !== "aal2") {
      // Lecture locale (aucun appel réseau) : y a-t-il un second facteur à demander ?
      const { data: level } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      needsCode = level?.nextLevel === "aal2" && level.currentLevel !== "aal2";
      // Appareil de confiance : le code a déjà été saisi ici il y a moins de 90 jours (30 pour l'admin), cookie signé au nom de cette personne
      if (needsCode && user.sub && (await verifyTrust(request.cookies.get(TRUST_COOKIE)?.value, user.sub, user.email, Date.now(), trustSecret()))) needsCode = false;
    }
  } catch {
    user = null; // Supabase injoignable : on traite comme non connecté
  }

  // Une redirection garde les cookies posés pendant cette requête (session rafraîchie ou fermée)
  const redirectTo = (url: URL) => {
    const r = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => r.cookies.set(c));
    return r;
  };

  // Mot de passe saisi mais pas le code à 6 chiffres : seule la page du code est accessible
  if (user && needsCode && !path.startsWith("/login/verification") && !path.startsWith("/auth")) {
    if (path.startsWith("/api/")) return NextResponse.json({ error: "Vérification en deux étapes requise." }, { status: 401 });
    const url = request.nextUrl.clone();
    url.pathname = "/login/verification";
    url.search = "";
    return redirectTo(url);
  }

  // Déjà connecté : la page de connexion n'a plus de raison d'être
  if (user && path === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return redirectTo(url);
  }

  if (!user && path !== "/" && !PUBLIC.some((p) => path.startsWith(p)) && !path.startsWith("/api/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    if (expired) url.search = "?session=expiree";
    return redirectTo(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|opengraph-image|.*\\.(?:png|svg|webmanifest)$).*)"],
};
