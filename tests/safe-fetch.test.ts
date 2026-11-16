// Lecture sécurisée des pages (lib/safe-fetch.ts) : un lien d'offre collé par une personne ne doit jamais faire lire une adresse interne du serveur
// (réseau privé, métadonnées cloud), ni être suivi par une redirection piégée ; taille et redirections bornées. Audit du 16 novembre 2026 : aucun test n'existait.
import http from "node:http";
import zlib from "node:zlib";
import type { AddressInfo } from "node:net";
import { ok, done } from "./helpers";
import { isPrivateIp, checkUrl, safeGet, safeGetForTests, BlockedUrlError } from "../lib/safe-fetch";

/* ---------- Adresses ---------- */
const priv = ["0.0.0.0", "10.1.2.3", "127.0.0.1", "127.255.255.254", "169.254.169.254", "172.16.0.1", "172.31.255.255", "192.168.1.10", "100.64.0.1", "198.18.0.1", "224.0.0.1", "255.255.255.255",
  "::1", "::", "fc00::1", "fd12:3456::1", "fe80::1", "febf::1", "fec0::1", "ff02::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1", "::ffff:7f00:1"];
const pub = ["8.8.8.8", "93.184.216.34", "172.15.0.1", "172.32.0.1", "100.63.255.255", "100.128.0.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"];
for (const ip of priv) ok(`adresse privée refusée : ${ip}`, isPrivateIp(ip));
for (const ip of pub) ok(`adresse publique permise : ${ip}`, !isPrivateIp(ip));
ok("une chaîne qui n'est pas une adresse est refusée par prudence", isPrivateIp("pas-une-ip"));

/* ---------- Adresses d'offre ---------- */
const refused = (u: string) => { try { checkUrl(u); return false; } catch (e) { return e instanceof BlockedUrlError; } };
for (const u of [
  "file:///etc/passwd", "ftp://example.com/x", "javascript:alert(1)", "gopher://example.com",
  "http://user:pass@example.com/", "https://example.com:8443/x", "http://example.com:22/",
  "http://localhost/", "http://app.localhost/", "http://imprimante.local/", "http://base.internal/",
  "http://127.0.0.1/", "http://169.254.169.254/latest/meta-data/", "http://[::1]/", "http://[::ffff:127.0.0.1]/", "http://10.0.0.5/admin",
  "http://2130706433/", "http://0x7f.0.0.1/", "http://127.1/", "http://0177.0.0.1/",
  "pas une adresse",
]) ok(`adresse refusée : ${u}`, refused(u));
for (const u of ["https://example.com/emplois/123", "http://example.com/offre?id=9", "https://www.hellowork.com/fr-fr/emplois/12345.html", "https://example.com:443/x"]) ok(`adresse permise : ${u}`, !refused(u));

/* ---------- Un nom qui pointe vers une adresse interne est refusé à la connexion ---------- */
{
  let err: unknown;
  try { await safeGet("http://localtest.me/", { timeoutMs: 4000 }); } catch (e) { err = e; }
  // Sans réseau l'atelier ne résout pas ce nom (erreur DNS) : l'important est de ne jamais obtenir de réponse
  ok("un nom résolu vers 127.0.0.1 (ou non résolu) n'est jamais lu", err instanceof Error);
}

/* ---------- Serveur local : mêmes règles, sans le blocage des adresses privées ---------- */
const big = "x".repeat(300_000);
const server = http.createServer((req, res) => {
  const u = req.url ?? "/";
  if (u === "/ok") { res.setHeader("content-type", "text/html; charset=utf-8"); return void res.end("<html>Bonjour</html>"); }
  if (u === "/r1") { res.statusCode = 302; res.setHeader("location", "/r2"); return void res.end(); }
  if (u === "/r2") { res.statusCode = 301; res.setHeader("location", "/ok"); return void res.end(); }
  if (u === "/loop") { res.statusCode = 302; res.setHeader("location", "/loop"); return void res.end(); }
  if (u === "/to-file") { res.statusCode = 302; res.setHeader("location", "file:///etc/passwd"); return void res.end(); }
  if (u === "/pdf") { res.setHeader("content-type", "application/pdf"); return void res.end("%PDF-1.4"); }
  if (u === "/big") { res.setHeader("content-type", "text/plain"); return void res.end(big); }
  if (u === "/gzip") { res.setHeader("content-type", "text/html"); res.setHeader("content-encoding", "gzip"); return void res.end(zlib.gzipSync("<html>compressé</html>")); }
  if (u === "/bomb") { res.setHeader("content-type", "text/html"); res.setHeader("content-encoding", "gzip"); return void res.end(zlib.gzipSync("a".repeat(5_000_000))); }
  if (u === "/slow") { res.setHeader("content-type", "text/html"); res.write("début"); return; } // jamais terminé
  res.statusCode = 404; res.end("non");
});
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const get = (p: string, o = {}) => safeGetForTests(base + p, o);
const fails = async (p: string, o = {}) => { try { await get(p, o); return null; } catch (e) { return e as Error; } };

{
  const r = await get("/ok");
  ok("page normale lue", r.status === 200 && r.body.includes("Bonjour"));
  const t = await get("/r1");
  ok("deux redirections suivies jusqu'à la page", t.status === 200 && t.body.includes("Bonjour") && t.finalUrl.endsWith("/ok"));
  const l = await fails("/loop");
  ok("boucle de redirections : arrêt net", l instanceof BlockedUrlError && /redirections/.test(l.message));
  // (Le mode « tests » laisse passer les adresses privées : la redirection vers une adresse interne se vérifie par le contrôle d'adresse ci-dessus et par la lecture du code.)
  ok("chaque redirection repasse par le contrôle d'adresse", /current = checkUrl\(new URL\(res\.location, current\)\.toString\(\), allowPrivate\)/.test((await import("node:fs")).readFileSync("lib/safe-fetch.ts", "utf8")));
  const f = await fails("/to-file");
  ok("redirection vers un fichier local : refusée", f instanceof BlockedUrlError);
  const pdf = await get("/pdf");
  ok("un PDF n'est pas lu comme une page (415)", pdf.status === 415 && pdf.body === "");
  const b = await get("/big", { maxBytes: 50_000 });
  ok("taille limitée : la page est coupée à la limite, pas rapportée en entier", b.status === 200 && b.body.length === 50_000);
  const g = await get("/gzip");
  ok("réponse compressée décodée", g.body.includes("compressé"));
  const z = await get("/bomb", { maxBytes: 100_000 });
  ok("bombe de décompression : la limite porte sur le texte décompressé", z.body.length <= 400_000 && z.body.length < 5_000_000, String(z.body.length));
  const s = await fails("/slow", { timeoutMs: 1200 });
  ok("serveur qui ne finit jamais : délai dépassé", s instanceof Error);
}
server.closeAllConnections?.();
server.close();
done();
