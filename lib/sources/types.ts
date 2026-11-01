/** Critères d'une recherche d'offres, communs à toutes les sources. */
export type SearchCriteria = {
  keywords: string;
  departments: string[]; // codes, ex ["75","93","92"]
  cities?: string[]; // noms de villes quand la zone est une liste de villes
  contracts: string[]; // CDI, CDD, MIS (intérim), LIB (freelance), ALT (alternance), STG (stage)
  experience: "" | "1" | "2" | "3"; // 1 = <1 an, 2 = 1-3 ans, 3 = >3 ans
  publishedWithin: "1" | "3" | "7" | "14" | "31";
  remoteOnly?: boolean;
  exclude?: string; // mots à exclure
  maxYears?: number | null; // masque les offres qui exigent plus d'années d'expérience
};

/** Une offre, dans le même format quelle que soit la source. */
export type JobOffer = {
  key: string; // identifiant unique et stable : « az:456 », « jb:789 » (« ft:… » pour les anciennes offres France Travail)
  source: string; // nom affiché
  id: string;
  title: string;
  company: string;
  location: string;
  contract: string;
  salary: string;
  experience: string;
  years: number | null; // années d'expérience demandées, si la source les donne
  date: string;
  url: string;
  description: string;
};

export type SearchOpts = { maxRequests?: number }; // plafond de requêtes envoyées à la source (la tâche du matin en demande moins)

export type Source = {
  id: "adzuna" | "jooble";
  label: string;
  configured: () => boolean;
  search: (c: SearchCriteria, opts?: SearchOpts) => Promise<JobOffer[]>;
};

/** Contrats avec filtre propre côté source ; ALT et STG se cherchent par mot-clé. */
export const STANDARD_CONTRACTS = ["CDI", "CDD", "MIS", "LIB"];
/** Contrats « spéciaux » : pas de filtre propre côté sources, on les cherche par mot-clé. */
export const KEYWORD_CONTRACTS: Record<string, string> = { ALT: "alternance", STG: "stage" };

/** Identifiant à garder dans offers.external_id (les anciennes offres France Travail, retirées depuis, gardent l'identifiant nu). */
export const externalId = (key: string) => (key.startsWith("ft:") ? key.slice(3) : key);
