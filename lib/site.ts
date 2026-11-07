/** Adresse publique du site (NEXT_PUBLIC_APP_URL, sans « / » final). */
export const siteUrl = () => (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

/** Les seules pages que Google a le droit de lire et d'afficher (tout le reste est en « noindex » et fermé dans robots.txt). */
export const PUBLIC_PAGES = ["/", "/mentions-legales", "/confidentialite"];

/**
 * Fichiers que Google doit pouvoir charger pour afficher ces pages comme un visiteur (styles, scripts, icônes, image de partage),
 * et le plan du site lui-même : `Disallow: /` le fermait aussi, et Search Console répondait « Impossible de lire le sitemap » (7 novembre 2026).
 */
export const PUBLIC_ASSETS = ["/_next/static/", "/icon.svg", "/apple-icon.png", "/manifest.webmanifest", "/opengraph-image", "/sitemap.xml"];
