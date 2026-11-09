// Doublons dans Suivi : repérage, protections (lieux, écart de dates, lignes closes), choix de la ligne gardée. Logique pure, aucun réseau.
import { findAppDuplicates, extras, preChecked, isBare, traces, appDupSummary, OPEN_STATUSES, MAX_GAP_DAYS, type DupLine } from "../lib/app-dups";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ok, done } from "./helpers";

const src = (f: string) => readFileSync(join(process.cwd(), f), "utf8");
let n = 0;
const line = (title: string, company: string, over: Partial<DupLine> = {}): DupLine => ({
  id: `a${++n}`, offer_id: null, title, company, location: null, status: "postule", score: null, applied_at: "2026-11-02T10:00:00Z",
  interview_at: null, contact: null, salary: null, notes: null, last_email_at: null, created_at: `2026-11-0${(n % 9) + 1}T10:00:00Z`, ...over,
});

// ---------- Le cas de la capture : deux « Postulé », 85 % et 82 % ----------
{
  const a = line("Gestionnaire de Données H/F", "Actual group", { score: 85, applied_at: "2026-11-03T09:00:00Z" });
  const b = line("Gestionnaire de Données (H/F)", "Actual Group", { score: 82, applied_at: "2026-11-03T09:05:00Z" });
  const g = findAppDuplicates([a, b]);
  ok("deux « Postulé » de même intitulé et même entreprise : un groupe", g.length === 1 && g[0].items.length === 2 && g[0].reason === "title");
  ok("une seule ligne en trop (l'autre est gardée)", extras(g[0]).length === 1 && g[0].keepId !== extras(g[0])[0].id);
  ok("à étape égale, la plus anciennement envoyée est gardée", g[0].keepId === a.id);
  ok("deux lignes nues : la ligne en trop est cochée d'office", preChecked(g[0]).length === 1 && preChecked(g[0])[0].id === b.id);
  ok("le bilan compte groupes et lignes en trop", appDupSummary(g) === "1 groupe de doublons, 1 ligne en trop.");
}

// ---------- Ce qui n'est PAS un doublon ----------
{
  ok("une seule ligne : rien", findAppDuplicates([line("Data Analyst", "Atos")]).length === 0);
  ok("même intitulé, entreprises différentes : rien", findAppDuplicates([line("Data Analyst", "Atos"), line("Data Analyst", "Capgemini")]).length === 0);
  ok("entreprise non précisée : jamais rapprochée sur l'intitulé seul",
    findAppDuplicates([line("Data Analyst junior en banque privée", "Non spécifié"), line("Data Analyst junior en banque privée", "Non spécifié")]).length === 0);
  ok("même entreprise, intitulés différents : rien", findAppDuplicates([line("Data Analyst", "Atos"), line("Data Engineer", "Atos")]).length === 0);
  ok("deux lieux différents : deux postes, pas un doublon", findAppDuplicates([line("Data Analyst", "Société Générale", { location: "Paris" }), line("Data Analyst", "Société Générale", { location: "Lyon" })]).length === 0);
  ok("« Paris » et « Paris (75) » : même lieu", findAppDuplicates([line("Data Analyst", "Société Générale", { location: "Paris" }), line("Data Analyst", "Société Générale", { location: "Paris (75)" })]).length === 1);
  ok("un lieu absent n'écarte pas le doublon", findAppDuplicates([line("Data Analyst", "Atos", { location: "Lille" }), line("Data Analyst", "Atos", { location: null })]).length === 1);
  const far = new Date(Date.parse("2026-06-01T10:00:00Z") - 1).toISOString();
  ok(`deux envois à plus de ${MAX_GAP_DAYS} jours : deux candidatures`, findAppDuplicates([line("Data Analyst", "Atos", { applied_at: far }), line("Data Analyst", "Atos", { applied_at: "2026-11-02T10:00:00Z" })]).length === 0);
  ok("deux envois proches : doublon", findAppDuplicates([line("Data Analyst", "Atos", { applied_at: "2026-10-20T10:00:00Z" }), line("Data Analyst", "Atos", { applied_at: "2026-11-02T10:00:00Z" })]).length === 1);
  for (const closed of ["refuse", "abandonne", "expiree"])
    ok(`une ligne « ${closed} » n'est jamais comparée (annonce republiée = autre candidature)`, findAppDuplicates([line("Data Analyst", "Atos", { status: closed }), line("Data Analyst", "Atos")]).length === 0);
  ok("deux lignes closes : rien", findAppDuplicates([line("Data Analyst", "Atos", { status: "refuse" }), line("Data Analyst", "Atos", { status: "refuse" })]).length === 0);
}

// ---------- Même offre analysée ----------
{
  const a = line("Chef de projet data", "Banque X", { offer_id: "o1" });
  const b = line("Chef de projet data (intitulé reformulé)", "Banque X S.A.", { offer_id: "o1" });
  const g = findAppDuplicates([a, b]);
  ok("même offre : doublon même si l'intitulé a changé", g.length === 1 && g[0].reason === "offer");
  ok("deux offres différentes : rien", findAppDuplicates([line("Data Analyst", "Atos", { offer_id: "o1" }), line("Autre poste", "Zeta", { offer_id: "o2" })]).length === 0);
}

