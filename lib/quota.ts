import type { SupabaseClient } from "@supabase/supabase-js";
import { HttpError } from "./supabase/server";

/**
 * Quota d'actions IA par personne et par jour.
 * La clé IA gratuite est partagée : sans plafond, une seule personne pourrait l'épuiser pour tout le monde.
 * Le compteur vit dans la base (fonction spend_ai, voir supabase/upgrade.sql) : la personne ne peut pas le remettre à zéro.
 * Tant que la mise à jour de la base n'est pas faite, aucun plafond n'est appliqué (comportement d'avant).
 */

/** Poids de chaque action (1 = un appel IA court). */
export const AI_COST = { offer: 2, document: 1, cv: 2, cvDiagnosis: 3, followup: 1, insights: 1, test: 1, mailSync: 2, search: 2 } as const;

export const dailyBudget = () => Math.max(5, Number(process.env.AI_DAILY_BUDGET ?? 60) || 60);

/** Les adresses listées dans OWNER_EMAILS (séparées par des virgules) n'ont pas de plafond. */
export function isOwner(email?: string | null) {
  if (!email) return false;
  const list = `${process.env.OWNER_EMAILS ?? ""},${process.env.SEED_PROFILE_EMAIL ?? ""}`
    .toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);
  return list.includes(email.toLowerCase());
}

/** Qui voit l'installation et les clés dans Réglages : les adresses de OWNER_EMAILS ; sans liste, tout le monde (usage personnel). */
export function isAdmin(email?: string | null) {
  const configured = `${process.env.OWNER_EMAILS ?? ""},${process.env.SEED_PROFILE_EMAIL ?? ""}`.split(",").some((s) => s.trim());
  return !configured || isOwner(email);
}

/** Réserve `cost` actions IA pour aujourd'hui ; lève une erreur 429 claire si le quota du jour est atteint. */
export async function spendAi(supabase: SupabaseClient, user: { email: string | null }, cost: number): Promise<void> {
  if (isOwner(user.email)) return;
  const cap = dailyBudget();
  const { data, error } = await supabase.rpc("spend_ai", { cost, cap });
  if (error) return; // base pas encore mise à jour (ou panne) : on ne bloque pas la personne pour ça
  if (typeof data === "number" && data < 0) {
    throw new HttpError(429, `Tu as atteint ta limite d'actions IA pour aujourd'hui (${cap}). Elle repart de zéro cette nuit : l'IA gratuite est partagée entre tous les comptes, ce plafond évite qu'un seul compte l'épuise.`);
  }
}

/** Actions IA déjà utilisées aujourd'hui (pour l'affichage dans Réglages). Null si le suivi n'est pas actif. */
export async function usedToday(supabase: SupabaseClient, userId: string): Promise<number | null> {
  const day = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase.from("ai_usage").select("n").eq("user_id", userId).eq("day", day).maybeSingle();
  if (error) return null;
  return data?.n ?? 0;
}
