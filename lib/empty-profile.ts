import type { Profile } from "./types";

/** Profil vide donné à chaque nouveau compte : la personne le remplit à l'accueil ou en déposant son CV. */
export const EMPTY_PROFILE: Profile = {
  identity: { name: "", email: "", links: [] },
  targets: [],
  experiences: [],
  education: [],
  projects: [],
  skills: {},
  certifications: [],
  languages: [],
  interests: [],
  preferences: { contracts: [] },
  rules: [
    "Ne jamais inventer de chiffre, d'outil, d'employeur ou de responsabilité absent du profil.",
    "Un seul titre de poste, aligné sur l'intitulé de l'offre.",
  ],
  todo: [],
};
