/**
 * Chiffrement des jetons Gmail en base (logique pure, testée dans tests/token-crypto.test.ts).
 *
 * Un jeton de rafraîchissement donne accès à la boîte mail de la personne : s'il était lisible dans la base (sauvegarde, export, erreur de réglage),
 * il suffirait de le copier. On le stocke donc chiffré (AES-256-GCM) avec une clé qui n'existe que dans Vercel :
 *   - `TOKEN_ENCRYPTION_KEY` si elle est définie (permet de la changer sans toucher à la clé de service) ;
 *   - sinon dérivée de `SUPABASE_SERVICE_ROLE_KEY`, déjà présente : aucune nouvelle clé à ajouter.
 * Le jeton est lié à la personne (donnée authentifiée) : recopier le texte chiffré d'un compte vers un autre ne marche pas.
 * Format : `enc:v1:<iv>.<chiffré>`. Tout ce qui n'a pas ce préfixe est un ancien jeton en clair : il est encore lu, puis chiffré au passage.
 * Sans aucune clé, rien n'est chiffré (comportement d'avant) ; si la clé change ensuite, la personne reconnecte simplement Gmail.
 */

type Env = Record<string, string | undefined>;

export const SEALED_PREFIX = "enc:v1:";

const enc = new TextEncoder();
const dec = new TextDecoder();
const b64 = (bytes: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

export const tokenSecret = (env: Env = process.env) => env.TOKEN_ENCRYPTION_KEY || env.SUPABASE_SERVICE_ROLE_KEY || "";

export const isSealed = (stored: string | null | undefined) => !!stored && stored.startsWith(SEALED_PREFIX);

/** Un jeton encore en clair, alors qu'une clé est disponible : à chiffrer. */
export const needsSealing = (stored: string | null | undefined, env: Env = process.env) => !!stored && !isSealed(stored) && !!tokenSecret(env);

async function aesKey(secret: string, usage: KeyUsage[]) {
  const base = await crypto.subtle.importKey("raw", enc.encode(secret), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: enc.encode("jobpilot"), info: enc.encode("gmail-token-v1") }, base, { name: "AES-GCM", length: 256 }, false, usage);
}
const bound = (userId: string) => enc.encode(`jobpilot-gmail-v1|${userId}`);

/** Chiffre un jeton pour cette personne. Sans clé (ou sans jeton) : renvoie le texte tel quel. */
export async function sealToken(plain: string, userId: string, env: Env = process.env): Promise<string> {
  const secret = tokenSecret(env);
  if (!secret || !plain || !userId) return plain;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const out = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: bound(userId) }, await aesKey(secret, ["encrypt"]), enc.encode(plain));
  return `${SEALED_PREFIX}${b64(iv)}.${b64(out)}`;
}

/** Rend le jeton lisible. Un ancien jeton en clair passe tel quel ; un jeton chiffré qu'on ne peut pas ouvrir lève une erreur claire. */
export async function openToken(stored: string, userId: string, env: Env = process.env): Promise<string> {
  if (!isSealed(stored)) return stored;
  const secret = tokenSecret(env);
  const unreadable = new Error("Le jeton Gmail n'est plus lisible : reconnecte Gmail dans Réglages.");
  if (!secret) throw unreadable;
  try {
    const [iv, data, ...rest] = stored.slice(SEALED_PREFIX.length).split(".");
    if (rest.length || !iv || !data) throw unreadable;
    const out = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv), additionalData: bound(userId) }, await aesKey(secret, ["decrypt"]), unb64(data));
    return dec.decode(out);
  } catch {
    throw unreadable;
  }
}
