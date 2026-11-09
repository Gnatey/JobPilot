/**
 * Colonne `recommendations.posted_at` (mise à jour 7 de la base) : date de publication SUR LE SITE, quand on la connaît (lib/posted.ts).
 * La colonne peut ne pas exister encore (la personne n'a pas lancé la mise à jour) : lire ou écrire une colonne absente fait échouer toute la requête,
 * donc on la sonde une fois (résultat gardé en mémoire : 10 minutes si elle existe, 30 secondes si elle manque, pour que la mise à jour soit vue vite)
 * et on ne la demande qu'une fois sûr qu'elle est là. Sans elle, tout fonctionne comme avant : les dates d'arrivée servent au tri.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { RECO_COLS } from "./reco-query";

type Err = { message?: string; code?: string } | null | undefined;

/** Postgres répond 42703 (« column … does not exist »), PostgREST PGRST204 (« Could not find the 'posted_at' column … in the schema cache »). */
export function isMissingPostedColumn(error: Err): boolean {
  if (!error) return false;
  if (error.code === "42703" || error.code === "PGRST204") return true;
  return /posted_at/i.test(error.message ?? "") && /does not exist|could not find|schema cache|unknown column/i.test(error.message ?? "");
}

const TTL_OK = 10 * 60_000;
const TTL_MISSING = 30_000;
let cache: { ok: boolean; at: number } | null = null;

/** Pour les tests : oublie le résultat gardé en mémoire. */
export const resetPostedCache = () => { cache = null; };

/** La colonne `posted_at` existe-t-elle ? Un échec autre que « colonne absente » (réseau…) répond non, sans être gardé en mémoire. */
export async function hasPostedColumn(supabase: SupabaseClient, now: number = Date.now()): Promise<boolean> {
  if (cache && now - cache.at < (cache.ok ? TTL_OK : TTL_MISSING)) return cache.ok;
  try {
    const { error } = await supabase.from("recommendations").select("posted_at").limit(1);
    if (!error) { cache = { ok: true, at: now }; return true; }
    if (isMissingPostedColumn(error)) { cache = { ok: false, at: now }; return false; }
  } catch { /* échec de réseau : on ne conclut rien */ }
  return false;
}

/** Colonnes à lire pour les recommandations : avec la date de publication quand la colonne existe. */
export async function recoCols(supabase: SupabaseClient): Promise<string> {
  return (await hasPostedColumn(supabase)) ? `${RECO_COLS}, posted_at` : RECO_COLS;
}

/** Quelle recommandation : par son identifiant, par l'offre analysée qui lui est rattachée, ou par son adresse. */
export type RecoBy = { id: string } | { offer_id: string } | { url: string };

/**
 * Range la date de publication lue sur une page (JSON-LD, mention « publiée il y a 3 jours »), sans jamais en écraser une déjà connue.
 * Silencieux : une date qu'on ne peut pas ranger ne doit jamais faire échouer la vérification ou l'analyse qui l'a trouvée.
 * Renvoie vrai si une date a été rangée.
 */
export async function rememberPosted(supabase: SupabaseClient, by: RecoBy, posted: string | null | undefined): Promise<boolean> {
  if (!posted) return false;
  try {
    if (!(await hasPostedColumn(supabase))) return false;
    const q = supabase.from("recommendations").update({ posted_at: posted }).is("posted_at", null);
    const { data, error } = await ("id" in by ? q.eq("id", by.id) : "offer_id" in by ? q.eq("offer_id", by.offer_id) : q.eq("url", by.url)).select("id");
    if (error) { if (isMissingPostedColumn(error)) resetPostedCache(); return false; }
    return (data ?? []).length > 0;
  } catch {
    return false;
  }
}
