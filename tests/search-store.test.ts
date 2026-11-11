// « Préparer ma journée » avec un poste que le profil ne vise pas encore (11 novembre, Juliana : « Candidatures par jour : 5 », recherche « consultant SI », rien dans la liste).
// Une offre n'était rangée que si son pré-score atteignait 30 : pour « consultant SI » (profil Data / BI) presque tout restait dessous, sans un mot. Sans réseau ni base.
import { readFileSync } from "node:fs";
import { ok, done } from "./helpers";
import { planStore, titleSaysRole, MIN_STORE_SCORE } from "../lib/search-store";
import { explainDay } from "../lib/search-why";
import type { JobOffer } from "../lib/sources/types";
import type { Profile } from "../lib/types";

const profile = {
  identity: { name: "J. N.", email: "j@example.org", links: [] },
  targets: [{ id: "t1", title: "Data Analyst", pitch: "" }, { id: "t2", title: "Consultant BI", pitch: "" }],
  experiences: [], education: [], projects: [], skills: { Langages: ["Python", "SQL"], Analyse: ["Power BI"] }, certifications: [], languages: [], interests: [],
  preferences: { contracts: ["CDI"], max_years: 2 }, rules: [], todo: [],
} as unknown as Profile;

const offer = (id: number, title: string, description: string, extra: Partial<JobOffer> = {}): JobOffer => ({
  key: `az:${id}`, source: "Adzuna", id: String(id), title, company: `Entreprise ${id}`, location: "Paris", contract: "CDI", salary: "", experience: "", years: null,
  date: new Date().toISOString(), url: `https://adz.test/job/${id}`, description, ...extra,
});
const base = { userId: "u1", profile, learning: null, contracts: [] as string[], criteriaRoles: [] as string[], withPosted: true };

// ---------- Le cas signalé ----------
const SI = "Accompagnement de la DSI d'un grand compte dans la transformation de son système d'information.";
const offers = [
  offer(1, "Consultant Système d'Information H/F", SI),
  offer(2, "Consultant SI", SI),
  offer(3, "Consultant SAP MM", "Paramétrage du module MM chez un client industriel."),
  offer(4, "Data Engineer", "Pipelines de données pour une équipe produit."),
  offer(5, "Data Analyst Power BI", "Python, SQL, Power BI : tableaux de bord pour la direction."),
  offer(6, "Consultant SI senior", "Plus de 8 ans d'expérience exigés. " + SI),
];
const plan = planStore({ ...base, offers, keywords: "consultant SI" });
const byKey = (k: string) => plan.rows.find((r) => r.dedupe_key === k);
ok("avant : « Consultant Système d'Information » (pré-score 15, sous 30) disparaissait ; maintenant son titre dit le poste demandé, elle est rangée « À trier » (« Consultant SI », à 45, l'était déjà)", byKey("az:1")?.status === "new" && byKey("az:2")?.status === "new" && (byKey("az:1")?.quick_score ?? 99) < MIN_STORE_SCORE && (byKey("az:2")?.quick_score ?? 0) >= MIN_STORE_SCORE, JSON.stringify(plan.rows.map((r) => [r.dedupe_key, r.status, r.quick_score])));
ok("le pré-score reste ce qu'il est (il classe, il ne décide plus) et les offres gardées malgré lui sont comptées", plan.asked === 1 && plan.asked === plan.rows.filter((r) => r.quick_score < MIN_STORE_SCORE).length, JSON.stringify({ asked: plan.asked }));
ok("« Consultant SAP MM » (pas le poste demandé, sous 30) n'est toujours pas rangé : compté « peu compatible »", !byKey("az:3") && plan.low >= 1);
ok("« Data Engineer » n'est pas pris pour « Data Analyst » ni pour « consultant SI » : un seul mot en commun ne suffit pas", !byKey("az:4") && !titleSaysRole("Data Engineer", ["Data Analyst"]) && titleSaysRole("Data Analyst Junior", ["Data Analyst"]));
ok("une offre au bon pré-score est rangée comme avant", byKey("az:5")?.status === "new" && (byKey("az:5")?.quick_score ?? 0) >= MIN_STORE_SCORE);
ok("une offre au-dessus de la limite d'expérience n'est jamais « demandée » : sa règle passe avant le titre ; elle est comptée à part, pas « peu compatible »", !byKey("az:6") && plan.senior === 1 && plan.low === 2, JSON.stringify({ senior: plan.senior, low: plan.low }));
ok("tout est compté : lues = rangées + peu compatibles + trop seniors", plan.read === 6 && plan.rows.length + plan.low + plan.senior === 6, JSON.stringify({ read: plan.read, rows: plan.rows.length, low: plan.low, senior: plan.senior }));

