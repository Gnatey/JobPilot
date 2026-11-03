/**
 * Partie administrateur : logique pure (aucun accès réseau ni base), donc testable.
 * La garde côté serveur est dans lib/admin-guard.ts, la lecture des comptes dans lib/admin-data.ts.
 */

type Env = Record<string, string | undefined>;

/** Adresses administratrices : OWNER_EMAILS (séparées par des virgules) et SEED_PROFILE_EMAIL. Sans liste : personne (le plus sûr). */
export function adminEmails(env: Env = process.env): string[] {
  return `${env.OWNER_EMAILS ?? ""},${env.SEED_PROFILE_EMAIL ?? ""}`.toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);
}

export function isAdminEmail(email?: string | null, env: Env = process.env): boolean {
  if (!email) return false;
  return adminEmails(env).includes(email.trim().toLowerCase());
}

/**
 * Un message d'erreur « de technicien » : nom de variable d'environnement, Vercel, Supabase, script SQL…
 * Utile à l'administratrice, inutile (et trop bavard sur l'installation) pour quelqu'un d'autre.
 */
const TECHNICAL = /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b|\bVercel\b|\bSupabase\b|\bRedeploy\b|redéploie|\bSQL\b|service_role/;
export const looksTechnical = (message: string) => TECHNICAL.test(message);

export const PUBLIC_ERROR = "Cette fonction est momentanément indisponible. Réessaie un peu plus tard, et préviens l'éditeur du site si ça dure.";

/** Ce qu'une personne voit : le message tel quel pour l'admin, sinon un message simple quand il est trop technique. */
export const messageFor = (message: string, admin: boolean) => (admin || !looksTechnical(message) ? message : PUBLIC_ERROR);

/* ---------- Comptes et usage (page /admin) ---------- */

export type AdminUser = { id: string; email: string | null; created_at?: string | null; last_sign_in_at?: string | null };
export type UsageRow = { user_id: string; day: string; n: number };
export type AccountRow = {
  id: string;
  email: string;
  createdAt: string | null;
  lastSignInAt: string | null;
  aiToday: number;
  ai7: number;
  applications: number | null;
};

export const isoDay = (d: Date) => d.toISOString().slice(0, 10);
/** Les 7 derniers jours (aujourd'hui compris), du plus ancien au plus récent. */
export function lastDays(now: Date, count = 7): string[] {
  return Array.from({ length: count }, (_, i) => isoDay(new Date(now.getTime() - (count - 1 - i) * 86_400_000)));
}

/** Rassemble comptes, compteur d'IA et nombre de candidatures en une ligne par compte, les plus actifs d'abord. */
export function buildAccountRows(users: AdminUser[], usage: UsageRow[], applications: Record<string, number>, now: Date): AccountRow[] {
  const today = isoDay(now);
  const week = new Set(lastDays(now));
  const rows = users.map((u): AccountRow => {
    const mine = usage.filter((x) => x.user_id === u.id);
    return {
      id: u.id,
      email: u.email ?? "(sans adresse)",
      createdAt: u.created_at ?? null,
      lastSignInAt: u.last_sign_in_at ?? null,
      aiToday: mine.filter((x) => x.day === today).reduce((s, x) => s + x.n, 0),
      ai7: mine.filter((x) => week.has(x.day)).reduce((s, x) => s + x.n, 0),
      applications: u.id in applications ? applications[u.id] : null,
    };
  });
  const t = (s: string | null) => (s ? Date.parse(s) || 0 : 0);
  return rows.sort((a, b) => b.aiToday - a.aiToday || t(b.lastSignInAt) - t(a.lastSignInAt) || t(b.createdAt) - t(a.createdAt));
}

/** Actions IA par jour sur les 7 derniers jours, tous comptes confondus. */
export function aiPerDay(usage: UsageRow[], now: Date): { day: string; n: number }[] {
  return lastDays(now).map((day) => ({ day, n: usage.filter((x) => x.day === day).reduce((s, x) => s + x.n, 0) }));
}

export function summarize(rows: AccountRow[], cap: number, now: Date) {
  const weekAgo = now.getTime() - 7 * 86_400_000;
  return {
    accounts: rows.length,
    active7: rows.filter((r) => r.lastSignInAt && Date.parse(r.lastSignInAt) >= weekAgo).length,
    aiToday: rows.reduce((s, r) => s + r.aiToday, 0),
    atCap: rows.filter((r) => r.aiToday >= cap).length,
  };
}

/** Adresse du tableau de bord Supabase, déduite de l'adresse du projet (https://<ref>.supabase.co). Null si elle n'a pas cette forme. */
export function supabaseDashboardUrl(projectUrl?: string | null): string | null {
  try {
    const m = new URL(projectUrl ?? "").hostname.match(/^([a-z0-9]{10,})\.supabase\.co$/);
    return m ? `https://supabase.com/dashboard/project/${m[1]}` : null;
  } catch {
    return null;
  }
}
