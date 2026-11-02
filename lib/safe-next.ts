/**
 * Destination après connexion (paramètre `next` de /auth/callback) : uniquement un chemin de ce site.
 * Un simple « commence par / mais pas par // » ne suffit pas : le navigateur lit « /\evil.com » comme « //evil.com »
 * et ignore les tabulations et retours à la ligne (« /<tab>/evil.com »), donc on laisse l'analyseur d'adresses trancher.
 */
export function safeNext(n: string | null | undefined): string {
  if (!n || !n.startsWith("/")) return "/";
  const base = "http://jobpilot.invalid";
  try {
    const u = new URL(n, base);
    if (u.origin !== base) return "/";
    const out = u.pathname + u.search + u.hash;
    // Une fois remis à `new URL(out, …)`, « //x » désignerait un autre site
    return /^\/[\\/]/.test(out) ? "/" : out;
  } catch {
    return "/";
  }
}
