// Recherche (11 novembre, Juliana) : « gestionnaire de base de données » ne trouvait aucune offre, même sur 1 mois ; et « Publiées depuis » ne se décochait pas.
// Testé sans réseau : requêtes envoyées aux sources (mots utiles, intitulés voisins, deux temps), pluriels, période décochée.
// Limite : aucune vraie réponse d'Adzuna ni de Jooble n'est lue ici ; le comportement réel des sources reste une hypothèse (voir lib/sources/query.ts).
import { readFileSync } from "node:fs";
import { ok, done } from "./helpers";
import { roleAffinity, titleMatchesRoles, titleTokens } from "../lib/fit";
import { coreQuery, synonymsOf, planQueries, runPhased, FEW, MAX_VARIANTS } from "../lib/sources/query";
import { sanitizeCriteria } from "../lib/sources/criteria";
import { sinceDays, ANY_DATE } from "../lib/sources/types";
import { sanitizeSaved, dayWindow, dayLabel, toSearchCriteria } from "../lib/day";
import { explainSearch, explainDay } from "../lib/search-why";
import { planStore } from "../lib/search-store";
import type { Profile, SavedCriteria } from "../lib/types";

const env = process.env as Record<string, string | undefined>;
type Call = { url: string; body: string };
let calls: Call[] = [];
/** Réponse simulée : `count` offres par requête, dont l'identifiant dépend de la requête (jamais de doublon entre requêtes). */
let perCall = 0;
(globalThis as unknown as { fetch: unknown }).fetch = async (url: string, init?: { body?: string }) => {
  calls.push({ url: String(url), body: String(init?.body ?? "") });
  const n = calls.length;
  const adz = String(url).includes("adz.test");
  const list = Array.from({ length: perCall }, (_, i) => adz
    ? { id: `a${n}-${i}`, title: `Administrateur bases de données ${n}-${i}`, description: "x", created: new Date().toISOString(), redirect_url: `https://adz.test/j/${n}-${i}`, company: { display_name: "Acme" }, location: { display_name: "Paris" } }
    : { id: `j${n}-${i}`, title: `DBA ${n}-${i}`, snippet: "x", updated: new Date().toISOString(), link: `https://jooble.test/j/${n}-${i}`, company: "Acme", location: "Paris" });
  const body = adz ? { results: list } : { jobs: list };
  return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
};
env.ADZUNA_APP_ID = "id-test"; env.ADZUNA_APP_KEY = "key-test"; env.JOOBLE_API_KEY = "jb-test";
env.ADZUNA_API_BASE = "http://adz.test"; env.JOOBLE_API_BASE = "http://jooble.test";
const { searchAll, filterOffersWithReport } = await import("../lib/sources");
type Criteria = Parameters<typeof searchAll>[0];
const crit = (over: Partial<Criteria> = {}): Criteria => ({ keywords: "gestionnaire de base de données", departments: [], contracts: [], experience: "", publishedWithin: "31", ...over });
const whats = (host: string) => calls.filter((c) => c.url.includes(host)).map((c) => (host === "adz.test" ? new URL(c.url).searchParams.get("what") : (JSON.parse(c.body) as { keywords: string }).keywords));

// ---------- Les mots qui disent le métier ----------
ok("« gestionnaire de base de données » → « base données » (sans « gestionnaire », « de »)", coreQuery("gestionnaire de base de données") === "base données", String(coreQuery("gestionnaire de base de données")));
ok("« Data Analyst » : rien à retirer, pas de variante inutile", coreQuery("Data Analyst") === null && coreQuery("Data Analyst H/F") === null);
ok("« consultant SI » : jamais « si » seul (c'est le mot français « si », dans toutes les annonces)", coreQuery("consultant SI") === null);
ok("« analyste de données » : seul « de » retiré, donc pas de variante", coreQuery("analyste de données") === null);
ok("« chargé d'études statistiques » → « études statistiques »", coreQuery("chargé d'études statistiques") === "études statistiques", String(coreQuery("chargé d'études statistiques")));
ok("un seul mot utile : pas de requête réduite à un mot trop large", coreQuery("responsable données") === null && coreQuery("chef de projet") === null);

