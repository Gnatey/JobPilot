// Protection de la base, sur une vraie base Postgres locale (PGlite, sans réseau) : le schéma complet est chargé, puis on se met
// à la place de deux personnes (et d'un visiteur sans compte) pour vérifier que chacune ne voit, ne change et n'efface que ses lignes.
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { ok, done } from "./helpers";

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
/** Tables sans aucune politique, exprès : personne n'y touche directement, seule une fonction « security definer » y écrit. */
const NO_POLICY = ["rate_hits"];

const db = new PGlite();
const file = (f: string) => readFileSync(`supabase/${f}`, "utf8");
const tryExec = async (sql: string) => db.exec(sql).then(() => "", (e: Error) => e.message);
const count = async (sql: string) => Number((await db.query<{ n: number }>(sql)).rows[0].n);

// ---------- Une « petite Supabase » : rôles, auth.users, auth.uid() ----------
await db.exec(`
  create role authenticated nologin; create role anon nologin;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to authenticated, anon;
  grant usage on schema public to authenticated, anon;
  alter default privileges in schema public grant all on tables to authenticated, anon;
  insert into auth.users values ('${A}'), ('${B}');
`);

// ---------- Les scripts SQL du dépôt ----------
const loaded = await tryExec(file("schema.sql"));
ok("schema.sql se charge sans erreur", loaded === "", loaded);
for (const f of ["upgrade.sql", "migration-2-diagnostics.sql", "upgrade.sql"]) {
  const err = await tryExec(file(f));
  ok(`${f} se rejoue sans erreur par-dessus le schéma`, err === "", err);
}

// ---------- Une base installée AVANT la limitation des requêtes, mise à jour par le script copié depuis Administration ----------
{
  const marker = "-- ===== Limitation des requêtes par personne";
  const schema = file("schema.sql");
  ok("schema.sql contient le bloc « limitation des requêtes » (installation neuve)", schema.includes(marker));
  const old = new PGlite();
  await old.exec(`create role authenticated nologin; create role anon nologin; create schema auth; create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated, anon; grant usage on schema public to authenticated, anon;`);
  await old.exec(schema.slice(0, schema.indexOf(marker)));
  const before = await old.query<{ n: number }>("select count(*)::int n from pg_proc where proname = 'rate_limit'");
  ok("base ancienne simulée : pas encore de rate_limit", before.rows[0].n === 0);
  const { MIGRATION_SQL } = await import("@/lib/migration-sql");
  ok("le script du panneau Administration (lib/migration-sql.ts) est identique à supabase/upgrade.sql et à scripts/upgrade.sql", MIGRATION_SQL === file("upgrade.sql") && MIGRATION_SQL === readFileSync("scripts/upgrade.sql", "utf8"));
  const up = await old.exec(MIGRATION_SQL).then(() => "", (e: Error) => e.message);
  ok("le script de mise à jour s'applique sans erreur sur la base ancienne", up === "", up);
  const after = await old.query<{ n: number; rls: boolean }>("select (select count(*)::int from pg_proc where proname = 'rate_limit') n, (select relrowsecurity from pg_class where relname = 'rate_hits') rls");
  ok("après mise à jour : rate_limit existe et rate_hits a la sécurité par ligne", after.rows[0].n === 1 && after.rows[0].rls === true);
  const again = await old.exec(MIGRATION_SQL).then(() => "", (e: Error) => e.message);
  ok("le script se relance sans erreur (« sans risque, plusieurs fois »)", again === "", again);
  await old.close();
}

const tables = (await db.query<{ t: string; rls: boolean }>(`select c.relname t, c.relrowsecurity rls from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' order by 1`)).rows;
ok(`${tables.length} tables trouvées`, tables.length >= 12, tables.map((t) => t.t).join(", "));

// ---------- Texte des politiques ----------
ok("RLS activée sur toutes les tables", tables.every((t) => t.rls), tables.filter((t) => !t.rls).map((t) => t.t).join(", "));
const policies = (await db.query<{ t: string; q: string | null; w: string | null }>(`select tablename t, qual q, with_check w from pg_policies where schemaname = 'public'`)).rows;
ok("aucune politique ouverte à tout le monde (using true)", !policies.some((p) => /^\(?true\)?$/i.test((p.q ?? "").trim()) || /^\(?true\)?$/i.test((p.w ?? "").trim())));
ok("chaque politique est liée à la personne connectée (auth.uid())", policies.every((p) => /auth\.uid\(\)/.test(`${p.q} ${p.w}`)));
const without = tables.filter((t) => !policies.some((p) => p.t === t.t)).map((t) => t.t);
ok("seules les tables prévues n'ont aucune politique", JSON.stringify(without) === JSON.stringify(NO_POLICY), without.join(", "));

