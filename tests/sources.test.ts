// Sources d'offres (Adzuna, Jooble) : fusion, doublons entre sources, une source en panne n'arrête pas les autres, test de l'administration.
// Fetch scripté, aucun vrai site.
import { readFileSync } from "node:fs";
import { ok, done } from "./helpers";

const env = process.env as Record<string, string | undefined>;
type Reply = { status: number; body?: unknown };
const q: Record<"adz" | "jb", Reply[]> = { adz: [], jb: [] };
const urls: string[] = [];
const which = (url: string) => (url.includes("adz.test") ? "adz" : "jb");
(globalThis as unknown as { fetch: unknown }).fetch = async (url: string) => {
  urls.push(url);
  const next = q[which(url)].shift();
  if (!next) throw new Error("plus de réponse scriptée pour " + which(url));
  const body = next.body ?? {};
  return { ok: next.status < 300, status: next.status, json: async () => body, text: async () => JSON.stringify(body) };
};
const reset = () => { q.adz = []; q.jb = []; urls.length = 0; };

const SECRET_ID = "adz-secret-id-123";
const SECRET_KEY = "adz-secret-key-456";
const SECRET_JB = "jooble-secret-key-789";
env.ADZUNA_API_BASE = "http://adz.test"; env.JOOBLE_API_BASE = "http://jooble.test";
const unplug = () => { delete env.ADZUNA_APP_ID; delete env.ADZUNA_APP_KEY; delete env.JOOBLE_API_KEY; };
const plugAdzuna = () => { env.ADZUNA_APP_ID = SECRET_ID; env.ADZUNA_APP_KEY = SECRET_KEY; };
const plugJooble = () => { env.JOOBLE_API_KEY = SECRET_JB; };

const { searchAll, activeSources, hasSource, probeSources, filterOffers, SOURCES } = await import("../lib/sources");
type Criteria = Parameters<typeof searchAll>[0];
const crit: Criteria = { keywords: "data analyst", departments: ["75"], contracts: ["CDI"], experience: "", publishedWithin: "14" };
const today = new Date().toISOString();
const daysAgo = (n: number) => new Date(Date.now() - n * 864e5).toISOString();

const az = (id: number, title: string, company: string, extra: Record<string, unknown> = {}) =>
  ({ id: String(id), title, description: `<b>${title}</b> chez ${company}`, created: today, redirect_url: `https://adz.test/job/${id}`, company: { display_name: company }, location: { display_name: "Paris" }, contract_type: "permanent", ...extra });
const jb = (id: number, title: string, company: string, extra: Record<string, unknown> = {}) =>
  ({ id, title, snippet: `<p>${title}</p> &amp; plus`, updated: today, link: `https://jooble.test/desc/${id}`, company, location: "Paris", type: "CDI", ...extra });
const adz = (...results: unknown[]) => ({ status: 200, body: { results } });
const joo = (...jobs: unknown[]) => ({ status: 200, body: { jobs } });
const attempt = async <T,>(p: Promise<T>) => p.then((v) => ({ v }), (e: { status?: number; message?: string }) => ({ e }));

// ---------- Aucune source ----------
unplug();
ok("aucune clé : aucune source active", activeSources().length === 0 && !hasSource());
{
  const r = await attempt(searchAll(crit));
  ok("aucune source : erreur 501 claire", "e" in r && r.e.status === 501 && /Aucune source/.test(r.e.message ?? ""));
  const probe = await probeSources();
  ok("le test des sources liste les sources non branchées sans rien appeler", probe.length === SOURCES.length && probe.every((s) => !s.configured && !s.ok) && urls.length === 0);
}

// ---------- Une seule source ----------
reset(); unplug(); plugAdzuna();
{
  q.adz.push(adz(az(1, "Data Analyst", "Acme"), az(2, "Analyste BI", "Beta")));
  const r = await searchAll(crit);
  ok("Adzuna seule : active, offres au format commun", activeSources().map((s) => s.id).join() === "adzuna" && r.offers.length === 2 && r.offers.every((o) => o.key.startsWith("az:") && o.source === "Adzuna"));
  ok("rapport : une source, réussie, avec le nombre d'offres", r.sources.length === 1 && r.sources[0].ok && r.sources[0].count === 2);
  ok("les balises HTML des extraits sont retirées", r.offers.every((o) => !/[<>]/.test(o.description)) && r.offers.some((o) => o.description === "Data Analyst chez Acme"));
  ok("la requête part vers l'adresse prévue", urls.length === 1 && urls[0].startsWith("http://adz.test/v1/api/jobs/fr/search/1?"));
}

