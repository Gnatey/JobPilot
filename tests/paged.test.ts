// Lecture page après page : Supabase coupe chaque réponse à 1 000 lignes, les statistiques et l'apprentissage ne doivent pas être faux au-delà.
import { fetchAll } from "../lib/paged";
import { computeStats } from "../lib/stats";
import { computeLearning } from "../lib/learning";
import { mergeDuplicateApplications } from "../lib/offer-ops";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { ok, done } from "./helpers";

/** Faux serveur : renvoie la tranche demandée, mais jamais plus de `cap` lignes (comme le réglage « Max rows » de Supabase). */
const server = (rows: unknown[], cap = 1000) => {
  const calls = { n: 0 };
  const page = (a: number, b: number) => { calls.n++; return Promise.resolve({ data: rows.slice(a, Math.min(b, a + cap - 1) + 1), error: null }); };
  return { page, calls };
};
const nums = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i }));

// ---------- fetchAll ----------
{
  const s = server([]);
  const r = await fetchAll(s.page);
  ok("table vide : aucune ligne, pas d'erreur", r.data.length === 0 && !r.error && !r.truncated);
}
{
  const s = server(nums(2500));
  const r = await fetchAll<{ id: number }>(s.page);
  ok("2 500 lignes avec un plafond de 1 000 : toutes lues", r.data.length === 2500 && !r.truncated, `${r.data.length} lignes en ${s.calls.n} requêtes`);
  ok("aucune ligne lue deux fois ni sautée, dans l'ordre", r.data.every((x, i) => x.id === i));
}
{
  const r = await fetchAll<{ id: number }>(server(nums(1700), 500).page);
  ok("plafond du serveur plus bas que la taille demandée (500) : rien n'est sauté", r.data.length === 1700 && r.data.every((x, i) => x.id === i));
}
{
  const r = await fetchAll<{ id: number }>(server(nums(2000)).page);
  ok("nombre de lignes multiple exact de la page : toutes lues", r.data.length === 2000);
}
{
  const s = server(nums(300));
  const r = await fetchAll<{ id: number }>(s.page);
  ok("petite table : 300 lignes, 2 requêtes au plus", r.data.length === 300 && s.calls.n <= 2, `${s.calls.n} requêtes`);
}
{
  let n = 0;
  const r = await fetchAll<{ id: number }>((a) => { n++; return Promise.resolve(n === 2 ? { data: null, error: { message: "boom" } } : { data: nums(1000).map((x) => ({ id: a + x.id })), error: null }); });
  ok("erreur en cours de route : on rend ce qui est lu et l'erreur, sans boucler", r.error?.message === "boom" && r.data.length === 1000 && n === 2);
}
{
  const r = await fetchAll<{ id: number }>(server(nums(5000)).page, { maxRows: 2500 });
  ok("garde-fou : coupé à 2 500 lignes et signalé", r.data.length === 2500 && r.truncated);
}

// ---------- Statistiques et apprentissage au-delà de 1 000 lignes ----------
type Row = Record<string, unknown>;
/** Faux Supabase : from(table).select().order().range() / .eq() / .in() / .not() ; plafond de 1 000 lignes par réponse. */
const fakeDb = (tables: Record<string, Row[]>) => ({
  from(name: string) {
    let from = 0, to = Infinity;
    const q: Record<string, unknown> = {};
    const self = () => q;
    for (const m of ["select", "order", "eq", "in", "not", "is", "gte", "lte"]) q[m] = self;
    q.range = (a: number, b: number) => { from = a; to = b; return q; };
    q.then = (res: (v: unknown) => unknown) => {
      const all = tables[name] ?? [];
      const end = Math.min(to + 1, from + 1000);
      return Promise.resolve({ data: all.slice(from, end), error: null }).then(res);
    };
    return q;
  },
});
const recos: Row[] = Array.from({ length: 2400 }, (_, i) => ({ id: String(i), status: i % 3 === 0 ? "accepted" : i % 3 === 1 ? "rejected" : "new", reject_reason: i % 3 === 1 ? "metier" : null, source: "x", quick_score: 50, senior: false, title: `Data analyst ${i % 7}`, company: `Entreprise ${i % 40}` }));
const db = fakeDb({ applications: [], status_history: [], emails: [], recommendations: recos, offers: [] }) as never;
const stats = await computeStats(db);
const tri = (stats as unknown as { triage?: { received?: number } }).triage;
ok("statistiques : les 2 400 recommandations sont toutes comptées (avant : 1 000)", tri?.received === 2400, `reçues = ${tri?.received}`);
const learning = await computeLearning(db, "u1");
const total = Object.values(learning.reasons ?? {}).reduce((a: number, b) => a + (b as number), 0);
ok("apprentissage : les 800 refus « métier » sont tous comptés (avant : 333)", total === 800, `raisons comptées = ${total}`);

