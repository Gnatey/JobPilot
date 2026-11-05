// Limitation des requêtes (côté serveur) : la fonction SQL est testée dans sql-rls.test.ts, ici le branchement TypeScript.
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { rateLimit, tooMany, LIMITS, type Bucket } from "@/lib/rate-limit";
import { ok, done } from "./helpers";

type Call = { fn: string; args: Record<string, unknown> };
const fake = (reply: { data: unknown; error: unknown }, calls: Call[] = []) =>
  ({ rpc: async (fn: string, args: Record<string, unknown>) => { calls.push({ fn, args }); return reply; } }) as unknown as SupabaseClient;
const outcome = (p: Promise<void>) => p.then(() => "ok", (e: { status?: number; message?: string }) => `${e.status}:${e.message}`);

// Passe : la base répond « true »
const calls: Call[] = [];
ok("demande autorisée : aucune erreur", (await outcome(rateLimit(fake({ data: true, error: null }, calls), "password"))) === "ok");
ok("la fonction SQL reçoit le seau, le plafond et la fenêtre", calls[0]?.fn === "rate_limit" && calls[0].args.p_bucket === "password" && calls[0].args.p_max === LIMITS.password.max && calls[0].args.p_window === LIMITS.password.windowSec);

// Refusée : la base répond « false » → 429 avec un message clair
const refused = await outcome(rateLimit(fake({ data: false, error: null }), "deleteAccount"));
ok("demande refusée : erreur 429", refused.startsWith("429:"), refused);
ok("message clair, sans mot technique", !/rate|sql|supabase|vercel|rpc|bucket/i.test(tooMany("deleteAccount")) && /Réessaie dans 1 h/.test(tooMany("deleteAccount")), tooMany("deleteAccount"));
ok("message du mot de passe en minutes", /Réessaie dans 10 minutes/.test(tooMany("password")), tooMany("password"));

// Panne ou script SQL pas encore lancé : on ne bloque personne
ok("fonction absente (script SQL pas lancé) : pas de blocage", (await outcome(rateLimit(fake({ data: null, error: { code: "PGRST202", message: "Could not find the function" } }), "exportData"))) === "ok");
ok("base en panne : pas de blocage", (await outcome(rateLimit(fake({ data: null, error: { message: "fetch failed" } }), "password"))) === "ok");
ok("réponse vide : pas de blocage", (await outcome(rateLimit(fake({ data: null, error: null }), "password"))) === "ok");

// Les valeurs restent dans ce que la fonction SQL accepte (fenêtre ≤ 86 400 s, seau ≤ 40 caractères, plafond ≥ 1)
for (const [name, l] of Object.entries(LIMITS)) ok(`seau « ${name} » accepté par la fonction SQL`, l.max >= 1 && l.windowSec >= 1 && l.windowSec <= 86400 && name.length <= 40);

// Les routes sensibles appellent bien la limite, juste après avoir identifié la personne et avant tout travail
const routes: Record<string, Bucket> = {
  "app/api/account/check-password/route.ts": "password",
  "app/api/account/delete/route.ts": "deleteAccount",
  "app/api/account/export/route.ts": "exportData",
  "app/api/admin/sources/route.ts": "testSources",
};
for (const [file, bucket] of Object.entries(routes)) {
  const src = readFileSync(file, "utf8");
  const call = src.indexOf(`rateLimit(supabase, "${bucket}")`);
  ok(`${file} limite le seau « ${bucket} »`, call > 0);
  const before = (marker: string) => !src.includes(marker) || call < src.indexOf(marker);
  // la porte : requireUser (routes des personnes) ou requireAdminApi (routes d'administration) ; elle doit exister et passer avant la limite
  const guard = Math.max(src.indexOf("requireUser()"), src.indexOf("requireAdminApi()"));
  ok(`${file} : après la porte d'entrée, avant la lecture de la demande et des données`, guard > -1 && guard < call && before("req.json()") && before("supabase.from("));
}

// Le script de mise à jour de la base contient la fonction appelée par le code et ne donne aucun droit direct sur la table
const sql = readFileSync("supabase/upgrade.sql", "utf8");
ok("le script de mise à jour définit rate_limit(text, int, int)", /create or replace function rate_limit\(p_bucket text, p_max int, p_window int\)/.test(sql));
ok("réservée aux personnes connectées (pas au public)", /revoke all on function rate_limit\(text, int, int\) from public/.test(sql) && /grant execute on function rate_limit\(text, int, int\) to authenticated/.test(sql));
ok("la table des compteurs a la sécurité par ligne et aucune politique", /alter table rate_hits enable row level security/.test(sql) && !/create policy[^;]*on rate_hits/i.test(sql));
done();