// ---------- Deux sources : doublons entre sources ----------
reset(); plugAdzuna(); plugJooble();
{
  q.adz.push(adz(az(1, "Data Analyst", "Acme"), az(2, "Analyste BI", "Beta")));
  q.jb.push(joo(jb(10, "Data  Analyst", "ACME"), jb(11, "Data Engineer", "Gamma"), jb(12, "Sans lien", "Delta", { link: "" })));
  const r = await searchAll(crit);
  const keys = r.offers.map((o) => o.key).sort();
  ok("la même offre vue par deux sources n'apparaît qu'une fois (titre + entreprise, accents et casse ignorés)", keys.join() === "az:1,az:2,jb:11", keys.join());
  ok("une annonce sans lien est écartée", !keys.includes("jb:12"));
  ok("les deux sources sont rapportées", r.sources.length === 2 && r.sources.every((s) => s.ok));
  ok("offres triées de la plus récente à la plus ancienne", r.offers.every((o, i, a) => i === 0 || a[i - 1].date >= o.date));
}
reset();
{
  // Entreprise inconnue chez une source : on compare le lieu
  q.adz.push(adz(az(5, "Data Analyst", "", { location: { display_name: "Lyon" } })));
  q.jb.push(joo(jb(50, "Data Analyst", "", { location: "Lyon" }), jb(51, "Data Analyst", "", { location: "Lille" })));
  const r = await searchAll(crit);
  ok("entreprise non communiquée : même titre dans la même ville = doublon, autre ville = autre offre", r.offers.map((o) => o.key).sort().join() === "az:5,jb:51");
}

// ---------- Une source en panne n'empêche pas l'autre ----------
for (const [label, fail, expect] of [
  ["clé refusée (401)", { status: 401 }, /clé refusée/],
  ["quota atteint (429)", { status: 429 }, /quota/],
  ["erreur du site (500)", { status: 500 }, /refusée \(500\)/],
] as [string, Reply, RegExp][]) {
  reset();
  q.adz.push(fail); // un poste, une zone, un contrat : une seule requête
  q.jb.push(joo(jb(20, "Data Analyst", "Zeta")));
  const r = await attempt(searchAll(crit));
  if ("v" in r) {
    const adzuna = r.v.sources.find((s) => s.id === "adzuna")!;
    ok(`Adzuna en panne (${label}) : Jooble répond quand même`, r.v.offers.map((o) => o.key).join() === "jb:20" && !adzuna.ok && expect.test(adzuna.error ?? "") && r.v.sources.find((s) => s.id === "jooble")!.ok);
    ok(`Adzuna en panne (${label}) : ni identifiant ni clé dans le message`, ![SECRET_ID, SECRET_KEY, SECRET_JB].some((s) => (adzuna.error ?? "").includes(s)));
  } else ok(`Adzuna en panne (${label}) : la recherche ne doit pas échouer`, false, r.e.message);
}
reset();
{
  q.adz.push(adz(az(30, "Data Analyst", "Eta")));
  q.jb.push({ status: 403 });
  const r = await searchAll(crit);
  const j = r.sources.find((s) => s.id === "jooble")!;
  ok("Jooble en panne : Adzuna répond quand même, message sans la clé (qui est dans l'adresse)", r.offers.length === 1 && !j.ok && /clé refusée/.test(j.error ?? "") && !(j.error ?? "").includes(SECRET_JB));
}

