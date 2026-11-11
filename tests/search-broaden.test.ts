// Recherche : « consultant SI » ne sortait presque rien (11 novembre, Juliana). Quatre corrections, testées sans réseau :
// (1) « Système d'information » se lit « SI » dans le filtre « éloigné de mes postes » ; (2) les offres écartées d'office sont comptées par cause ;
// (3) « Voir la suite » demande la page suivante de chaque source ; (4) l'encadré « Pourquoi si peu d'offres ? » dit ce qui s'est passé.
import { readFileSync } from "node:fs";
import { ok, done } from "./helpers";
import { titleTokens, titleMatchesRoles, fitCheck } from "../lib/fit";
import { explainSearch } from "../lib/search-why";
import { sanitizeCriteria } from "../lib/sources/criteria";
import type { Profile } from "../lib/types";

const env = process.env as Record<string, string | undefined>;
const calls: { url: string; body: string }[] = [];
(globalThis as unknown as { fetch: unknown }).fetch = async (url: string, init?: { body?: string }) => {
  calls.push({ url: String(url), body: String(init?.body ?? "") });
  const empty = String(url).includes("adz.test") ? { results: [] } : { jobs: [] };
  return { ok: true, status: 200, json: async () => empty, text: async () => JSON.stringify(empty) };
};
env.ADZUNA_APP_ID = "id-test"; env.ADZUNA_APP_KEY = "key-test"; env.JOOBLE_API_KEY = "jb-test";
env.ADZUNA_API_BASE = "http://adz.test"; env.JOOBLE_API_BASE = "http://jooble.test";

const { searchAll, filterOffersWithReport, filterOffers, MAX_PAGE } = await import("../lib/sources");
type Offer = Parameters<typeof filterOffers>[0][number];
type Criteria = Parameters<typeof searchAll>[0];

// ---------- (1) « SI » = « système d'information » ----------
const ROLES = ["Data Analyst", "consultant SI"];
ok("« consultant SI » : le seul mot du métier est « si »", titleTokens("consultant SI").join() === "consultant,si");
ok("« Consultant Système d'Information » n'est plus jugé éloigné de « consultant SI »", titleMatchesRoles("Consultant Système d'Information H/F", ROLES) && titleMatchesRoles("Consultant systèmes d'informations", ROLES) && titleMatchesRoles("Consultant Systeme d’Information", ROLES));
ok("le sigle écrit tel quel marche toujours", titleMatchesRoles("Consultant SI H/F", ROLES) && titleMatchesRoles("Chef de projet SI", ROLES));
ok("pas de faux rapprochement : « systèmes » seul, ERP, SAP, RH ne sont pas « SI »", !titleMatchesRoles("Ingénieur systèmes et réseaux", ROLES) && !titleMatchesRoles("Consultant SAP MM", ROLES) && !titleMatchesRoles("Consultant ERP", ROLES) && !titleMatchesRoles("Consultant en recrutement", ROLES));
ok("« Business Intelligence » et « BI » se rejoignent dans les deux sens", titleMatchesRoles("Consultant Business Intelligence", ["BI"]) && titleMatchesRoles("Analyste BI", ["Business Intelligence"]));
ok("« intelligence artificielle » et « IA » aussi", titleMatchesRoles("Ingénieur Intelligence Artificielle", ["IA"]) && titleMatchesRoles("Data scientist IA", ["intelligence artificielle"]));
ok("un mot qui contient ces lettres n'est pas touché (« business intelligently », « systemes d'informatique »)", titleTokens("Business intelligently").join() === "business,intelligently" && !titleTokens("Systèmes d'informatique").includes("si"));

const profile = {
  identity: { name: "J. N.", email: "j@example.org", links: [] },
  targets: [{ id: "t1", title: "Data Analyst", pitch: "" }, { id: "t2", title: "Business Intelligence", pitch: "" }],
  experiences: [], education: [], projects: [], skills: { Langages: ["Python", "SQL"] }, certifications: [], languages: [], interests: [],
  preferences: { contracts: [] }, rules: [], todo: [],
} as unknown as Profile;
ok("fitCheck : l'offre « Consultant Système d'Information » passe quand « consultant SI » est cherché, et reste éloignée sans cette recherche", fitCheck(profile, { title: "Consultant Système d'Information H/F", text: "Pilotage de projets" }, { roles: ["consultant SI"] }).ok && !fitCheck(profile, { title: "Consultant Système d'Information H/F", text: "Pilotage de projets" }).ok);