// ---------- Quelle ligne garder ----------
{
  const nue = line("Data Analyst", "Atos", { status: "postule" });
  const avancee = line("Data Analyst", "Atos", { status: "entretien" });
  ok("la plus avancée est gardée (Entretien avant Postulé)", findAppDuplicates([nue, avancee])[0].keepId === avancee.id);
  const aPostuler = line("Data Analyst", "Atos", { status: "a_postuler", applied_at: null });
  const postule = line("Data Analyst", "Atos", { status: "postule" });
  ok("Postulé est gardée devant À postuler", findAppDuplicates([aPostuler, postule])[0].keepId === postule.id);
  const note = line("Data Analyst", "Atos", { notes: "Appel du 4 nov." });
  const vide = line("Data Analyst", "Atos");
  ok("à étape égale, la ligne qui porte une note est gardée", findAppDuplicates([vide, note])[0].keepId === note.id);
  const aCv = line("Data Analyst", "Atos");
  const sansCv = line("Data Analyst", "Atos");
  ok("un document rattaché fait garder la ligne", findAppDuplicates([sansCv, aCv], { [aCv.id]: 1 })[0].keepId === aCv.id);
  const g = findAppDuplicates([sansCv, aCv], { [aCv.id]: 1 });
  ok("la ligne en trop est cochée d'office si elle est nue", preChecked(g[0], { [aCv.id]: 1 }).length === 1 && preChecked(g[0], { [aCv.id]: 1 })[0].id === sansCv.id);
  const chargee = line("Data Analyst", "Atos", { contact: "Léa, RH", notes: "x" });
  const moins = line("Data Analyst", "Atos", { notes: "y" });
  const g2 = findAppDuplicates([chargee, moins]);
  ok("la ligne en trop qui porte du travail n'est PAS cochée d'office", g2[0].keepId === chargee.id && extras(g2[0]).length === 1 && preChecked(g2[0]).length === 0);
  const t1 = line("Data Analyst", "Atos", { score: 70 });
  const t2 = line("Data Analyst", "Atos", { score: 80 });
  ok("à égalité de tout le reste, le meilleur score est gardé", findAppDuplicates([t1, t2])[0].keepId === t2.id);
}

// ---------- Traces de travail ----------
{
  const l = line("X", "Y", { notes: "  ", contact: "", salary: null });
  ok("note, contact ou salaire vides (espaces) : ligne nue", isBare(l) && traces(l).length === 0);
  ok("un entretien est une trace", !isBare(line("X", "Y", { interview_at: "2026-11-10T10:00:00Z" })));
  ok("un e-mail rattaché est une trace", !isBare(line("X", "Y", { last_email_at: "2026-11-04T10:00:00Z" })));
  ok("un document rattaché est une trace", !isBare(line("X", "Y"), 1) && traces(line("X", "Y"), 2).join() === "2 documents");
  ok("les statuts comparés sont les six étapes en cours", OPEN_STATUSES.length === 6 && !OPEN_STATUSES.includes("refuse"));
}

// ---------- Trois lignes : un seul groupe ; deux groupes indépendants ----------
{
  const a = line("Data Analyst", "Atos"), b = line("Data Analyst", "Atos"), c = line("Data Analyst", "Atos");
  const d = line("BI Developer", "Orange"), e = line("BI Developer", "Orange");
  const g = findAppDuplicates([a, b, c, d, e]);
  ok("trois lignes identiques : un groupe de trois, deux en trop", g.length === 2 && g.some((x) => x.items.length === 3 && extras(x).length === 2));
  ok("deux groupes indépendants", g.map((x) => x.items.length).sort().join() === "2,3");
  ok("le bilan accorde au pluriel", appDupSummary(g) === "2 groupes de doublons, 3 lignes en trop.");
  ok("une ligne n'est jamais dans deux groupes", new Set(g.flatMap((x) => x.items.map((l) => l.id))).size === 5);
}

// ---------- L'écran ----------
{
  const s = src("components/suivi-dups.tsx");
  ok("l'écran ne supprime qu'après confirmation", /confirm\(\{[\s\S]*?danger: true/.test(s) && /\.delete\(\)\.in\("id"/.test(s));
  ok("l'écran ne coche d'office que les lignes nues (preChecked)", /preChecked\(/.test(s));
  ok("l'écran lit les documents rattachés avant de choisir la ligne gardée", /from\("documents"\)/.test(s) && /application_id/.test(s));
  ok("aucun appel d'IA ni d'API : lecture et suppression par la base de la personne", !/fetch\(/.test(s) && !/\/api\/ai|llm/.test(s));
  const b = src("components/suivi-board.tsx");
  ok("Suivi affiche la carte des doublons", /<SuiviDups\b/.test(b) && /components\/suivi-dups/.test(b));
}

done();