// ---------- Tout en panne ----------
reset();
{
  q.adz.push({ status: 500 }); q.jb.push({ status: 429 });
  const r = await attempt(searchAll(crit));
  ok("toutes les sources en panne : erreur 502 qui reprend chaque message", "e" in r && r.e.status === 502 && /Adzuna/.test(r.e.message ?? "") && /Jooble/.test(r.e.message ?? ""));
  ok("l'erreur ne contient aucune clé", "e" in r && ![SECRET_ID, SECRET_KEY, SECRET_JB].some((s) => (r.e.message ?? "").includes(s)));
}

// ---------- Filtres communs ----------
{
  const base = { key: "az:1", source: "Adzuna", id: "1", title: "Data Analyst", company: "Acme", location: "Paris", contract: "CDI", salary: "", experience: "", years: null, date: today, url: "https://x.test", description: "Analyse de données" };
  const list = [
    base,
    { ...base, key: "az:2", title: "Data Analyst senior", description: "Expérience de 8 ans minimum" },
    { ...base, key: "az:3", date: daysAgo(40) },
    { ...base, key: "az:4", description: "Poste en télétravail partiel" },
    { ...base, key: "az:5", title: "Data Analyst junior", description: "Poste en stage de fin d'études", contract: "Stage" },
  ];
  const keys = (c: Partial<Criteria>) => filterOffers(list, { ...crit, ...c }).map((o) => o.key).join();
  ok("filtre : offre trop ancienne écartée", !keys({}).includes("az:3"));
  ok("filtre : années demandées au-delà du plafond écartées", keys({ maxYears: 3 }) === "az:1,az:4", keys({ maxYears: 3 }));
  ok("filtre : télétravail seulement", keys({ remoteOnly: true }) === "az:4", keys({ remoteOnly: true }));
  ok("filtre : mots exclus", !keys({ exclude: "senior, télétravail" }).includes("az:2") && !keys({ exclude: "senior, télétravail" }).includes("az:4"));
  ok("filtre : un stage n'apparaît que s'il est demandé", !keys({}).includes("az:5") && keys({ contracts: ["STG"] }).includes("az:5"));
}

// ---------- Test de l'administration ----------
reset(); plugAdzuna(); plugJooble();
{
  q.adz.push(adz(az(60, "Data Analyst", "Theta")));
  q.jb.push({ status: 401 });
  const probe = await probeSources();
  const a = probe.find((s) => s.id === "adzuna")!, j = probe.find((s) => s.id === "jooble")!;
  ok("test des sources : Adzuna répond, Jooble refusée, sans rien casser", a.configured && a.ok && a.count === 1 && j.configured && !j.ok && /clé refusée/.test(j.error ?? ""));
  ok("test des sources : exactement une requête par source", urls.length === 2 && urls.filter((u) => u.includes("adz.test")).length === 1 && urls.filter((u) => u.includes("jooble.test")).length === 1, urls.length + "");
  ok("test des sources : aucune clé dans le résultat", !JSON.stringify(probe).includes(SECRET_KEY) && !JSON.stringify(probe).includes(SECRET_JB) && !JSON.stringify(probe).includes(SECRET_ID));
}
reset(); unplug(); plugAdzuna();
{
  q.adz.push(adz());
  const probe = await probeSources();
  ok("test des sources : une source branchée et l'autre non", probe.find((s) => s.id === "adzuna")!.ok && !probe.find((s) => s.id === "jooble")!.configured && urls.length === 1);
}

// ---------- La route d'administration est bien gardée et limitée ----------
{
  const route = readFileSync("app/api/admin/sources/route.ts", "utf8");
  ok("la route de test exige l'administrateur, puis limite les appels, avant tout appel aux sources", route.indexOf("requireAdminApi()") > 0 && route.indexOf("requireAdminApi()") < route.indexOf('rateLimit(supabase, "testSources")') && route.indexOf('rateLimit(supabase, "testSources")') < route.indexOf("probeSources()"));
  ok("seul POST est exporté (jamais de test déclenché par un simple lien)", /export async function POST/.test(route) && !/export async function GET/.test(route));
  const page = readFileSync("app/admin/page.tsx", "utf8");
  ok("le bouton n'existe que dans l'administration", /<SourcesTest \/>/.test(page) && !readFileSync("app/recherche/page.tsx", "utf8").includes("SourcesTest"));
}
done();