// ---------- (2) offres écartées d'office, comptées par cause ----------
const offer = (id: number, title: string, extra: Partial<Offer> = {}): Offer => ({
  key: `az:${id}`, source: "Adzuna", id: String(id), title, company: `Entreprise ${id}`, location: "Paris", contract: "CDI", salary: "", experience: "", years: null,
  date: new Date().toISOString(), url: `https://adz.test/job/${id}`, description: `${title} chez Entreprise ${id}`, ...extra,
});
const crit: Criteria = { keywords: "consultant SI", departments: [], contracts: ["CDI"], experience: "", publishedWithin: "31", maxYears: 2, exclude: "stagiaire" };
{
  const list = [
    offer(1, "Consultant SI"),
    offer(2, "Consultant SI senior", { description: "Plus de 6 ans d'expérience exigés" }),
    offer(3, "Consultant SI junior", { description: "Poste de stagiaire" }),
    offer(4, "Consultant SI alternance", { contract: "Alternance" }),
    offer(5, "Consultant SI", { date: new Date(Date.now() - 90 * 864e5).toISOString() }),
    offer(6, "Consultant SI", { description: "Poste à pourvoir" }),
  ];
  const r = filterOffersWithReport(list, crit);
  ok("les offres gardées sont les mêmes que celles de filterOffers", r.kept.map((o) => o.key).join() === filterOffers(list, crit).map((o) => o.key).join() && r.kept.map((o) => o.key).join() === "az:1,az:6", r.kept.map((o) => o.key).join());
  ok("chaque offre écartée est comptée une fois, dans sa cause", r.dropped.years === 1 && r.dropped.exclude === 1 && r.dropped.contract === 1 && r.dropped.old === 1 && r.dropped.remote === 0, JSON.stringify(r.dropped));
  ok("sans filtre posé : rien n'est écarté", Object.values(filterOffersWithReport(list.slice(0, 1), { ...crit, maxYears: null, exclude: "" }).dropped).every((n) => n === 0));
}

// ---------- (3) « Voir la suite » : la page suivante de chaque source ----------
ok("les critères reçus du navigateur : page 1 par défaut, bornée à MAX_PAGE, jamais n'importe quoi", sanitizeCriteria({}).page === 1 && sanitizeCriteria({ page: 0 }).page === 1 && sanitizeCriteria({ page: -3 }).page === 1 && sanitizeCriteria({ page: 99 }).page === MAX_PAGE && sanitizeCriteria({ page: "2" }).page === 1 && sanitizeCriteria({ page: 2.6 }).page === 3 && sanitizeCriteria({ page: 3 }).page === 3 && MAX_PAGE === 5);
{
  calls.length = 0;
  await searchAll({ ...crit, page: 3 });
  const az = calls.filter((c) => c.url.includes("adz.test")), jb = calls.filter((c) => c.url.includes("jooble.test"));
  ok("Adzuna : la page demandée est dans l'adresse (/search/3)", az.length > 0 && az.every((c) => c.url.includes("/jobs/fr/search/3?")), az[0]?.url);
  ok("Jooble : la page demandée est dans le corps de la requête", jb.length > 0 && jb.every((c) => JSON.parse(c.body).page === "3"), jb[0]?.body);
  calls.length = 0;
  await searchAll(crit);
  ok("sans page : la première", calls.filter((c) => c.url.includes("adz.test")).every((c) => c.url.includes("/jobs/fr/search/1?")) && calls.filter((c) => c.url.includes("jooble.test")).every((c) => JSON.parse(c.body).page === "1"));
  calls.length = 0;
  await searchAll({ ...crit, page: 500 });
  ok("même une page absurde reçue d'un appel interne est ramenée à MAX_PAGE", calls.every((c) => (c.url.includes("adz.test") ? c.url.includes(`/search/${MAX_PAGE}?`) : JSON.parse(c.body).page === String(MAX_PAGE))));
  const res = await searchAll(crit);
  ok("searchAll rend aussi le nombre d'offres lues et ce qui est écarté d'office", res.read === 0 && Object.values(res.dropped).every((n) => n === 0));
}

