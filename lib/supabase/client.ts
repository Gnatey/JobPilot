"use client";
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SAFE_SUPABASE_KEY as SUPABASE_ANON_KEY, SAFE_SUPABASE_URL as SUPABASE_URL } from "../env";

let instance: SupabaseClient | null = null;

/** Un seul client pour tout le navigateur. */
export function supabaseBrowser() {
  instance ??= createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return instance;
}

/** Identifiant de l'utilisateur connecté, lu en local (la base vérifie de toute façon ses droits). */
export async function myId(sb: SupabaseClient = supabaseBrowser()) {
  const { data } = await sb.auth.getSession();
  return data.session?.user.id ?? null;
}
