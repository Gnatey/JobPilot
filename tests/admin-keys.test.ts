/**
 * Administration › Clés : jamais une valeur secrète, seulement présente / absente (lib/admin-keys.ts). Aucun réseau.
 * Les valeurs ci-dessous sont des jetons de test qui ne ressemblent à aucune vraie clé.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { ok, done } from "./helpers";
import { KEYS, KEY_GROUPS, SHOWN, describeKeys, formProblem, keysSummary, rowsOfGroup } from "../lib/admin-keys";
import { ENV_VARS } from "../lib/env";

const SENTINEL = "SENTINELLE-NE-DOIT-JAMAIS-SORTIR";

// ---------- Aucune valeur secrète ne sort ----------
{
  const env: Record<string, string> = {};
  for (const k of KEYS) env[k.name] = `${SENTINEL}-${k.name}`;
  env.AI_DAILY_BUDGET = "30";
  const rows = describeKeys(env);
  const json = JSON.stringify(rows);
  const secrets = KEYS.filter((k) => !SHOWN.has(k.name));
  ok("aucune valeur d'un secret (clé, jeton, adresse de personne) n'apparaît dans le résultat", secrets.every((k) => !json.includes(`${SENTINEL}-${k.name}`)));
  ok("une variable secrète n'a pas de champ `value`", rows.filter((r) => !SHOWN.has(r.name)).every((r) => r.value === undefined));
  ok("seuls les réglages de `SHOWN` montrent leur valeur", rows.filter((r) => r.value !== undefined).every((r) => SHOWN.has(r.name)) && rows.find((r) => r.name === "AI_DAILY_BUDGET")?.value === "30");
  ok("`SHOWN` ne contient ni clé, ni secret, ni jeton, ni mot de passe, ni adresse e-mail", [...SHOWN].every((n) => !/KEY|SECRET|TOKEN|PASSWORD|EMAIL|SERVICE_ROLE/.test(n)));
  ok("`SHOWN` ne cite que des variables connues", [...SHOWN].every((n) => KEYS.some((k) => k.name === n)));
  ok("une valeur affichée est coupée (80 signes) et sur une ligne", (() => {
    const r = describeKeys({ AI_MAIN_CHAIN: `gemini,\n${"x".repeat(200)}` }).find((x) => x.name === "AI_MAIN_CHAIN");
    return !!r?.value && r.value.length <= 80 && !/\n/.test(r.value);
  })());
}

// ---------- Présente / absente ----------
{
  const rows = describeKeys({ GEMINI_API_KEY: "abc", GROQ_API_KEY: "   ", MISTRAL_API_KEY: "" });
  const by = (n: string) => rows.find((r) => r.name === n)!;
  ok("variable remplie = présente", by("GEMINI_API_KEY").state === "ok");
  ok("variable faite d'espaces = absente (comme Vercel qui l'a vidée)", by("GROQ_API_KEY").state === "missing");
  ok("variable vide ou jamais posée = absente", by("MISTRAL_API_KEY").state === "missing" && by("CRON_SECRET").state === "missing");
  ok("une ligne par variable connue, dans l'ordre du tableau", rows.length === KEYS.length && rows.map((r) => r.name).join() === KEYS.map((k) => k.name).join());
  ok("sans environnement, une variable absente n'a ni valeur ni défaut", rows.filter((r) => r.state === "missing").every((r) => r.value === undefined && r.problem === undefined));
}

// ---------- Défauts de forme, sans citer la valeur ----------
{
  ok("espace autour : signalé", formProblem(" abc") !== undefined && formProblem("abc\n") !== undefined);
  ok("guillemets autour : signalés", formProblem('"abc"') !== undefined && formProblem("'abc'") !== undefined);
  ok("valeur propre : rien à signaler", formProblem("abc.def-123") === undefined);
  const rows = describeKeys({ GROQ_API_KEY: `"${SENTINEL}"`, CRON_SECRET: ` ${SENTINEL}` });
  const g = rows.find((r) => r.name === "GROQ_API_KEY")!;
  const c = rows.find((r) => r.name === "CRON_SECRET")!;
  ok("des guillemets autour d'une clé sont signalés (clé présente mais refusée)", g.state === "ok" && !!g.problem);
  ok("un espace au début d'un secret est signalé", c.state === "ok" && !!c.problem);
  ok("le défaut de forme ne cite jamais la valeur", !JSON.stringify(rows).includes(SENTINEL));
}

// ---------- Plafond d'IA ----------
{
  const budget = (v: string) => describeKeys({ AI_DAILY_BUDGET: v }).find((r) => r.name === "AI_DAILY_BUDGET")!;
  ok("30 : correct", budget("30").problem === undefined && budget("30").state === "ok");
  ok("5 : correct (minimum)", budget("5").problem === undefined);
  ok("3 : relevé à 5 par le code, le dit", /5/.test(budget("3").problem ?? ""));
  ok("0 : aucun plafond, le dit", /aucun plafond/.test(budget("0").problem ?? ""));
  ok("« trente » : pas un nombre", /pas un nombre/.test(budget("trente").problem ?? ""));
  ok("sans plafond posé : ce n'est pas une anomalie", describeKeys({}).find((r) => r.name === "AI_DAILY_BUDGET")!.problem === undefined);
}

// ---------- Résumé et groupes ----------
{
  const none = keysSummary(describeKeys({}));
  ok("rien posé : les indispensables manquent", none.missingRequired === KEYS.filter((k) => k.required).length && none.problems === 0 && none.aiKeys === 0);
  const some = keysSummary(describeKeys({ NEXT_PUBLIC_SUPABASE_URL: "u", NEXT_PUBLIC_SUPABASE_ANON_KEY: "k", NEXT_PUBLIC_APP_URL: "https://x.example", GEMINI_API_KEY: "g", GROQ_API_KEY: '"g"' }));
  ok("indispensables posés : plus rien ne manque ; deux clés d'IA ; un défaut de forme", some.missingRequired === 0 && some.aiKeys === 2 && some.problems === 1);
  ok("chaque variable est dans un groupe connu, chaque groupe a des variables", KEYS.every((k) => KEY_GROUPS.includes(k.group)) && KEY_GROUPS.every((g) => rowsOfGroup(describeKeys({}), g).length > 0));
  ok("noms uniques", new Set(KEYS.map((k) => k.name)).size === KEYS.length);
}

// ---------- La liste suit le reste de l'application ----------
{
  ok("toutes les variables de la page publique /configuration sont aussi dans l'onglet Clés", ENV_VARS.every((v) => KEYS.some((k) => k.name === v.name)), ENV_VARS.filter((v) => !KEYS.some((k) => k.name === v.name)).map((v) => v.name).join(", "));
  // Toute variable lue par le code avec un nom fixe (process.env.X) doit être connue de l'onglet, ou être une variable de plateforme / de réglage fin
  const IGNORED = new Set(["NODE_ENV", "VERCEL_GIT_REPO_SLUG", "VERCEL_GIT_REPO_OWNER", "VERCEL_GIT_COMMIT_MESSAGE", "VERCEL_GIT_COMMIT_SHA", "AUTO_MIN_QUICK_SCORE", "AUTO_GENERATE_CV", "AUTO_DAILY_LIMIT",
    "GEMINI_MODEL", "GEMINI_FAST_MODEL", "GEMINI_API_BASE", "GROQ_MODEL", "GROQ_FAST_MODEL", "GROQ_API_BASE", "MISTRAL_MODEL", "MISTRAL_FAST_MODEL", "MISTRAL_API_BASE", "CLAUDE_MODEL", "CLAUDE_FAST_MODEL",
    "ADZUNA_API_BASE", "JOOBLE_API_BASE", "SEED_PROFILE_EMAIL"]);
  const files: string[] = [];
  const walk = (d: string) => { for (const f of readdirSync(d)) { const p = `${d}/${f}`; if (/node_modules|\.next/.test(p)) continue; if (statSync(p).isDirectory()) walk(p); else if (/\.(ts|tsx)$/.test(f)) files.push(p); } };
  ["app", "lib", "components"].forEach(walk);
  const used = new Set<string>();
  for (const f of files) for (const m of readFileSync(f, "utf8").matchAll(/process\.env\.([A-Z][A-Z0-9_]+)/g)) used.add(m[1]);
  const unknown = [...used].filter((n) => !IGNORED.has(n) && !KEYS.some((k) => k.name === n));
  ok("toute variable lue par le code est connue de l'onglet Clés (ou rangée parmi les réglages fins)", unknown.length === 0, unknown.join(", "));
}

done();