// ---------- Intitulés voisins ----------
const dba = synonymsOf("gestionnaire de base de données");
ok("un gestionnaire de base de données est aussi un administrateur de bases de données / DBA", dba.includes("administrateur base de données") && dba.includes("DBA"), dba.join("|"));
ok("« DBA » et « administrateur de bases de données » trouvent la même famille", synonymsOf("DBA").length > 0 && synonymsOf("Administrateur de bases de données H/F").length > 0);
ok("data analyst, SI, BI, data engineer ont leurs voisins", synonymsOf("Data Analyst").includes("analyste de données") && synonymsOf("consultant SI").includes("consultant système d'information") && synonymsOf("consultant BI").includes("business intelligence") && synonymsOf("data engineer").includes("ingénieur data"));
ok("un poste sans voisin connu n'en reçoit pas", synonymsOf("Comptable fournisseurs").length === 0 && synonymsOf("Infirmière").length === 0);

// ---------- Plan : les mots saisis d'abord, variantes ensuite, sans doublon, bornées ----------
{
  const p = planQueries(["gestionnaire de base de données"]);
  ok("les mots saisis restent la requête de base, intacte", p.base.join("|") === "gestionnaire de base de données");
  ok("les variantes viennent après : mots utiles puis intitulés voisins", p.more[0] === "base données" && p.more.includes("DBA") && p.more.length <= MAX_VARIANTS, p.more.join("|"));
  const q = planQueries(["Data Analyst", "analyste data", "consultant BI", "gestionnaire de base de données", "data engineer"]);
  ok("jamais plus de variantes que le plafond, jamais une variante déjà saisie", q.more.length <= MAX_VARIANTS && !q.more.some((m) => ["data analyst", "analyste data", "consultant bi"].includes(m.toLowerCase())), q.more.join("|"));
  ok("les variantes sont réparties entre les postes (pas toutes pour le premier)", new Set(q.more.map((m) => m.toLowerCase())).size === q.more.length && q.more.length === MAX_VARIANTS);
  ok("sans poste, une requête vide (toute la France) et aucune variante", planQueries([]).base.join("|") === "" && planQueries([]).more.length === 0);
}

// ---------- Deux temps ----------
type Job = { role: string };
const settledOf = (...counts: (number | "fail")[]): PromiseSettledResult<number[]>[] => counts.map((c) => (c === "fail" ? { status: "rejected", reason: new Error("x") } : { status: "fulfilled", value: Array(c).fill(1) }));
{
  const sent: string[][] = [];
  const mk = (first: (number | "fail")[], max: number, tried?: string[]) => runPhased<Job, number>({
    roles: ["gestionnaire de base de données"], max, tried,
    jobsFor: (qs) => qs.map((role) => ({ role })),
    run: async (jobs) => { sent.push(jobs.map((j) => j.role)); return sent.length === 1 ? settledOf(...first) : settledOf(...jobs.map(() => 3 as const)); },
  });
  const tried: string[] = [];
  const r = await mk([3], 12, tried);
  ok("peu d'offres : les variantes partent, et sont notées", sent.length === 2 && sent[1][0] === "base données" && r.length === 1 + sent[1].length && tried.includes("DBA"), JSON.stringify(sent));
  sent.length = 0;
  await mk([FEW], 12);
  ok(`${FEW} offres ou plus : aucune variante (quota des sources préservé)`, sent.length === 1);
  sent.length = 0;
  await mk(["fail"], 12);
  ok("tout a échoué (clé refusée…) : on n'insiste pas avec d'autres requêtes", sent.length === 1);
  sent.length = 0;
  await mk([2], 1);
  ok("plus de budget : pas de variante, la limite de requêtes est respectée", sent.length === 1);
  sent.length = 0;
  await mk([2], 3);
  ok("le budget borne aussi les variantes (3 requêtes en tout)", sent.length === 2 && sent[0].length + sent[1].length === 3, JSON.stringify(sent));
}

