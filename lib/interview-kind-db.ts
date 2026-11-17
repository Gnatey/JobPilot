/**
 * Colonne `applications.interview_kind` (mise à jour 8 de la base) : type du plus récent entretien, « contact » ou « entretien » (lib/dossier.ts).
 * Même démarche que lib/posted-db.ts : lire ou écrire une colonne absente fait échouer toute la requête ; on la sonde une fois (gardée 10 minutes si
 * elle existe, 30 secondes si elle manque) et on ne la demande qu'une fois sûr qu'elle est là. Sans elle, tout fonctionne comme avant :
 * un entretien sans type est un entretien (il lance la relance).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

type Err = { message?: string; code?: string } | null | undefined;

/** Postgres répond 42703 (« column … does not exist »), PostgREST PGRST204 (« Could not find the 'interview_kind' column … in the schema cache »). */
export function isMissingKindColumn(error: Err): boolean {
  if (!error) return false;
  if (error.code === "42703" || error.code === "PGRST204") return true;
  return /interview_kind/i.test(error.message ?? "") && /does not exist|could not find|schema cache|unknown column/i.test(error.message ?? "");
}

const TTL_OK = 10 * 60_000;
const TTL_MISSING = 30_000;
let cache: { ok: boolean; at: number } | null = null;

/** Pour les tests : oublie le résultat gardé en mémoire. */
export const resetKindCache = () => { cache = null; };

/** La colonne `interview_kind` existe-t-elle ? Un échec autre que « colonne absente » (réseau…) répond non, sans être gardé en mémoire. */
export async function hasInterviewKind(supabase: SupabaseClient, now: number = Date.now()): Promise<boolean> {
  if (cache && now - cache.at < (cache.ok ? TTL_OK : TTL_MISSING)) return cache.ok;
  try {
    const { error } = await supabase.from("applications").select("interview_kind").limit(1);
    if (!error) { cache = { ok: true, at: now }; return true; }
    if (isMissingKindColumn(error)) { cache = { ok: false, at: now }; return false; }
  } catch { /* échec de réseau : on ne conclut rien */ }
  return false;
}

/** Ajoute `interview_kind` à une liste de colonnes quand la colonne existe. */
export async function withKind(supabase: SupabaseClient, cols: string): Promise<string> {
  return (await hasInterviewKind(supabase)) ? `${cols}, interview_kind` : cols;
}
