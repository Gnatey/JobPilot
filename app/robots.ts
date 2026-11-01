import type { MetadataRoute } from "next";

/** Appli privée : on demande aux moteurs de recherche de ne rien indexer. */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
