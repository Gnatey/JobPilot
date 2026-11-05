import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { aiPerDay, buildAccountRows, isoDay, lastDays, summarize, type AccountRow, type AdminUser, type UsageRow } from "./admin";
import { dailyBudget } from "./quota";

/** Client avec la clé de service : à n'utiliser que dans une page ou une route déjà protégée par requireAdmin*. Null si la clé n'est pas là. */
export function serviceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

const PAGE = 200;
const MAX_ACCOUNTS = 1000; // au-delà, on le dit au lieu de ralentir la page
const COUNT_FOR = 100; // nombre de comptes pour lesquels on compte les candidatures (une requête légère par compte)

export type AdminOverview = {
  rows: AccountRow[];
  total: number;
  truncated: boolean;
  summary: ReturnType<typeof summarize>;
  perDay: { day: string; n: number }[];
  cap: number | null;
  countedFor: number;
};

/**
 * Vue d'ensemble : comptes, usage de l'IA, nombre de candidatures par compte.
 * Volontairement anonyme et sans contenu : ni adresses, ni offres, ni CV, ni emails, ni textes des candidatures (voir la page « Confidentialité »).
 */
export async function loadOverview(sb: SupabaseClient, meId?: string, now = new Date()): Promise<AdminOverview> {
  const users: AdminUser[] = [];
  let total = 0;
  for (let page = 1; users.length < MAX_ACCOUNTS; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: PAGE });
    if (error) throw new Error(`Liste des comptes impossible : ${error.message}`);
    total = (data as { total?: number }).total ?? data.users.length;
    users.push(...data.users.map((u) => ({ id: u.id, created_at: u.created_at, last_sign_in_at: u.last_sign_in_at ?? null })));
    if (data.users.length < PAGE) break;
  }

  // Compteurs d'IA des 7 derniers jours (la table peut ne pas exister si la mise à jour de la base n'est pas faite)
  const since = lastDays(now)[0];
  const usage: UsageRow[] = [];
  for (let from = 0; from < 20_000; from += 1000) {
    const { data, error } = await sb.from("ai_usage").select("user_id, day, n").gte("day", since).lte("day", isoDay(now)).range(from, from + 999);
    if (error || !data) break;
    usage.push(...(data as UsageRow[]));
    if (data.length < 1000) break;
  }

  // Candidatures par compte : un simple décompte, par petits groupes
  const applications: Record<string, number> = {};
  const targets = users.slice(0, COUNT_FOR);
  for (let i = 0; i < targets.length; i += 10) {
    await Promise.all(targets.slice(i, i + 10).map(async (u) => {
      const { count, error } = await sb.from("applications").select("id", { count: "exact", head: true }).eq("user_id", u.id);
      if (!error && count !== null) applications[u.id] = count;
    }));
  }

  const rows = buildAccountRows(users, usage, applications, now, meId);
  const cap = dailyBudget();
  return { rows, total: Math.max(total, users.length), truncated: users.length < total, summary: summarize(rows, cap, now), perDay: aiPerDay(usage, now), cap, countedFor: targets.length };
}
