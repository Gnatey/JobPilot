// En-tête de sécurité du navigateur (CSP) : contenu de la politique + garde-fou « le code n'appelle rien que la politique interdit ».
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { buildCsp, supabaseSources, EXTERNAL_CONNECT } from "@/lib/csp";
import nextConfig from "../next.config";
import { ok, done } from "./helpers";

const parse = (csp: string) => Object.fromEntries(csp.split("; ").map((d) => { const [k, ...v] = d.split(" "); return [k, v]; })) as Record<string, string[]>;
const SB = "https://abcd1234.supabase.co";
const prod = parse(buildCsp({ supabaseUrl: SB }));
const dev = parse(buildCsp({ supabaseUrl: SB, dev: true }));

// ---------- Contenu de la politique ----------
ok("rien par défaut sauf ce site", JSON.stringify(prod["default-src"]) === JSON.stringify(["'self'"]));
ok("aucune page ne peut être mise dans un cadre d'un autre site", JSON.stringify(prod["frame-ancestors"]) === JSON.stringify(["'none'"]) && JSON.stringify(prod["frame-src"]) === JSON.stringify(["'none'"]));
ok("pas de plugin, base de page figée, formulaires vers ce site seulement", JSON.stringify(prod["object-src"]) === JSON.stringify(["'none'"]) && JSON.stringify(prod["base-uri"]) === JSON.stringify(["'self'"]) && JSON.stringify(prod["form-action"]) === JSON.stringify(["'self'"]));
ok("en production : pas d'eval, pas de http, pas de joker sur les scripts", !prod["script-src"].includes("'unsafe-eval'") && !/\bhttp:/.test(buildCsp({ supabaseUrl: SB })) && !prod["script-src"].some((s) => s.includes("*") || s.startsWith("http")));
ok("en production : les requêtes http sont remontées en https", "upgrade-insecure-requests" in prod);
ok("connect-src : ce site, la base Supabase exacte (https et websocket) et l'API des communes", ["'self'", SB, "wss://abcd1234.supabase.co", "https://geo.api.gouv.fr"].every((s) => prod["connect-src"].includes(s)) && !prod["connect-src"].some((s) => s === "*" || s === "https:"));
ok("le QR code (data:) peut s'afficher, mais aucune image d'un autre site", prod["img-src"].includes("data:") && !prod["img-src"].some((s) => s.startsWith("http") || s === "*"));
ok("en développement seulement : eval et rechargement à chaud", dev["script-src"].includes("'unsafe-eval'") && dev["connect-src"].includes("ws:") && !("upgrade-insecure-requests" in dev));
ok("adresse Supabase invalide ou absente : repli sur *.supabase.co, jamais « tout »", JSON.stringify(supabaseSources(undefined)) === JSON.stringify(["https://*.supabase.co", "wss://*.supabase.co"]) && JSON.stringify(supabaseSources("n'importe quoi")) === JSON.stringify(supabaseSources(undefined)) && supabaseSources("http://localhost:54321")[0] === "https://*.supabase.co");
ok("une adresse locale en https est reprise telle quelle (tests)", supabaseSources("https://127.0.0.1:54321")[0] === "https://127.0.0.1:54321" && supabaseSources("https://127.0.0.1:54321")[1] === "wss://127.0.0.1:54321");

// ---------- Branchement dans next.config.ts ----------
const rules = await nextConfig.headers!();
const all = rules.find((r) => r.source === "/:path*");
const hv = (k: string) => all?.headers.find((h) => h.key === k)?.value;
ok("l'en-tête est envoyé sur toutes les pages", typeof hv("Content-Security-Policy") === "string" && hv("Content-Security-Policy")!.includes("frame-ancestors 'none'"));
ok("les autres en-têtes de sécurité sont toujours là", hv("X-Content-Type-Options") === "nosniff" && hv("X-Frame-Options") === "DENY" && !!hv("Referrer-Policy") && !!hv("Permissions-Policy"));
ok("pas d'isolation d'ouverture (COOP) : le favori « Envoyer à JobPilot » écrit à la page /importer ouverte depuis un autre site", !hv("Cross-Origin-Opener-Policy"));

// ---------- Garde-fou : ce que le code demande au navigateur est autorisé ----------
function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(f)) out.push(p);
  }
  return out;
}
const files = ["app", "components", "lib"].flatMap((d) => walk(d));
const client = files.filter((f) => /^\s*["']use client["']/.test(readFileSync(f, "utf8").slice(0, 200)));
ok(`${client.length} fichiers côté navigateur analysés`, client.length > 20);

const allowed = [new URL(SB).origin, ...EXTERNAL_CONNECT];
const strays: string[] = [];
for (const f of client) {
  const src = readFileSync(f, "utf8");
  // fetch / XMLHttpRequest / EventSource / WebSocket vers une adresse écrite en dur
  for (const m of src.matchAll(/(?:fetch\(|XMLHttpRequest|EventSource\(|WebSocket\()\s*[`"'](https?:\/\/[^/`"'$]+|wss?:\/\/[^/`"'$]+)/g)) {
    if (!allowed.some((a) => a === m[1])) strays.push(`${f}: appelle ${m[1]}`);
  }
  // éléments qui chargent quelque chose d'ailleurs
  for (const m of src.matchAll(/<(iframe|embed|object|script)\b[^>]*\bsrc=/g)) strays.push(`${f}: <${m[1]} src>`);
  for (const m of src.matchAll(/<img\b[^>]*\bsrc=["'{`]?\s*["'`]?(https?:\/\/[^"'`}\s]+)/g)) strays.push(`${f}: image externe ${m[1]}`);
  for (const m of src.matchAll(/<form\b[^>]*\baction=["'{`]\s*["'`]?(https?:\/\/[^"'`}\s]+)/g)) strays.push(`${f}: formulaire vers ${m[1]}`);
  for (const m of src.matchAll(/<link\b[^>]*\bhref=["'`](https?:\/\/[^"'`]+)/g)) strays.push(`${f}: feuille de style externe ${m[1]}`);
}
ok("aucun appel du navigateur vers un service que la politique ne connaît pas", strays.length === 0, strays.join(" | "));

// L'adresse de l'API des communes est bien celle que le code utilise
ok("l'API des communes appelée par le code est dans la liste", /fetch\(`https:\/\/geo\.api\.gouv\.fr\//.test(readFileSync("components/zone-picker.tsx", "utf8")) && EXTERNAL_CONNECT.includes("https://geo.api.gouv.fr"));

// Le seul script écrit à la main dans les pages est le petit script fixe du thème
const inline = files.filter((f) => /dangerouslySetInnerHTML=\{\{/.test(readFileSync(f, "utf8")));
ok("un seul `dangerouslySetInnerHTML`, celui du script de thème (texte fixe)", JSON.stringify(inline) === JSON.stringify([join("app", "layout.tsx")]) && /__html:\s*THEME_BOOT/.test(readFileSync("app/layout.tsx", "utf8")));
done();
