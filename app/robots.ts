import type { MetadataRoute } from "next";
import { PUBLIC_ASSETS, PUBLIC_PAGES, siteUrl } from "@/lib/site";

/**
 * Appli privée : les moteurs de recherche n'ont rien à explorer, SAUF les trois pages publiques que Google doit pouvoir lire
 * pour valider l'écran d'autorisation Gmail (accueil, mentions légales, confidentialité), et les fichiers qu'il faut pour les afficher
 * (sinon Google voit une page sans style ni images). `/$` = la page d'accueil seule.
 * Tout le site est en « noindex » (app/layout.tsx), sauf l'accueil visiteur (app/page.tsx) et les deux pages légales.
 */
const allow = [...PUBLIC_PAGES.map((p) => (p === "/" ? "/$" : p)), ...PUBLIC_ASSETS];

export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow, disallow: "/" }, sitemap: `${siteUrl()}/sitemap.xml` };
}
