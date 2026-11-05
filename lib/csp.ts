/**
 * Politique de sécurité du navigateur (en-tête Content-Security-Policy) : liste ce que les pages ont le droit de charger et d'appeler.
 * Logique pure (testée dans tests/csp.test.ts), utilisée par next.config.ts.
 *
 * Ce qu'elle apporte : aucune page ne peut être affichée dans le cadre d'un autre site (anti-« clickjacking »), aucun formulaire ne peut
 * envoyer ses champs ailleurs, aucun plugin, et le navigateur ne peut parler qu'à ce site, à Supabase et à l'API des communes.
 * Ce qu'elle ne fait PAS : `script-src` garde `'unsafe-inline'`, car Next.js place de petits scripts directement dans chaque page
 * (hydratation) ; une version à jeton (« nonce ») rendrait toutes les pages dynamiques, c'est un chantier à part.
 * Défense en plus de React, qui échappe déjà tout ce qu'il affiche (aucun `dangerouslySetInnerHTML` sauf le petit script du thème, fixe).
 *
 * Quand le code appelle un nouveau service depuis le navigateur (fetch, image, police…), l'ajouter ici : tests/csp.test.ts le réclame.
 */

/** Services appelés depuis le navigateur autres que ce site et Supabase. */
export const EXTERNAL_CONNECT = ["https://geo.api.gouv.fr"];

/** Adresse Supabase (https + websocket) à partir de NEXT_PUBLIC_SUPABASE_URL ; à défaut, tout `*.supabase.co`. */
export function supabaseSources(url: string | undefined): string[] {
  try {
    const u = new URL(url ?? "");
    if (u.protocol !== "https:") throw new Error("pas https");
    return [u.origin, `wss://${u.host}`];
  } catch {
    return ["https://*.supabase.co", "wss://*.supabase.co"];
  }
}

export function buildCsp(opts: { supabaseUrl?: string; dev?: boolean } = {}): string {
  const dev = opts.dev ?? false;
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // 'unsafe-eval' seulement en développement (React s'en sert pour les messages d'erreur détaillés)
    "script-src": ["'self'", "'unsafe-inline'", ...(dev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    // data: = le QR code de la double authentification ; blob: = aperçus locaux
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", ...supabaseSources(opts.supabaseUrl), ...EXTERNAL_CONNECT, ...(dev ? ["ws:", "http:"] : [])],
    "manifest-src": ["'self'"],
    "worker-src": ["'self'", "blob:"],
    "frame-src": ["'none'"],
    "frame-ancestors": ["'none'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    ...(dev ? {} : { "upgrade-insecure-requests": [] }),
  };
  return Object.entries(directives).map(([k, v]) => [k, ...v].join(" ")).join("; ");
}
