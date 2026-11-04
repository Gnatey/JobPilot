// Lecture page après page : Supabase coupe chaque réponse à 1 000 lignes, les statistiques et l'apprentissage ne doivent pas être faux au-delà.
import { fetchAll } from "../lib/paged";
import { computeStats } from "../lib/stats";
import { computeLearning } from "../lib/learning";
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
done();
