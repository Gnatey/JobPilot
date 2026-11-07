// Fausse base en mémoire pour tester les routes sans réseau : juste assez de l'API de supabase-js (select, insert, update, delete, filtres, order, limit,
// maybeSingle, single, count, upsert). Pas de sécurité par ligne (une seule personne). `unique` : colonnes qui doivent rester uniques par table (erreur 23505, comme Postgres).
export type Row = Record<string, unknown>;

/** `missing` : tables qui n'existent pas encore (mise à jour de la base pas lancée) : toute requête dessus répond l'erreur de PostgREST (PGRST205). */
export function fakeSupabase(seed: Record<string, Row[]> = {}, unique: Record<string, string[]> = {}, opts: { missing?: string[] } = {}) {
  const tables: Record<string, Row[]> = Object.fromEntries(Object.entries(seed).map(([k, v]) => [k, v.map((r) => ({ ...r }))]));
  let n = 0;
  const log: string[] = [];
  class Q {
    private filters: ((r: Row) => boolean)[] = [];
    private op: "select" | "insert" | "update" | "delete" | "upsert" = "select";
    private conflict = "id";
    private patch: Row | Row[] | null = null;
    private head = false;
    private wantCount = false;
    private lim = Infinity;
    private sort: [string, boolean][] = [];
    private mode: "one" | "maybe" | null = null;
    constructor(private t: string) {}
    select(_cols?: string, o?: { count?: string; head?: boolean }) { if (o?.count) this.wantCount = true; if (o?.head) this.head = true; return this; }
    insert(r: Row | Row[]) { this.op = "insert"; this.patch = r; return this; }
    upsert(r: Row, o?: { onConflict?: string }) { this.op = "upsert"; this.patch = r; this.conflict = o?.onConflict ?? "id"; return this; }
    update(p: Row) { this.op = "update"; this.patch = p; return this; }
    delete() { this.op = "delete"; return this; }
    eq(c: string, v: unknown) { this.filters.push((r) => r[c] === v); return this; }
    in(c: string, vs: unknown[]) { this.filters.push((r) => vs.includes(r[c])); return this; }
    is(c: string, v: unknown) { this.filters.push((r) => (r[c] ?? null) === v); return this; }
    order(c: string, o?: { ascending?: boolean }) { this.sort.push([c, o?.ascending !== false]); return this; }
    limit(k: number) { this.lim = k; return this; }
    maybeSingle() { this.mode = "maybe"; return this; }
    single() { this.mode = "one"; return this; }
    then<T>(res: (v: { data: unknown; error: unknown; count?: number }) => T, rej?: (e: unknown) => T) { return Promise.resolve(this.run()).then(res, rej); }
    private run(): { data: unknown; error: unknown; count?: number } {
      log.push(`${this.op} ${this.t}`);
      if (opts.missing?.includes(this.t)) return { data: null, error: { code: "PGRST205", message: `Could not find the table 'public.${this.t}' in the schema cache` } };
      const rows = (tables[this.t] ??= []);
      if (this.op === "upsert") {
        const r = this.patch as Row;
        const hit = rows.find((x) => x[this.conflict] === r[this.conflict]);
        if (hit) { Object.assign(hit, r); return { data: null, error: null }; }
        rows.push({ id: `${this.t}-${++n}`, created_at: `2026-11-07T04:${String(n).padStart(2, "0")}:00Z`, ...r });
        return { data: null, error: null };
      }
      if (this.op === "insert") {
        const made: Row[] = [];
        for (const r of Array.isArray(this.patch) ? this.patch : [this.patch as Row]) {
          const cols = unique[this.t] ?? [];
          if (cols.length && rows.some((x) => cols.every((c) => x[c] === r[c]))) return { data: null, error: { code: "23505", message: "doublon" } };
          const row = { id: `${this.t}-${++n}`, created_at: `2026-11-07T04:${String(n).padStart(2, "0")}:00Z`, ...r };
          rows.push(row);
          made.push(row);
        }
        return this.shape(made);
      }
      const hit = rows.filter((r) => this.filters.every((f) => f(r)));
      if (this.op === "update") { for (const r of hit) Object.assign(r, this.patch); return { data: null, error: null }; }
      if (this.op === "delete") { tables[this.t] = rows.filter((r) => !hit.includes(r)); return { data: null, error: null }; }
      for (const [c, asc] of [...this.sort].reverse()) hit.sort((a, b) => (String(a[c] ?? "") < String(b[c] ?? "") ? -1 : String(a[c] ?? "") > String(b[c] ?? "") ? 1 : 0) * (asc ? 1 : -1));
      return this.shape(hit.slice(0, this.lim), hit.length);
    }
    private shape(rows: Row[], total = rows.length) {
      const count = this.wantCount ? total : undefined;
      if (this.head) return { data: null, error: null, count };
      if (this.mode) return { data: rows[0] ?? null, error: this.mode === "one" && !rows[0] ? { message: "aucune ligne" } : null, count };
      return { data: rows, error: null, count };
    }
  }
  const sb = { from: (t: string) => new Q(t), rpc: async () => ({ data: true, error: null }) };
  return { sb: sb as never, tables, log };
}
