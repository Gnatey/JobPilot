import http from "node:http";
import https from "node:https";
import net from "node:net";
import dns from "node:dns";
import zlib from "node:zlib";

/**
 * Lecture d'une page web à la demande d'un utilisateur (lien d'offre collé dans l'app).
 * Protège le serveur : jamais d'adresse privée ou interne (réseau local, métadonnées cloud),
 * y compris après une redirection ou une résolution DNS piégée ; taille et durée limitées.
 */

export class BlockedUrlError extends Error {}

/** Adresse réservée (boucle locale, réseau privé, lien local, multicast…) : interdite. */
export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || // CGNAT
      (a === 169 && b === 254) || // lien local, métadonnées cloud
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  if (net.isIPv6(ip)) {
    const x = ip.toLowerCase();
    if (x === "::1" || x === "::") return true;
    if (x.startsWith("::ffff:")) {
      const v4 = x.slice(7);
      return net.isIPv4(v4) ? isPrivateIp(v4) : true; // forme hexadécimale : on refuse par prudence
    }
    return /^(fc|fd|fe[89ab]|ff)/.test(x);
  }
  return true;
}

/** Contrôle d'une adresse avant même de se connecter (protocole, port, nom, IP littérale). */
export function checkUrl(raw: string, allowPrivate = false): URL {
  let u: URL;
  try { u = new URL(raw); } catch { throw new BlockedUrlError("Adresse invalide"); }
  if (!["http:", "https:"].includes(u.protocol)) throw new BlockedUrlError("Protocole refusé");
  if (u.username || u.password) throw new BlockedUrlError("Identifiants dans l'adresse refusés");
  if (u.port && !allowPrivate && !["80", "443"].includes(u.port)) throw new BlockedUrlError("Port refusé");
  const h = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (allowPrivate) return u;
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal") || !h) throw new BlockedUrlError("Adresse interne refusée");
  if (net.isIP(h) && isPrivateIp(h)) throw new BlockedUrlError("Adresse interne refusée");
  return u;
}

/** Résolution DNS qui refuse toute adresse privée au moment de la connexion (pas de fenêtre pour un DNS piégé). */
const guardedLookup: net.LookupFunction = (hostname, options, cb) => {
  dns.lookup(hostname, { ...options, all: true }, (err, addrs) => {
    if (err) return (cb as (e: Error) => void)(err);
    const list = addrs as dns.LookupAddress[];
    if (!list.length || list.some((a) => isPrivateIp(a.address))) return (cb as (e: Error) => void)(new BlockedUrlError("Adresse interne refusée"));
    if ((options as { all?: boolean }).all) return (cb as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, list);
    return (cb as unknown as (e: null, a: string, f: number) => void)(null, list[0].address, list[0].family);
  });
};

export type SafeResponse = { status: number; contentType: string; body: string; finalUrl: string };

type Opts = { headers?: Record<string, string>; timeoutMs?: number; maxBytes?: number; maxRedirects?: number };

export function safeGet(raw: string, opts: Opts = {}): Promise<SafeResponse> {
  return run(raw, opts, false);
}
/** Réservé aux tests (serveur local) : même code, sans le blocage des adresses privées. */
export const safeGetForTests = (raw: string, opts: Opts = {}) => run(raw, opts, true);

async function run(raw: string, opts: Opts, allowPrivate: boolean): Promise<SafeResponse> {
  const { timeoutMs = 12_000, maxBytes = 1_500_000, maxRedirects = 4 } = opts;
  const deadline = Date.now() + timeoutMs;
  let current = checkUrl(raw, allowPrivate);
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const res = await once(current, opts.headers ?? {}, Math.max(1000, deadline - Date.now()), maxBytes, allowPrivate);
    if ([301, 302, 303, 307, 308].includes(res.status) && res.location) {
      current = checkUrl(new URL(res.location, current).toString(), allowPrivate); // chaque étape est contrôlée à nouveau
      continue;
    }
    return { status: res.status, contentType: res.contentType, body: res.body, finalUrl: current.toString() };
  }
  throw new BlockedUrlError("Trop de redirections");
}

function once(u: URL, headers: Record<string, string>, timeoutMs: number, maxBytes: number, allowPrivate: boolean) {
  return new Promise<{ status: number; contentType: string; body: string; location?: string }>((resolve, reject) => {
    const lib = u.protocol === "https:" ? https : http;
    const req = lib.request(
      u,
      { method: "GET", headers: { "Accept-Encoding": "gzip, deflate, br", ...headers }, ...(allowPrivate ? {} : { lookup: guardedLookup }), timeout: timeoutMs },
      (res) => {
        const status = res.statusCode ?? 0;
        const contentType = String(res.headers["content-type"] ?? "");
        const location = typeof res.headers.location === "string" ? res.headers.location : undefined;
        if (status >= 300 && status < 400) { res.resume(); return resolve({ status, contentType, body: "", location }); }
        if (contentType && !/text\/|json|xml|html/i.test(contentType)) { res.destroy(); return resolve({ status: 415, contentType, body: "" }); }
        const enc = String(res.headers["content-encoding"] ?? "").toLowerCase();
        const stream: NodeJS.ReadableStream =
          enc === "gzip" ? res.pipe(zlib.createGunzip()) : enc === "deflate" ? res.pipe(zlib.createInflate()) : enc === "br" ? res.pipe(zlib.createBrotliDecompress()) : res;
        const chunks: Buffer[] = [];
        let size = 0;
        stream.on("data", (c: Buffer) => {
          size += c.length;
          if (size > maxBytes) { req.destroy(); stream.removeAllListeners("data"); return resolve({ status, contentType, body: Buffer.concat(chunks).toString("utf8") }); }
          chunks.push(c);
        });
        stream.on("end", () => resolve({ status, contentType, body: Buffer.concat(chunks).toString("utf8") }));
        stream.on("error", reject);
      }
    );
    req.on("timeout", () => req.destroy(new Error("Délai dépassé")));
    req.on("error", reject);
    req.end();
  });
}
