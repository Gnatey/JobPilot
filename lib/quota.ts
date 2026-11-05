import type { SupabaseClient } from "@supabase/supabase-js";
import { HttpError } from "./supabase/server";
import { isAdminEmail } from "./admin";

/**
 * Actions IA par personne et par jour.
 * Par défaut, AUCUN plafond (choix de Juliana, 5 novembre 2026) : chacun peut se servir de l'IA gratuite autant qu'il veut, et quand les
 * limites des fournisseurs gratuits sont atteintes, l'app le dit simplement (lib/llm.ts) et on réessaie plus tard. Un compte peut donc
 * épuiser le quota gratuit partagé pour les autres : pour remettre un plafond par personne, mettre AI_DAILY_BUDGET (5 ou plus) dans Vercel.
 * Le compteur vit dans la base (fonction spend_ai, voir supabase/upgrade.sql) et continue de compter sans plafond : Administration › Comptes et usage le montre.
 * Tant que la mise à jour de la base n'est pas faite, rien n'est compté ni limité.
 */

/** Poids de chaque action (1 = un appel IA court). */
export const AI_COST = { offer: 2, document: 1, cv: 2, cvDiagnosis: 3, followup: 1, insights: 1, test: 1, mailSync: 2, search: 2 } as const;

/** Plafond par personne et par jour, ou null s'il n'y en a pas (cas par défaut : AI_DAILY_BUDGET absent, vide, 0 ou illisible). */
export function dailyBudget(): number | null {
  const n = Math.floor(Number(process.env.AI_DAILY_BUDGET));
  return Number.isFinite(n) && n > 0 ? Math.max(5, n) : null;
}

/** Plafond passé à la base quand il n'y en a pas : le compteur monte, mais ne peut pas l'atteindre. */
const NO_CAP = 1_000_000_000;

/** Ce que la personne voit dans Réglages : le compteur du jour, avec ou sans plafond. */
export function describeUsage(used: number, cap: number | null): { figure: string; note: string } {
  return cap == null
    ? { figure: String(used), note: "Il n'y a pas de limite par personne, mais l'IA gratuite est partagée entre tous les comptes : si elle est à sa limite, l'app te le dit et tu peux réessayer un peu plus tard." }
    : { figure: `${used} sur ${cap}`, note: "L'IA gratuite est partagée entre tous les comptes ; le compteur repart de zéro chaque nuit." };
}

/** Les adresses listées dans OWNER_EMAILS (séparées par des virgules) sont administratrices : pas de plafond d'IA, accès à /admin. */
export const isOwner = (email?: string | null) => isAdminEmail(email);

/** Réserve `cost` actions IA pour aujourd'hui ; lève une erreur 429 claire si le quota du jour est atteint. */
export async function spendAi(supabase: SupabaseClient, user: { email: string | null }, cost: number): Promise<void> {
  if (isOwner(user.email)) return;
  const cap = dailyBudget();
  const { data, error } = await supabase.rpc("spend_ai", { cost, cap: cap ?? NO_CAP });
  if (error) return; // base pas encore mise à jour (ou panne) : on ne bloque pas la personne pour ça
  if (cap != null && typeof data === "number" && data < 0) {
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
