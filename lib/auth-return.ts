import { safeNext } from "./safe-next";

/**
 * Retour du lien d'un e-mail Supabase (/auth/callback, /auth/confirme) : où envoyer la personne, et que lui dire.
 * Logique pure, testée (les routes ne peuvent exporter que GET/POST…).
 *
 * Quand Supabase redirige avec `code`, c'est que l'adresse e-mail VIENT d'être confirmée : Supabase vérifie le lien avant de rediriger.
 * Même si l'ouverture de la session échoue ensuite (lien ouvert dans un autre navigateur que celui de l'inscription : le justificatif
 * PKCE est resté dans le premier), l'adresse est confirmée. Il faut donc le dire, plutôt que « ce lien a expiré ».
 */
export const CONFIRMED_COOKIE = "jp_confirme";

export type ReturnInput = {
  hasCode: boolean;      // Supabase a renvoyé un `code` : le lien était valable
  exchanged: boolean;    // la session a pu être ouverte avec ce code
  hasError: boolean;     // Supabase a renvoyé une erreur (lien expiré ou déjà utilisé)
  confirmation: boolean; // lien de confirmation d'inscription (/auth/confirme), pas connexion par e-mail ni mot de passe oublié
  next: string | null | undefined;
};

export type ReturnTarget = {
  to: string;
  /** Poser le témoin « adresse confirmée » : la bannière verte s'affiche à l'arrivée dans l'appli (il survit aux redirections, comme vers /bienvenue). */
  flag: boolean;
};

export function returnTarget(i: ReturnInput): ReturnTarget {
  const next = safeNext(i.next);
  if (i.hasCode) {
    if (i.exchanged) return { to: next, flag: i.confirmation };
    return { to: i.confirmation ? "/login?confirme=1" : "/login?erreur=lien", flag: false };
  }
  if (i.hasError || i.confirmation) return { to: "/login?erreur=lien", flag: false };
  return { to: next, flag: false };
}
