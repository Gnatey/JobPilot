import type { MetadataRoute } from "next";
import { PUBLIC_PAGES, siteUrl } from "@/lib/site";

/** Plan du site : seulement les pages publiques (le reste de l'appli est privé). */
export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PAGES.map((p) => ({ url: `${siteUrl()}${p === "/" ? "" : p}` }));
}
