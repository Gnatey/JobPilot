import type { SupabaseClient } from "@supabase/supabase-js";
import { EMPTY_PROFILE } from "./empty-profile";
import type { Profile } from "./types";

const list = <T,>(v: unknown, fallback: T[]): T[] => (Array.isArray(v) ? (v as T[]) : fallback);

/**
 * Un profil toujours complet : ce qui manque (listes, identité, préférences) reçoit sa valeur vide, ce qui existe n'est jamais touché.
 * Une écriture partielle (un réglage enregistré avant que le profil existe) ne doit pas produire un profil que toutes les pages liraient
 * comme un vrai (`profile.experiences.map` sur `undefined`). `email` : l'adresse du compte, pour une identité encore vide.
 */
export function completeProfile(raw: unknown, email?: string | null): Profile {
  const d = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Partial<Profile>;
  const id = (d.identity && typeof d.identity === "object" ? d.identity : {}) as Partial<Profile["identity"]>;
  const pref = (d.preferences && typeof d.preferences === "object" ? d.preferences : {}) as Partial<Profile["preferences"]>;
  return {
    ...EMPTY_PROFILE,
    ...d,
    identity: { ...EMPTY_PROFILE.identity, ...id, email: id.email || email || "", links: list(id.links, []) },
    targets: list(d.targets, []),
    experiences: list(d.experiences, []),
    education: list(d.education, []),
    projects: list(d.projects, []),
    skills: d.skills && typeof d.skills === "object" && !Array.isArray(d.skills) ? d.skills : {},
    certifications: list(d.certifications, []),
    languages: list(d.languages, []),
    interests: list(d.interests, []),
    preferences: { ...EMPTY_PROFILE.preferences, ...pref, contracts: list(pref.contracts, []) },
    rules: list(d.rules, EMPTY_PROFILE.rules),
    todo: list(d.todo, []),
  };
}

/** Charge le profil maître ; le crée vide au premier accès. */
export async function getProfile(supabase: SupabaseClient, user: { id: string; email?: string | null }): Promise<Profile> {
  const { data } = await supabase.from("profiles").select("data").eq("user_id", user.id).maybeSingle();
  if (data?.data && Object.keys(data.data).length) return completeProfile(data.data, user.email);
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
  return completeProfile(data?.data);
}

/** Met à jour quelques réglages (preferences) sans toucher au reste du profil. */
export async function patchPreferences(supabase: SupabaseClient, userId: string, patch: Partial<Profile["preferences"]>) {
  const { data } = await supabase.from("profiles").select("data").eq("user_id", userId).maybeSingle();
  // Profil complété avant l'écriture : un réglage posé avant que le profil existe ne crée plus une ligne « partielle »
  const p = completeProfile(data?.data);
  const { error } = await supabase.from("profiles").upsert({ user_id: userId, data: { ...p, preferences: { ...p.preferences, ...patch } }, updated_at: new Date().toISOString() });
  if (error) throw error; // un réglage qui n'est pas enregistré ne doit pas être annoncé comme réussi
}
