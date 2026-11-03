/**
 * Reconnexion espacée (logique pure, sans réseau : testée dans tests/reauth.test.ts).
 *
 * - Une personne ordinaire se reconnecte (mot de passe ou lien) au plus tous les 90 jours ; l'admin tous les 30 jours.
 * - Le code de la vérification en deux étapes n'est pas redemandé à chaque connexion : une fois saisi, l'appareil est « de confiance »
 *   pendant la même durée (cookie signé, posé par /api/auth/trust, lu par le middleware).
 */
import { isAdminEmail } from "./admin";

export const USER_DAYS = 90;
export const ADMIN_DAYS = 30;
const DAY = 86_400_000;

type Env = Record<string, string | undefined>;

/** Durée (en jours) entre deux authentifications complètes : 30 pour l'admin, 90 pour les autres. */
export const reauthDays = (email?: string | null, env: Env = process.env) => (isAdminEmail(email, env) ? ADMIN_DAYS : USER_DAYS);

/**
 * Date (ms) de la dernière authentification d'après la revendication `amr` du jeton Supabase
 * (liste de { method, timestamp en secondes }) : la plus récente. Null si le jeton n'en dit rien.
 */
export function lastAuthAt(amr: unknown): number | null {
  if (!Array.isArray(amr)) return null;
  const times = amr
    .map((e) => (e && typeof e === "object" ? Number((e as { timestamp?: unknown }).timestamp) : NaN))
    .filter((t) => Number.isFinite(t) && t > 0);
  return times.length ? Math.max(...times) * 1000 : null;
}

/** La session est-elle plus vieille que la durée permise ? Sans date d'authentification dans le jeton, on ne coupe pas. */
export function sessionExpired(amr: unknown, email: string | null | undefined, nowMs: number, env: Env = process.env): boolean {
  const at = lastAuthAt(amr);
  if (at == null) return false;
  return nowMs - at > reauthDays(email, env) * DAY;
}

/* ---------- Appareil de confiance (cookie signé) ---------- */

export const TRUST_COOKIE = "jp_trust";
/** Le secret vient de la clé de service déjà présente dans Vercel : aucune nouvelle clé à ajouter. Sans elle, l'appareil n'est jamais « de confiance ». */
export const trustSecret = (env: Env = process.env) => env.SUPABASE_SERVICE_ROLE_KEY || "";

const enc = new TextEncoder();
const b64 = (bytes: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const hmacKey = (secret: string, usage: KeyUsage[]) => crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, usage);
const message = (userId: string, issuedMs: number) => enc.encode(`jobpilot-trust-v1|${userId}|${issuedMs}`);

/** Valeur du cookie : `<émis en ms>.<signature>`. Null si aucun secret n'est configuré. */
export async function signTrust(userId: string, issuedMs: number, secret: string): Promise<string | null> {
  if (!secret || !userId) return null;
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret, ["sign"]), message(userId, issuedMs));
  return `${issuedMs}.${b64(sig)}`;
}

/** Le cookie est-il authentique, au nom de cette personne, et plus récent que la durée permise (30 jours admin, 90 sinon) ? */
export async function verifyTrust(value: string | undefined | null, userId: string, email: string | null | undefined, nowMs: number, secret: string, env: Env = process.env): Promise<boolean> {
  if (!value || !secret || !userId) return false;
  const [issued, sig, ...rest] = value.split(".");
  if (rest.length || !issued || !sig || !/^\d{10,15}$/.test(issued)) return false;
  const issuedMs = Number(issued);
  if (issuedMs > nowMs + 5 * 60_000) return false; // émis « dans le futur » : rejeté
  if (nowMs - issuedMs > reauthDays(email, env) * DAY) return false;
  try {
    return await crypto.subtle.verify("HMAC", await hmacKey(secret, ["verify"]), unb64(sig), message(userId, issuedMs));
  } catch {
    return false; // signature mal formée
  }
}

/** Le jeton prouve-t-il que le code à 6 chiffres vient d'être saisi (niveau aal2 et méthode « totp » datée de moins de 2 minutes) ? */
export function justVerifiedCode(claims: { aal?: unknown; amr?: unknown } | null | undefined, nowMs: number): boolean {
  if (!claims || claims.aal !== "aal2" || !Array.isArray(claims.amr)) return false;
  return claims.amr.some((e) => {
    const x = e as { method?: unknown; timestamp?: unknown };
    return x?.method === "totp" && Number.isFinite(Number(x.timestamp)) && nowMs - Number(x.timestamp) * 1000 <= 2 * 60_000 && Number(x.timestamp) * 1000 <= nowMs + 60_000;
  });
}
