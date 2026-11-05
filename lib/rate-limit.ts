import type { SupabaseClient } from "@supabase/supabase-js";
import { HttpError } from "./supabase/server";

/**
 * Limitation des requêtes par personne (le compteur vit dans la base : fonction rate_limit, voir la fin de scripts/upgrade.sql).
 * Pour les routes sensibles ou lourdes qui n'ont pas déjà un budget d'IA. Tant que la mise à jour de la base n'est pas lancée
 * (Administration › Installation), ou si la base est en panne, aucune limite n'est appliquée : on ne bloque jamais quelqu'un à cause d'un problème de notre côté.
 */
export const LIMITS = {
  /** Vérification de l'ancien mot de passe : sans plafond, un compte volé pourrait servir à deviner le mot de passe, et le plafond de l'authentification est partagé entre tous les comptes (même adresse du serveur). */
  password: { max: 6, windowSec: 600 },
  deleteAccount: { max: 3, windowSec: 3600 },
  /** Export : une dizaine de lectures complètes de tables à chaque appel. */
  exportData: { max: 6, windowSec: 3600 },
  /** Test des sources d'offres (administration) : chaque appel consomme une requête du quota gratuit d'Adzuna et de Jooble. */
  testSources: { max: 10, windowSec: 3600 },
} as const;

export type Bucket = keyof typeof LIMITS;

/** Message affiché à la personne (clair, sans mot technique). */
export const tooMany = (bucket: Bucket) => {
  const min = Math.ceil(LIMITS[bucket].windowSec / 60);
  return `Trop de tentatives en peu de temps. Réessaie dans ${min >= 60 ? `${Math.round(min / 60)} h` : `${min} minutes`}.`;
};

/** Compte une demande ; lève une erreur 429 si la personne dépasse la limite de ce seau. */
export async function rateLimit(supabase: SupabaseClient, bucket: Bucket): Promise<void> {
  const { max, windowSec } = LIMITS[bucket];
  const { data, error } = await supabase.rpc("rate_limit", { p_bucket: bucket, p_max: max, p_window: windowSec });
  if (error) return; // script SQL pas encore lancé (ou panne) : pas de limite
  if (data === false) throw new HttpError(429, tooMany(bucket));
}
