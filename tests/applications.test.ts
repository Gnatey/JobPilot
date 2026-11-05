// Candidatures et offres lues en entier : ni l'accueil, ni Suivi, ni Offres & CV, ni l'email du matin ne coupent la liste en silence.
import { readFileSync } from "node:fs";
import { loadApplications } from "../lib/applications";
import { olderThanLoaded } from "../lib/reco-query";
import { ok, done } from "./helpers";

type Row = { id: string; updated_at: string };
/** Faux Supabase : plafond de 1 000 lignes par réponse (comme « Max rows »), garde les tris demandés. */
const fake = (rows: Row[], failAt = -1) => {
  const log: { table: string; orders: string[] } = { table: "", orders: [] };
  let call = 0;
  const db = {
    from(table: string) {
      log.table = table;
      let a = 0, b = Infinity;
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.order = (col: string, o?: { ascending?: boolean }) => { log.orders.push(`${col}${o?.ascending === false ? " desc" : ""}`); return q; };
      q.range = (x: number, y: number) => { a = x; b = y; return q; };
      q.then = (res: (v: unknown) => unknown) => {
        const n = call++;
        if (n === failAt) return Promise.resolve({ data: null, error: { message: "boom" } }).then(res);
        const sorted = [...rows].sort((p, r) => r.updated_at.localeCompare(p.updated_at) || p.id.localeCompare(r.id));
        return Promise.resolve({ data: sorted.slice(a, Math.min(b + 1, a + 1000)), error: null }).then(res);
      };
      return q;
    },
  };
  return { db: db as never, log };
};
const make = (n: number): Row[] => Array.from({ length: n }, (_, i) => ({ id: `a${String(i).padStart(5, "0")}`, updated_at: new Date(Date.UTC(2026, 0, 1) + i * 3600e3).toISOString() }));

// 2 300 candidatures : avant, l'accueil en lisait 300 et Suivi 500
{
  const { db, log } = fake(make(2300));
  const r = await loadApplications(db);
  ok("2 300 candidatures : toutes lues (avant : 300 à l'accueil, 500 dans Suivi)", r.data.length === 2300 && !r.error && !r.truncated, `${r.data.length} lignes`);
  ok("les plus récemment modifiées d'abord, sans doublon ni ligne sautée", r.data.every((x, i) => i === 0 || x.updated_at <= r.data[i - 1].updated_at) && new Set(r.data.map((x) => x.id)).size === 2300);
  ok("la table lue est « applications », tri par date puis par id (tri stable entre deux pages)", log.table === "applications" && new Set(log.orders).size === 2 && log.orders.slice(0, 2).join(",") === "updated_at desc,id", log.orders.slice(0, 2).join(","));
}
{
  const r = await loadApplications(fake([]).db);
  ok("aucune candidature : liste vide, pas d'erreur", r.data.length === 0 && !r.error);
}
{
  const r = await loadApplications(fake(make(2300), 1).db);
  ok("lecture interrompue : l'erreur est signalée (Suivi garde alors sa liste complète au lieu de la remplacer par un morceau)", Boolean(r.error) && r.data.length === 1000);
}

// Offres plus anciennes que la liste chargée (onglets de Recommandées)
ok("412 à trier, 300 chargées : 112 plus anciennes", olderThanLoaded(412, 300) === 112);
ok("tout est chargé : aucune note", olderThanLoaded(37, 37) === 0 && olderThanLoaded(10, 37) === 0);
ok("comptage en échec (null) ou absent : on n'invente rien", olderThanLoaded(null, 30) === 0 && olderThanLoaded(undefined, 30) === 0);

// Garde-fou : ces lectures ne repassent pas par un `limit`, et passent par une lecture complète
const read = (f: string) => readFileSync(f, "utf8");
for (const f of ["app/page.tsx", "app/suivi/page.tsx", "components/suivi-board.tsx"]) {
  const src = read(f);
  ok(`${f} : candidatures lues par loadApplications, jamais par un limit`, src.includes("loadApplications(") && !/from\("applications"\)\s*\.select\("\*"\)[^;]*\.limit\(/.test(src));
}
{
  const src = read("lib/recap.ts");
  const at = src.indexOf('from("applications")');
  ok("email du matin : candidatures lues en entier, dans un ordre stable (pas de limit sans tri)", at > 0 && src.lastIndexOf("fetchAll(", at) > at - 120 && /\.order\("id"\)\s*\.range\(a, b\)/.test(src.slice(at, at + 260)) && !/from\("applications"\)[^\n]*\.limit\(/.test(src));
}
{
  const src = read("app/offres/page.tsx");
  const at = src.indexOf('from("offers")');
  ok("Offres & CV : toutes les offres lues (avant : les 300 plus récentes, une vieille offre « À postuler » disparaissait)", at > 0 && src.lastIndexOf("fetchAll(", at) > at - 80 && !/from\("offers"\)[^\n]*\.limit\(/.test(src));
  for (const t of ["documents", "recommendations"]) ok(`Offres & CV : lecture de « ${t} » par pages`, new RegExp(`fetchAll\\(\\(a, b\\) => supabase\\.from\\("${t}"\\)`).test(src));
}
{
  const src = read("app/recommandees/page.tsx");
  ok("Recommandées : les chiffres des onglets viennent de comptages exacts, pas de la taille des listes", (src.match(/count: "exact", head: true/g) ?? []).length === 1 && (src.match(/total\(\)\./g) ?? []).length === 5 && src.includes("olderThanLoaded"));
}
done();
