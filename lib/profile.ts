import type { SupabaseClient } from "@supabase/supabase-js";
import { EMPTY_PROFILE } from "./empty-profile";
import type { Profile } from "./types";

/** Charge le profil maître ; le crée vide au premier accès. */
export async function getProfile(supabase: SupabaseClient, user: { id: string; email?: string | null }): Promise<Profile> {
  const { data } = await supabase.from("profiles").select("data").eq("user_id", user.id).maybeSingle();
  if (data?.data && Object.keys(data.data).length) return data.data as Profile;
  const initial: Profile = { ...EMPTY_PROFILE, identity: { ...EMPTY_PROFILE.identity, email: user.email ?? "" } };
  await supabase.from("profiles").upsert({ user_id: user.id, data: initial });
  return initial;
}

/** Texte brut du profil, utile pour la recherche de mots-clés */
export function profileText(p: Profile) {
  return JSON.stringify(p).toLowerCase();
}

/** Variante utilisée par la synchro automatique (pas de session utilisateur). */
export async function getProfileById(supabase: SupabaseClient, userId: string): Promise<Profile> {
  const { data } = await supabase.from("profiles").select("data").eq("user_id", userId).maybeSingle();
  return (data?.data as Profile) ?? EMPTY_PROFILE;
}

/** Met à jour quelques réglages (preferences) sans toucher au reste du profil. */
export async function patchPreferences(supabase: SupabaseClient, userId: string, patch: Partial<Profile["preferences"]>) {
  const { data } = await supabase.from("profiles").select("data").eq("user_id", userId).maybeSingle();
  const p = (data?.data ?? {}) as Partial<Profile>;
  await supabase.from("profiles").upsert({ user_id: userId, data: { ...p, preferences: { ...p.preferences, ...patch } }, updated_at: new Date().toISOString() });
}
