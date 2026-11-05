import type { MetadataRoute } from "next";

/**
 * Appli privée : les moteurs de recherche n'ont rien à explorer, SAUF les trois pages publiques que Google doit pouvoir lire
 * pour valider l'écran d'autorisation Gmail (accueil, mentions légales, confidentialité). `/$` = la page d'accueil seule.
 * Tout le site est en « noindex » (app/layout.tsx), sauf l'accueil visiteur (app/page.tsx) et les deux pages légales, que Google peut lire et afficher.
 */
const PUBLIC_PAGES = ["/$", "/mentions-legales", "/confidentialite"];

export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: PUBLIC_PAGES, disallow: "/" } };
}
