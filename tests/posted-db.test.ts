// Colonne posted_at (mise à jour 7) : sondée avant d'être lue ou écrite, jamais d'écrasement, jamais d'erreur si elle manque. Faux client, aucun réseau.
import { hasPostedColumn, isMissingPostedColumn, recoCols, rememberPosted, resetPostedCache } from "../lib/posted-db";
import { RECO_COLS } from "../lib/reco-query";
import { readFileSync } from "node:fs";
import { ok, done } from "./helpers";
import type { SupabaseClient } from "@supabase/supabase-js";

type Reply = { data?: unknown; error?: { code?: string; message?: string } | null };
/** Faux client : chaque requête enchaînée finit par répondre ce que `reply(op, cols)` décide ; `calls` garde les opérations. */
function stub(reply: (op: string, arg?: unknown) => Reply) {
  const calls: string[] = [];
  const chain = (op: string, arg?: unknown): unknown => {
    const q: Record<string, unknown> = {};
    for (const m of ["eq", "is", "limit", "select", "in", "order"]) q[m] = () => q;
    q.then = (res: (v: Reply) => unknown) => Promise.resolve({ data: null, error: null, ...reply(op, arg) }).then(res);
    return q;
  };
  const client = {
    from: () => ({
      select: (cols: string) => { calls.push(`select ${cols}`); return chain("select", cols); },
      update: (patch: unknown) => { calls.push(`update ${JSON.stringify(patch)}`); return chain("update", patch); },
    }),
  };
  return { client: client as unknown as SupabaseClient, calls };
}
const MISSING = { error: { code: "42703", message: "column recommendations.posted_at does not exist" } };

// ---------- Reconnaître une colonne absente, et elle seule ----------
ok("42703 (Postgres) = colonne absente", isMissingPostedColumn({ code: "42703", message: "x" }));
ok("PGRST204 (PostgREST) = colonne absente", isMissingPostedColumn({ code: "PGRST204", message: "Could not find the 'posted_at' column of 'recommendations' in the schema cache" }));
ok("message seul : « column … posted_at does not exist »", isMissingPostedColumn({ message: "column recommendations.posted_at does not exist" }));
ok("une autre erreur n'est pas une colonne absente", !isMissingPostedColumn({ code: "57014", message: "statement timeout" }) && !isMissingPostedColumn({ message: "JWT expired" }) && !isMissingPostedColumn(null));

// ---------- La sonde ----------
{
  resetPostedCache();
  const a = stub(() => ({ error: null, data: [] }));
  ok("colonne présente : vrai, et la requête de sonde ne demande que posted_at", (await hasPostedColumn(a.client, 1_000)) === true && a.calls[0] === "select posted_at");
  ok("le résultat est gardé en mémoire (pas de seconde requête dans les 10 minutes)", (await hasPostedColumn(a.client, 1_000 + 9 * 60_000)) === true && a.calls.length === 1);
  ok("recoCols ajoute la colonne quand elle existe", (await recoCols(a.client)) === `${RECO_COLS}, posted_at`);
}
{
  resetPostedCache();
  const b = stub(() => MISSING);
  ok("colonne absente : faux, et recoCols garde les colonnes d'avant (aucune erreur sur les pages)", (await hasPostedColumn(b.client)) === false && (await recoCols(b.client)) === RECO_COLS && b.calls.length === 1);
  resetPostedCache();
  ok("absente : gardée 30 secondes, puis re-sondée (la mise à jour lancée par la personne est vue vite)", (await hasPostedColumn(stub(() => MISSING).client, 5_000)) === false
    && (await hasPostedColumn(stub(() => ({ error: null, data: [] })).client, 5_000 + 10_000)) === false
    && (await hasPostedColumn(stub(() => ({ error: null, data: [] })).client, 5_000 + 31_000)) === true);
}
{
  resetPostedCache();
  const c = stub(() => ({ error: { code: "57014", message: "statement timeout" } }));
  ok("panne passagère : faux, SANS être gardé en mémoire (on resonde à la requête suivante)", (await hasPostedColumn(c.client)) === false && (await hasPostedColumn(c.client)) === false && c.calls.length === 2);
  resetPostedCache();
  const d = { from: () => { throw new Error("réseau coupé"); } } as unknown as SupabaseClient;
  ok("une exception du client ne remonte jamais", (await hasPostedColumn(d)) === false);
}

// ---------- rememberPosted ----------
{
  resetPostedCache();
  const ok1 = stub((op) => (op === "update" ? { data: [{ id: "r1" }] } : { data: [] }));
  ok("date rangée : vrai, avec posted_at seulement dans la mise à jour", (await rememberPosted(ok1.client, { id: "r1" }, "2026-11-05T12:00:00.000Z")) === true && ok1.calls.some((c) => c === 'update {"posted_at":"2026-11-05T12:00:00.000Z"}'));
  resetPostedCache();
  const already = stub((op) => (op === "update" ? { data: [] } : { data: [] }));
  ok("une date déjà connue n'est pas écrasée (aucune ligne touchée : faux)", (await rememberPosted(already.client, { id: "r1" }, "2026-11-05T12:00:00.000Z")) === false);
  resetPostedCache();
  const none = stub(() => MISSING);
  ok("colonne absente : rien n'est écrit, aucune erreur", (await rememberPosted(none.client, { offer_id: "o1" }, "2026-11-05T12:00:00.000Z")) === false && !none.calls.some((c) => c.startsWith("update")));
  resetPostedCache();
  const nothing = stub(() => ({ data: [] }));
  ok("pas de date : aucune requête", (await rememberPosted(nothing.client, { url: "https://x.fr/1" }, null)) === false && nothing.calls.length === 0);
  ok("par offre ou par adresse : accepté", (await rememberPosted(stub((op) => (op === "update" ? { data: [{ id: "r" }] } : { data: [] })).client, { url: "https://x.fr/1" }, "2026-11-05T12:00:00.000Z")) === true);
}

// ---------- Les écritures passent par la sonde ----------
{
  const read = (f: string) => readFileSync(f, "utf8");
  ok("la tâche du matin et le rangement des recherches n'écrivent posted_at que si la colonne existe", /hasPostedColumn\(supabase\)/.test(read("lib/sync.ts")) && /withPosted && posted \? \{ posted_at/.test(read("lib/sync.ts")));
  ok("« Stocker » (page Recherche) idem, et une date illisible ne fait plus échouer le rangement", /withPosted && posted \? \{ posted_at/.test(read("app/api/recommendations/route.ts")) && !/clip\(o\.date, 40\)/.test(read("app/api/recommendations/route.ts")));
  ok("aucune page ne demande posted_at sans passer par recoCols", ["app/recommandees/page.tsx", "app/recommandees/tri/page.tsx", "lib/day.ts"].every((f) => /recoCols\(/.test(read(f)) && !/select\(RECO_COLS\)/.test(read(f))));
}
done();
