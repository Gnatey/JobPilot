import { notFound } from "next/navigation";
import { getUser, supabaseServer, HttpError } from "./supabase/server";
import { isAdminEmail } from "./admin";

/**
 * L'administration lit les comptes avec la clé de service : la porte doit être solide.
 * 1. l'adresse est dans OWNER_EMAILS ; 2. Supabase confirme (appel réseau, pas seulement le jeton) que cette adresse est vérifiée
 *    et identique, pour qu'un compte créé sans confirmation avec la même adresse ne passe pas.
 */
async function checkedAdmin() {
  const user = await getUser();
  if (!user || !isAdminEmail(user.email)) return null;
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  const u = data?.user;
  if (!u?.email_confirmed_at || u.email?.toLowerCase() !== user.email?.toLowerCase()) return null;
  return { supabase, user };
}

/** Pour une page : tout autre visiteur reçoit une page introuvable (la page ne révèle même pas qu'elle existe). */
export async function requireAdminPage() {
  const a = await checkedAdmin();
  if (!a) notFound();
  return a;
}

/** Pour une route d'API. */
export async function requireAdminApi() {
  const a = await checkedAdmin();
  if (!a) throw new HttpError(404, "Introuvable");
  return a;
}

/** Simple lecture (sans appel réseau) : sert à choisir quoi afficher, jamais à protéger quelque chose. */
export async function isAdminViewer(): Promise<boolean> {
  try {
    return isAdminEmail((await getUser())?.email);
  } catch {
    return false;
  }
}