// ---------- Adzuna et Jooble : ce qui est réellement envoyé ----------
{
  calls = []; perCall = 2;
  const r = await searchAll(crit());
  const az = whats("adz.test"), jb = whats("jooble.test");
  ok("peu d'offres : Adzuna reçoit les mots saisis puis les variantes", az[0] === "gestionnaire de base de données" && az.includes("base données") && az.includes("administrateur base de données"), az.join("|"));
  ok("Jooble aussi", jb[0] === "gestionnaire de base de données" && jb.includes("base données") && jb.includes("DBA"), jb.join("|"));
  ok("searchAll rend les variantes cherchées (pour le dire à la personne)", r.variants.includes("base données") && r.variants.includes("DBA") && !r.variants.includes("gestionnaire de base de données"), r.variants.join("|"));
  ok("les offres des variantes sont bien dans le résultat", r.offers.length > 4, String(r.offers.length));
}
{
  calls = []; perCall = FEW; // les mots saisis suffisent
  const r = await searchAll(crit());
  ok(`${FEW} offres par requête : une seule requête par source, aucune variante`, whats("adz.test").length === 1 && whats("jooble.test").length === 1 && r.variants.length === 0, `${whats("adz.test").length}/${whats("jooble.test").length}`);
}
{
  calls = []; perCall = 0;
  await searchAll(crit({ departments: ["75", "93"] }), { maxRequests: 5 });
  ok("maxRequests borne le total (mots saisis + variantes) par source", whats("adz.test").length <= 5 && whats("jooble.test").length <= 5, `${whats("adz.test").length}/${whats("jooble.test").length}`);
}

// ---------- Pluriels : « bases » = « base » ----------
ok("« Administrateur de bases de données » dit « gestionnaire de base de données »", roleAffinity("Administrateur de bases de données H/F", ["gestionnaire de base de données"]) === 1 && titleMatchesRoles("Administrateur de bases de données", ["gestionnaire de base de données"]));
ok("« base de données » ne devient pas « SI » ni autre chose", titleTokens("Base de données").join() === "base,data" && titleTokens("Systèmes et réseaux").join() === "systeme,reseau");
ok("pas de faux rapprochement : une comptable n'est pas un gestionnaire de bases de données", roleAffinity("Gestionnaire comptable", ["gestionnaire de base de données"]) === 0);

// ---------- Offre rangée : le titre dit le poste demandé malgré « bases » au pluriel ----------
{
  const profile = {
    identity: { name: "J. N.", email: "j@example.org", links: [] }, targets: [{ id: "t1", title: "Data Analyst", pitch: "" }],
    experiences: [], education: [], projects: [], skills: { Langages: ["Python"] }, certifications: [], languages: [], interests: [],
    preferences: { contracts: [] }, rules: [], todo: [],
  } as unknown as Profile;
  const o = { key: "az:1", source: "Adzuna", id: "1", title: "Administrateur de bases de données H/F", company: "Acme", location: "Paris", contract: "CDI", salary: "", experience: "", years: null, date: "", url: "https://adz.test/1", description: "Administration de serveurs." };
  const plan = planStore({ userId: "u", profile, learning: null, offers: [o], keywords: "gestionnaire de base de données", contracts: [], criteriaRoles: [], withPosted: false });
  ok("planStore garde un « Administrateur de bases de données » quand « gestionnaire de base de données » est cherché", plan.rows.length === 1 && plan.rows[0].status === "new", JSON.stringify({ rows: plan.rows.length, low: plan.low, far: plan.far }));
}

