// Actions IA : aucun plafond par personne par défaut (décision de Juliana, 5 novembre 2026), plafond possible avec AI_DAILY_BUDGET.
// Le compteur continue de compter dans les deux cas (Administration › Comptes et usage).
import { readFileSync } from "node:fs";
import { ok, done } from "./helpers";
import { dailyBudget, spendAi, describeUsage, AI_COST } from "../lib/quota";
import { summarize } from "../lib/admin";

const env = process.env as Record<string, string | undefined>;
const budget = (v?: string) => { if (v === undefined) delete env.AI_DAILY_BUDGET; else env.AI_DAILY_BUDGET = v; return dailyBudget(); };

// ---------- Le plafond ----------
ok("AI_DAILY_BUDGET absent : pas de plafond", budget() === null);
ok("vide, 0, négatif ou illisible : pas de plafond non plus", budget("") === null && budget("0") === null && budget("-5") === null && budget("beaucoup") === null);
ok("un nombre remet un plafond (minimum 5)", budget("60") === 60 && budget("100") === 100 && budget("2") === 5 && budget(" 80 ") === 80);
ok("un nombre décimal est arrondi à l'entier inférieur", budget("60.9") === 60);

// ---------- Ce que fait spendAi ----------
type Call = { cost: number; cap: number };
const fakeDb = (reply: { data?: unknown; error?: unknown }) => {
  const calls: Call[] = [];
  return { calls, db: { rpc: async (_: string, a: Call) => { calls.push(a); return { data: reply.data ?? 1, error: reply.error ?? null }; } } as never };
};
const attempt = (p: Promise<unknown>) => p.then(() => null, (e: { status?: number; message?: string }) => e);

{
  budget();
  const { calls, db } = fakeDb({ data: 4 });
  await spendAi(db, { email: "ami@example.fr" }, AI_COST.offer);
  ok("sans plafond : l'action passe et le compteur est quand même incrémenté (coût réel)", calls.length === 1 && calls[0].cost === AI_COST.offer);
  ok("sans plafond : le plafond envoyé à la base est inatteignable", calls[0].cap >= 1_000_000_000);
  for (let i = 0; i < 200; i++) await spendAi(db, { email: "ami@example.fr" }, AI_COST.cvDiagnosis);
  ok("sans plafond : 200 actions de suite ne sont jamais refusées", calls.length === 201);
}
{
  budget("60");
  const { calls, db } = fakeDb({ data: -1 });
  const e = await attempt(spendAi(db, { email: "ami@example.fr" }, 2));
  ok("avec un plafond remis : la base le reçoit et le refus (429) redevient un message clair", calls[0].cap === 60 && e?.status === 429 && /limite d'actions IA/.test(e.message ?? "") && (e.message ?? "").includes("(60)"));
  const ok2 = fakeDb({ data: 12 });
  await spendAi(ok2.db, { email: "ami@example.fr" }, 2);
  ok("avec un plafond remis : sous le plafond, l'action passe", ok2.calls.length === 1);
}
{
  budget();
  const down = fakeDb({ error: { message: "function spend_ai does not exist" } });
  ok("base pas à jour : on ne bloque personne", (await attempt(spendAi(down.db, { email: "ami@example.fr" }, 2))) === null);
  env.OWNER_EMAILS = "juliana@example.fr";
  const spy = fakeDb({ data: -1 });
  await spendAi(spy.db, { email: "Juliana@example.fr" }, 2);
  ok("l'administratrice reste hors compteur", spy.calls.length === 0);
  delete env.OWNER_EMAILS;
}

// ---------- Ce que voit la personne ----------
{
  const free = describeUsage(12, null), capped = describeUsage(12, 60);
  ok("Réglages sans plafond : le nombre seul, jamais « sur null » ni « sur 0 »", free.figure === "12" && !/null|undefined|NaN/.test(free.figure + free.note));
  ok("Réglages sans plafond : dit honnêtement que l'IA gratuite est partagée et peut être à sa limite", /pas de limite par personne/.test(free.note) && /partagée/.test(free.note) && /réessayer/.test(free.note));
  ok("Réglages avec plafond : « 12 sur 60 »", capped.figure === "12 sur 60" && /repart de zéro/.test(capped.note));
}
{
  const rows = [{ aiToday: 5 }, { aiToday: 80 }] as never;
  const now = new Date("2026-11-05T10:00:00Z");
  ok("Administration sans plafond : personne n'est « au plafond »", summarize(rows, null, now).atCap === 0);
  ok("Administration avec plafond : on compte ceux qui l'ont atteint", summarize(rows, 60, now).atCap === 1);
  const page = readFileSync("app/admin/page.tsx", "utf8");
  ok("Administration : aucune comparaison avec un plafond qui pourrait être absent", !/aiToday >= overview\.cap\b(?! *&&)/.test(page.replace(/overview\.cap != null && r\.aiToday >= overview\.cap/g, "")));
}

// ---------- « Tout analyser » : file et message ----------
{
  const route = readFileSync("app/api/offers/queue/route.ts", "utf8");
  ok("la file « Tout analyser » accepte l'absence de plafond (possible = null, pas de blocage)", /cap == null \|\| used == null \? null/.test(route));
  const ui = readFileSync("components/analyze-all.tsx", "utf8");
  ok("l'écran s'arrête seulement si possible vaut exactement 0", /possible === 0/.test(ui) && /status === 429 \|\| status === 503/.test(ui));
}

// ---------- Documentation de la variable ----------
{
  ok(".env.example : la variable est vide par défaut", /^AI_DAILY_BUDGET=$/m.test(readFileSync(".env.example", "utf8")));
}
done();
