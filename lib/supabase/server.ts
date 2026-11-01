import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { SAFE_SUPABASE_KEY as SUPABASE_ANON_KEY, SAFE_SUPABASE_URL as SUPABASE_URL } from "../env";
import { cookies } from "next/headers";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export type AuthUser = { id: string; email: string | null };

/** Client Supabase du visiteur (une seule instance par requête). */
export const supabaseServer = cache(async () => {
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // appelé depuis un Server Component : le middleware rafraîchit la session
        }
      },
    },
  });
});

/**
 * Utilisateur connecté. getClaims() vérifie la signature du jeton en local quand le projet
 * utilise les clés asymétriques de Supabase (aucun aller-retour réseau), sinon il interroge Supabase.
 * Mis en cache : le layout et la page partagent le même appel.
 */
export const getUser = cache(async (): Promise<AuthUser | null> => {
  try {
    const supabase = await supabaseServer();
    const { data } = await supabase.auth.getClaims();
    const c = data?.claims;
    if (!c?.sub) return null;
    return { id: c.sub, email: typeof c.email === "string" ? c.email : null };
  } catch {
    return null;
  }
});

export async function requireUser() {
  const user = await getUser();
  if (!user) throw new HttpError(401, "Non connecté");
  return { supabase: await supabaseServer(), user };
}