// ---------- Une ligne par personne et par table (insérée « en administrateur », sans contrôle de clés) ----------
const cols = (await db.query<{ t: string; c: string; d: string; nullable: string; df: string | null }>(`select table_name t, column_name c, data_type d, is_nullable nullable, column_default df from information_schema.columns where table_schema = 'public' order by table_name, ordinal_position`)).rows;
const filler: Record<string, string> = { text: "'x'", "character varying": "'x'", integer: "0", bigint: "0", smallint: "0", numeric: "0", real: "0", "double precision": "0", boolean: "false", jsonb: "'{}'", json: "'{}'", uuid: "gen_random_uuid()", date: "current_date", "timestamp with time zone": "now()", "timestamp without time zone": "now()", ARRAY: "'{}'" };
/** Valeurs imposées par des contraintes `check` quand « x » ne convient pas. */
const OVERRIDE: Record<string, Record<string, string>> = {};
function insertFor(t: string, uid: string) {
  const own = cols.filter((c) => c.t === t);
  const need = own.filter((c) => c.c === "user_id" || (c.nullable === "NO" && c.df === null));
  const names = need.map((c) => c.c);
  const values = need.map((c) => (c.c === "user_id" ? `'${uid}'` : OVERRIDE[t]?.[c.c] ?? filler[c.d] ?? "null"));
  return `insert into ${t} (${names.join(", ")}) values (${values.join(", ")})`;
}
await db.exec("set session_replication_role = replica");
const seedErrors: string[] = [];
for (const { t } of tables) for (const uid of [A, B]) { const e = await tryExec(insertFor(t, uid)); if (e) seedErrors.push(`${t}: ${e}`); }
await db.exec("set session_replication_role = origin");
ok("une ligne de test par personne et par table", seedErrors.length === 0, seedErrors.join(" | "));

const as = async (role: "authenticated" | "anon", uid: string | null) => {
  await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub', '${uid ?? ""}', false)`);
};
const back = () => db.exec("reset role");

// ---------- Se mettre à la place de A : ne voir, changer, effacer que ses lignes ----------
for (const { t } of tables) {
  const mine = NO_POLICY.includes(t) ? 0 : 1;
  await as("authenticated", A);
  const sees = await count(`select count(*) n from ${t}`);
  const seesB = await count(`select count(*) n from ${t} where user_id = '${B}'`);
  const updated = await count(`with u as (update ${t} set user_id = user_id where user_id = '${B}' returning 1) select count(*) n from u`);
  const deleted = await count(`with d as (delete from ${t} where user_id = '${B}' returning 1) select count(*) n from d`);
  const hijack = await tryExec(insertFor(t, B));
  await back();
  ok(`${t} : A ne voit que ses lignes (${mine} attendue)`, sees === mine && seesB === 0, `voit ${sees}, dont ${seesB} de B`);
  ok(`${t} : A ne peut ni modifier, ni effacer, ni créer des lignes au nom de B`, updated === 0 && deleted === 0 && /row-level security/i.test(hijack), `modifiées ${updated}, effacées ${deleted}, insertion: ${hijack.slice(0, 80) || "acceptée !"}`);
  ok(`${t} : les lignes de B sont toujours là`, (await count(`select count(*) n from ${t} where user_id = '${B}'`)) === 1);
  await as("anon", null);
  const anon = await count(`select count(*) n from ${t}`).catch(() => 0);
  await back();
  ok(`${t} : un visiteur sans compte ne voit rien`, anon === 0, `voit ${anon}`);
}

// ---------- Limitation des requêtes : rate_limit() ----------
const rl = async (uid: string | null, bucket: string, max: number, win: number) => {
  await as("authenticated", uid);
  try { return (await db.query<{ r: boolean }>(`select rate_limit('${bucket}', ${max}, ${win}) r`)).rows[0].r; } finally { await back(); }
};
const results: boolean[] = [];
for (let i = 0; i < 8; i++) results.push(await rl(A, "password", 6, 600));
ok("rate_limit : 6 demandes passent, la 7e et la 8e sont refusées", JSON.stringify(results) === JSON.stringify([true, true, true, true, true, true, false, false]), results.join(","));
ok("rate_limit : un autre seau n'est pas touché", await rl(A, "export", 6, 600));
ok("rate_limit : une autre personne a son propre compteur", await rl(B, "password", 6, 600));
await db.exec(`update rate_hits set window_start = now() - interval '11 minutes' where user_id = '${A}' and bucket = 'password'`);
ok("rate_limit : la fenêtre écoulée remet le compteur à zéro", await rl(A, "password", 6, 600));
ok("rate_limit : une fenêtre non écoulée garde le compteur", (await count(`select n from rate_hits where user_id = '${A}' and bucket = 'password'`)) === 1 && (await rl(A, "password", 1, 600)) === false);
const bad = async (sqlCall: string, role: "authenticated" | "anon" = "authenticated", uid: string | null = A) => { await as(role, uid); const e = await tryExec(`select ${sqlCall}`); await back(); return e; };
ok("rate_limit : paramètres invalides refusés", (await bad("rate_limit('x', 0, 10)")) !== "" && (await bad("rate_limit('x', 5, 0)")) !== "" && (await bad("rate_limit('x', 5, 999999)")) !== "" && (await bad(`rate_limit('${"y".repeat(41)}', 5, 10)`)) !== "");
ok("rate_limit : refusée sans compte connecté", (await bad("rate_limit('x', 5, 10)", "authenticated", null)) !== "" && (await bad("rate_limit('x', 5, 10)", "anon", null)) !== "");

// ---------- Budget d'IA : spend_ai() ----------
const spend = async (uid: string, cost: number, cap: number) => { await as("authenticated", uid); try { return (await db.query<{ r: number }>(`select spend_ai(${cost}, ${cap}) r`)).rows[0].r; } finally { await back(); } };
ok("spend_ai : 2 puis 2 actions sur un plafond de 5 passent, la 3e est refusée (-1)", (await spend(A, 2, 5)) === 2 && (await spend(A, 2, 5)) === 4 && (await spend(A, 2, 5)) === -1);
ok("spend_ai : chaque personne a son budget", (await spend(B, 2, 5)) === 2);
await as("authenticated", A);
const tamper = await count(`with u as (update ai_usage set n = 0 where user_id = '${A}' returning 1) select count(*) n from u`);
await back();
ok("spend_ai : la personne ne peut pas remettre son compteur à zéro", tamper === 0);
done();
