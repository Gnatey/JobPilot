// Export des données : toutes les lignes (Supabase coupe sinon à 1 000 sans le dire), jamais de trou silencieux, jamais de secret.
import { readFileSync } from "node:fs";
import { EXPORT_TABLES, readExport, stripSecrets } from "../lib/user-export";
import { ok, done } from "./helpers";

/** Faux serveur : rend la tranche demandée, mais jamais plus de `cap` lignes par réponse (comme « Max rows » de Supabase). */
const server = (sizes: Record<string, number>, cap = 1000, fail?: string) => {
  const calls: string[] = [];
  const read = (t: string, from: number, to: number) => {
    calls.push(t);
    if (t === fail) return Promise.resolve({ data: null, error: { message: "boom" } });
    const total = sizes[t] ?? 0;
    const end = Math.min(to, from + cap - 1, total - 1);
    return Promise.resolve({ data: end < from ? [] : Array.from({ length: end - from + 1 }, (_, i) => ({ id: from + i })), error: null });
  };
  return { read, calls };
};

// ---------- Toutes les lignes, même au-delà du plafond de 1 000 ----------
{
  const s = server({ offers: 2600, recommendations: 4200, documents: 250, applications: 12, profiles: 1 });
  const r = await readExport(s.read);
  ok("2 600 offres et 4 200 recommandations : toutes exportées malgré le plafond de 1 000", r.tables.offers.length === 2600 && r.tables.recommendations.length === 4200, JSON.stringify(r.counts));
  ok("aucune ligne lue deux fois ni sautée", (r.tables.recommendations as { id: number }[]).every((x, i) => x.id === i));
  ok("les comptes par table sont dans le résultat (pour vérifier le fichier)", r.counts.offers === 2600 && r.counts.documents === 250 && r.counts.applications === 12 && r.counts.profiles === 1 && r.counts.emails === 0);
  ok("toutes les tables prévues sont là, même vides, dans l'ordre", Object.keys(r.tables).join() === EXPORT_TABLES.join());
  ok("rien n'est dit « tronqué » quand tout est lu", r.truncated.length === 0);
}

// ---------- Un trou silencieux est impossible ----------
{
  let msg = "";
  try { await readExport(server({ offers: 10, documents: 5 }, 1000, "documents").read); } catch (e) { msg = (e as Error).message; }
  ok("une table illisible fait échouer l'export, avec un message clair (pas de fichier incomplet)", msg.includes("« documents »") && msg.includes("réessaie"), msg);
}

// ---------- Les secrets ----------
{
  ok("le jeton Gmail n'est jamais exporté (la table n'est pas dans la liste)", !(EXPORT_TABLES as readonly string[]).includes("gmail_accounts"));
  const profiles = [{ user_id: "u", data: { preferences: { ics_token: "secret-agenda", daily_quota: 15 } } }];
  stripSecrets(profiles);
  ok("le lien secret de l'agenda est retiré, le reste des préférences reste", !("ics_token" in profiles[0].data.preferences) && profiles[0].data.preferences.daily_quota === 15);
  ok("aucun profil ou profil sans préférences : pas d'erreur", (() => { try { stripSecrets([]); stripSecrets([{ user_id: "u" }]); stripSecrets([{ data: {} }]); return true; } catch { return false; } })());
}

// ---------- Branchement de la route ----------
{
  const route = readFileSync("app/api/account/export/route.ts", "utf8");
  ok("route : lit par readExport (page après page), triée (id, user_id pour profiles), jamais un select(\"*\") nu", route.includes("readExport(") && /\.order\(t === "profiles" \? "user_id" : "id"\)/.test(route) && !/from\(t\)\.select\("\*"\)\)\.data/.test(route));
  ok("route : limite de requêtes toujours appelée juste après requireUser", /requireUser\(\);\s*await rateLimit\(supabase, "exportData"\)/.test(route));
  ok("route : le fichier est annoncé avec les comptes par table (row_counts)", route.includes("row_counts: counts"));
}

done();