// ---------- (4) l'encadré « Pourquoi si peu d'offres ? » ----------
{
  const lines = explainSearch({
    sources: [{ label: "Adzuna", ok: true, count: 41 }, { label: "Jooble", ok: true, count: 7 }, { label: "Autre", ok: false, count: 0 }],
    read: 45, dropped: { exclude: 0, remote: 0, years: 6, contract: 3, old: 2 }, far: 34, shown: 0, pages: 1,
    criteria: { contracts: ["CDI"], maxYears: 2, exclude: "", remoteOnly: false, departments: ["93"] }, zone: "Seine-Saint-Denis",
  });
  const text = lines.join(" | ");
  ok("l'encadré dit ce que chaque source a lu (et ignore une source en panne)", /Adzuna : 41 offres lues ; Jooble : 7 offres lues\./.test(text) && !/Autre/.test(text), text);
  ok("il dit ce qui est écarté d'office, par cause", /Écartées d'office : 11 \(6 demandent plus de 2 ans d'expérience, 3 sont des alternances ou des stages \(contrat non coché\), 2 sont trop anciennes pour la période choisie\)/.test(text), text);
  ok("il dit combien d'offres sont masquées comme éloignées, et où les voir", /34 offres sont masquées parce qu'elles sont éloignées de tes postes.*« Afficher aussi… »/.test(text), text);
  ok("il cite les réglages qui réduisent déjà la recherche (zone, CDI seul, années)", /zone « Seine-Saint-Denis » seulement/.test(text) && /contrat CDI seul coché/.test(text) && /2 ans au plus/.test(text), text);
  const calm = explainSearch({ sources: [{ label: "Adzuna", ok: true, count: 1 }], read: 1, dropped: { exclude: 0, remote: 0, years: 0, contract: 0, old: 0 }, far: 1, shown: 0, pages: 2, criteria: { contracts: ["CDI", "CDD"] }, zone: "" });
  ok("le singulier, les pages lues, et aucun réglage cité quand il n'y en a pas", calm.join(" ").includes("1 offre lue (2 pages)") && /1 offre est masquée parce qu'elle est éloignée de tes postes/.test(calm.join(" ")) && !calm.some((l) => /Réglages/.test(l)) && !calm.some((l) => /Écartées/.test(l)), calm.join(" | "));
  ok("rien à dire : liste vide", explainSearch({ sources: [], read: 0, dropped: { exclude: 0, remote: 0, years: 0, contract: 0, old: 0 }, far: 0, shown: 0, pages: 1, criteria: { contracts: [] }, zone: "" }).length === 0);
}

// ---------- L'écran et la route ----------
{
  const page = readFileSync("app/recherche/page.tsx", "utf8");
  ok("tout est masqué comme éloigné : l'écran le dit et propose de les afficher (au lieu de « Aucune offre »)", /Aucune offre proche de tes postes, mais/.test(page) && /setShowFar\(true\)/.test(page) && /Afficher les \$\{far\} offres éloignées/.test(page));
  ok("« Voir la suite des offres » lit la page suivante avec les critères de la première page, sans doublon", /page: pages \+ 1/.test(page) && /\.\.\.lastCrit/.test(page) && /new Set\(results\.map\(\(x\) => x\.key\)\)/.test(page) && /Voir la suite des offres/.test(page));
  ok("le bouton s'arrête quand une page ne donne rien ou à MAX_PAGE, et le dit", /exhausted/.test(page) && /pages \+ 1 >= MAX_PAGE/.test(page) && /Les sources n'ont rien d'autre pour ces critères/.test(page));
  ok("une nouvelle recherche repart de la page 1", /\{ \.\.\.\(given \?\? criteriaNow\(\)\), page: 1 \}/.test(page) && /setPages\(1\)/.test(page));
  ok("l'encadré « Pourquoi si peu d'offres ? » s'ouvre tout seul quand rien n'est affiché", /Pourquoi si peu d'offres \?/.test(page) && /open=\{!shown\.length\}/.test(page) && /explainSearch\(/.test(page));
  const route = readFileSync("app/api/search/route.ts", "utf8");
  ok("la route rend les comptes de la recherche", /read: found\.read/.test(route) && /dropped: found\.dropped/.test(route) && /page: criteria\.page \?\? 1/.test(route));
}

done();