// ---------- Ce qui ne change pas ----------
{
  const plain = planStore({ ...base, offers: [offer(7, "Consultant SAP MM", "Paramétrage SAP."), offer(8, "Data Analyst Power BI", "Python, SQL, Power BI.")], keywords: "data analyst" });
  ok("un poste que le profil vise déjà : même résultat qu'avant (le titre fait le score)", plain.rows.length === 1 && plain.rows[0].dedupe_key === "az:8" && plain.low === 1 && plain.asked === 0);
  const noKeywords = planStore({ ...base, offers: [offer(9, "Consultant Système d'Information", SI)], keywords: "" });
  ok("sans mots-clés, rien n'est « demandé » : le seuil s'applique à toute offre sous 30", noKeywords.rows.length === 0 && noKeywords.low === 1 && !titleSaysRole("Consultant SI", []));
  const stage = planStore({ ...base, offers: [offer(10, "Stage consultant SI", "Python SQL Power BI pour l'équipe SI.", { contract: "Stage" })], keywords: "consultant SI" });
  ok("un stage non demandé reste rangé en « Masquées » (éloignée), jamais « À trier », même si son titre dit le poste", stage.rows.length === 1 && stage.rows[0].status === "filtered" && stage.rows[0].reject_reason === "fit_stage" && stage.far === 1, JSON.stringify(stage.rows.map((r) => [r.status, r.reject_reason, r.quick_score])));
  const lowStage = planStore({ ...base, offers: [offer(11, "Stage consultant SI", SI, { contract: "Stage" })], keywords: "consultant SI" });
  ok("sous 30 et pas compatible (stage non demandé) : toujours écartée, comptée « peu compatible »", lowStage.rows.length === 0 && lowStage.low === 1);
  {
    const r = planStore({ ...base, offers: [offer(12, "Data Analyst Power BI", "Python SQL Power BI", { date: "2026-11-03" })], keywords: "data analyst" }).rows[0];
    ok("la date de publication de la source est gardée (reçue ET publiée) quand la base a la colonne", /^2026-11-03/.test(r.received_at) && /^2026-11-03/.test(r.posted_at ?? ""), `${r.received_at} / ${r.posted_at}`);
  }
  ok("base pas à jour (sans posted_at) : la colonne n'est pas écrite", planStore({ ...base, withPosted: false, offers: [offer(13, "Data Analyst Power BI", "Python SQL Power BI", { date: "2026-11-03" })], keywords: "data analyst" }).rows[0].posted_at === undefined);
}

// ---------- Le message de « Préparer ma journée » ----------
const none = { exclude: 0, remote: 0, years: 0, contract: 0, old: 0 };
{
  const stats = { read: 42, far: 21, low: 12, asked: 0, senior: 3, known: 2, fresh: 4 };
  const t = explainDay({ sourcesOn: true, web: { searched: true }, period: "31", maxYears: 2, read: 48, dropped: { ...none, years: 4, contract: 2 }, stats });
  ok("le message dit combien de sources ont lu, et chaque écart avec son nombre", /renvoyé 48 offres/.test(t) && /6 écartées d'office \(4 demandent plus de 2 ans d'expérience, 2 sont des alternances ou des stages/.test(t) && /21 éloignées de tes postes \(rangées dans Masquées\)/.test(t) && /12 peu compatibles avec ton profil \(pré-score sous 30\)/.test(t) && /3 au-dessus de ta limite d'expérience/.test(t) && /2 déjà connues/.test(t) && /4 nouvelles gardées/.test(t), t);
  ok("période déjà au maximum (1 mois) : le message ne conseille plus de l'élargir", !/Élargis la période/.test(t) && /Retire un réglage \(zone, contrat, années max\)/.test(t), t);
  const t14 = explainDay({ sourcesOn: true, web: { searched: true }, period: "14", read: 3, dropped: none, stats: { ...stats, far: 3, low: 0, senior: 0, known: 0, fresh: 0 } });
  ok("période plus courte : on conseille jusqu'à 1 mois", /Élargis la période \(jusqu'à 1 mois\), retire un réglage/.test(t14) && /3 éloignées de tes postes/.test(t14) && !/écartée/.test(t14), t14);
  const t0 = explainDay({ sourcesOn: true, web: { searched: true }, period: "31", read: 0, dropped: none, stats: { read: 0, far: 0, low: 0, asked: 0, senior: 0, known: 0, fresh: 0 } });
  ok("les sources n'ont rien renvoyé : le message le dit (et ne parle pas d'offres écartées)", /n'ont renvoyé aucune offre/.test(t0) && !/écartée/.test(t0), t0);
  ok("pas de source branchée, ou source en panne : les messages d'avant", /Aucune source de recherche automatique/.test(explainDay({ sourcesOn: false, web: { searched: false }, period: "14", read: 0, dropped: none, stats: null })) && /La recherche web a échoué \(délai dépassé\)/.test(explainDay({ sourcesOn: true, web: { searched: false, error: "délai dépassé" }, period: "14", read: 0, dropped: none, stats: null })));
  ok("recherche web non lancée (tâche du matin) : juste la piste, pas de comptes inventés", !/renvoyé/.test(explainDay({ sourcesOn: true, web: { searched: false }, period: "31", read: 0, dropped: none, stats: null })));
}

// ---------- Branchement ----------
{
  const day = readFileSync("lib/day.ts", "utf8");
  ok("buildDay récupère les comptes de la recherche web et les passe à explainDay", /storeSearchOffers\([^)]*toSearchCriteria\(crit\), st\)/.test(day) && /read = found\.read; dropped = found\.dropped; variants = found\.variants; stats = st;/.test(day) && /explainDay\(\{ sourcesOn: hasSource\(\)/.test(day));
  ok("l'ancien conseil fixe « Élargis la période, la zone ou les postes » a disparu", !/Élargis la période, la zone ou les postes/.test(day));
  const sync = readFileSync("lib/sync.ts", "utf8");
  ok("storeSearchOffers range ce que planStore décide et rend le détail à qui le demande", /planStore\(\{ userId, profile, learning, offers, keywords: sc\.keywords/.test(sync) && /stats\?: StoreStats/.test(sync) && /ignoreDuplicates: true/.test(sync) && !/quick_score >= 30/.test(sync));
  const store = readFileSync("lib/search-store.ts", "utf8");
  ok("le seuil de 30 n'existe qu'à un endroit", (store.match(/MIN_STORE_SCORE = 30/g) ?? []).length === 1 && /q\.score < MIN_STORE_SCORE/.test(store));
}

done();