// ---------- Doublons dans Suivi au-delà de 1 000 lignes ----------
{
  const deleted: string[] = [];
  const mergeDb = (rows: Row[]) => ({
    from() {
      let from = 0, to = Infinity, del = false;
      const q: Record<string, unknown> = {};
      for (const m of ["select", "order", "eq", "not", "is"]) q[m] = () => q;
      q.range = (a: number, b: number) => { from = a; to = b; return q; };
      q.limit = (n: number) => { to = from + n - 1; return q; }; // comme PostgREST : `limit` demande n lignes, le serveur en rend 1 000 au plus
      q.delete = () => { del = true; return q; };
      q.in = (_col: string, ids: string[]) => { if (del) deleted.push(...ids); return q; };
      q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: del ? null : rows.slice(from, Math.min(to + 1, from + 1000)), error: null }).then(res);
      return q;
    },
  });
  // 1 200 offres, chacune une fois, puis 300 doublons vides rangés APRÈS la ligne 1 000 : une lecture coupée à 1 000 ne les verrait jamais
  const rows: Row[] = [
    ...Array.from({ length: 1200 }, (_, i) => ({ id: `a${i}`, offer_id: `o${i}`, status: "a_postuler", applied_at: null, notes: null, contact: null, salary: null })),
    ...Array.from({ length: 300 }, (_, i) => ({ id: `b${i}`, offer_id: `o${i}`, status: "a_postuler", applied_at: null, notes: null, contact: null, salary: null })),
  ];
  const n = await mergeDuplicateApplications(mergeDb(rows) as never, "u1");
  ok("doublons de Suivi : les 300 doublons rangés après la ligne 1 000 sont retrouvés (avant : 0)", n === 300 && deleted.length === 300, `${n} retirés`);
  const kept = new Set(rows.map((r) => r.offer_id as string));
  ok("doublons de Suivi : une ligne est gardée pour chaque offre", deleted.every((id) => rows.some((r) => r.id === id)) && kept.size === 1200 && n === rows.length - kept.size);
}

// ---------- Garde-fou : aucune lecture ne demande plus de 1 000 lignes avec `limit`, et les lectures complètes passent par fetchAll ----------
{
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p, out);
      else if (/\.(ts|tsx)$/.test(f)) out.push(p);
    }
    return out;
  };
  const files = ["app", "lib", "components"].flatMap((d) => walk(d));
  const big = files.flatMap((f) => [...readFileSync(f, "utf8").matchAll(/\.limit\((\d+)\)/g)].filter((m) => Number(m[1]) > 1000).map((m) => `${f}: limit(${m[1]})`));
  ok("aucun `limit(N)` au-dessus de 1 000 (Supabase coupe à 1 000 : le chiffre mentirait)", big.length === 0, big.join(" | "));
  for (const [f, what] of [
    ["app/offres/page.tsx", 'from("applications").select("offer_id, status")'],
    ["lib/sync.ts", 'from("applications").select("id, company, title, status, applied_at")'],
    ["lib/offer-ops.ts", 'from("applications")\n      .select("id, offer_id, status, applied_at, notes, contact, salary")'],
    ["app/api/offers/queue/route.ts", 'from("recommendations").select("id, title, company, url, quick_score'],
  ] as [string, string][]) {
    const src = readFileSync(f, "utf8");
    const at = src.indexOf(what);
    ok(`${f} : lecture complète par pages avec un tri stable`, at > 0 && src.lastIndexOf("fetchAll(", at) > at - 300 && /\.order\("id"\)\s*\.?\s*\n?\s*\.?range\(a, b\)/.test(src.slice(at, at + 700)));
  }
}
done();