// ---------- Période décochée ----------
ok("sinceDays : « 0 » = aucune limite, une valeur absente ou illisible = 14 jours comme avant", sinceDays(ANY_DATE) === null && sinceDays("7") === 7 && sinceDays("31") === 31 && sinceDays(undefined) === 14 && sinceDays("") === 14 && sinceDays("abc") === 14);
ok("sanitizeCriteria et sanitizeSaved gardent « 0 »", sanitizeCriteria({ publishedWithin: "0", keywords: "x" }).publishedWithin === "0" && sanitizeSaved({ roles: ["x"], publishedWithin: "0" }).publishedWithin === "0");
ok("une valeur inconnue retombe toujours sur 14", sanitizeCriteria({ publishedWithin: "99" }).publishedWithin === "14" && sanitizeSaved({ roles: ["x"], publishedWithin: "99" }).publishedWithin === "14");
{
  calls = []; perCall = 1;
  await searchAll(crit({ publishedWithin: "0", keywords: "data analyst" }));
  const az = calls.find((c) => c.url.includes("adz.test"))!, jb = calls.find((c) => c.url.includes("jooble.test"))!;
  ok("Adzuna : sans période, aucun `max_days_old` n'est envoyé", !new URL(az.url).searchParams.has("max_days_old"), az.url.replace(/app_(id|key)=[^&]*&?/g, ""));
  ok("Jooble : sans période, aucune date de départ n'est envoyée", !("datecreatedfrom" in (JSON.parse(jb.body) as object)), jb.body);
  calls = [];
  await searchAll(crit({ publishedWithin: "7", keywords: "data analyst" }));
  const az7 = calls.find((c) => c.url.includes("adz.test"))!, jb7 = calls.find((c) => c.url.includes("jooble.test"))!;
  ok("avec une période, tout est envoyé comme avant", new URL(az7.url).searchParams.get("max_days_old") === "7" && /^\d{4}-\d{2}-\d{2}$/.test((JSON.parse(jb7.body) as { datecreatedfrom: string }).datecreatedfrom));
}
{
  const old = { key: "az:9", source: "Adzuna", id: "9", title: "Data Analyst", company: "Acme", location: "Paris", contract: "CDI", salary: "", experience: "", years: null, date: new Date(Date.now() - 200 * 864e5).toISOString(), url: "https://adz.test/9", description: "x" };
  ok("filtres communs : sans période, une offre de 200 jours n'est pas « trop ancienne »", filterOffersWithReport([old], crit({ publishedWithin: "0" })).kept.length === 1 && filterOffersWithReport([old], crit({ publishedWithin: "31" })).dropped.old === 1);
}
ok("liste du jour : période décochée = 1 mois (au-delà, Recommandées range les offres en Masquées)", dayWindow("0") === 31 && dayWindow("7") === 7 && dayWindow(undefined) === 14);
{
  const saved: SavedCriteria = { roles: ["x"], zone: null, contracts: [], publishedWithin: "0", saved_at: "" };
  ok("la recherche enregistrée (et celle du matin) reçoit 31 jours, jamais « 0 » : un « 0 » serait lu comme 'aucune offre assez récente'", toSearchCriteria(saved).publishedWithin === "31");
}
ok("message de la liste du jour : dit qu'elle ne remonte pas plus loin que 1 mois", dayLabel("0").includes("dernier mois") && dayLabel("1") === "sur les dernières 24 h" && dayLabel("14") === "sur les 14 derniers jours");
{
  const d = explainDay({ sourcesOn: true, web: { searched: true }, period: "0", read: 0, dropped: { exclude: 0, remote: 0, years: 0, contract: 0, old: 0 }, stats: { read: 0, far: 0, low: 0, asked: 0, senior: 0, known: 0, fresh: 0 }, variants: ["base données", "DBA"] });
  ok("liste du jour sans période : ne conseille pas d'« élargir la période » et cite les variantes cherchées", !d.includes("Élargis la période") && d.includes("« base données », « DBA »"), d);
  const w = explainSearch({ sources: [{ label: "Adzuna", ok: true, count: 3 }], read: 3, dropped: { exclude: 0, remote: 0, years: 0, contract: 0, old: 0 }, far: 0, shown: 3, criteria: { contracts: [] }, zone: "", pages: 1, variants: ["DBA"] });
  ok("encadré « Pourquoi si peu d'offres ? » : cite les variantes", w.some((l) => l.includes("j'ai aussi cherché « DBA »")), w.join(" / "));
}

// ---------- Écran : la période se décoche, les autres sites n'ont plus de limite ----------
{
  const page = readFileSync("app/recherche/page.tsx", "utf8");
  const periode = page.slice(page.indexOf('legend className="heading">Publiées depuis'), page.indexOf("</fieldset>", page.indexOf('legend className="heading">Publiées depuis')));
  ok("la période n'est plus verrouillée (pas de keepOne) et se décoche vers « 0 »", !periode.includes("keepOne") && periode.includes('"0"'));
  ok("la page transmet les variantes à l'encadré", page.includes("variants,") && page.includes("setVariants"));
  const boards = readFileSync("components/other-boards.tsx", "utf8");
  ok("autres sites : Indeed et LinkedIn n'ajoutent pas de limite de date quand la période est décochée", boards.includes('days === "0" ? ""') && boards.includes('${d ? `&fromage=${d}` : ""}') && boards.includes('${d ? `&f_TPR='));
}

done();
