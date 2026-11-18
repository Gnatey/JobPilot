// Paquet 26 (18 novembre 2026).
// (1) « Mettre à jour mon profil » AJOUTE ce qui manque au profil d'aujourd'hui, au lieu de l'écraser par l'instantané du diagnostic.
// (2) La même formation écrite de deux façons (« & » / « et », « (Bac+3) ») n'est plus comptée deux fois : sa capture montrait 5 formations après l'analyse.
// (3) « À compléter » : une réponse qui donne l'information (centres d'intérêt, niveau de langue, ville, lien, année d'un projet) s'écrit seule dans le profil.
import { readFileSync } from "node:fs";
import { enforceFacts } from "../lib/cv-facts";
import { EMPTY_PROFILE } from "../lib/empty-profile";
import { addMissing, describeAdded } from "../lib/profile-add";
import { applyOps, dedupeEducation, dedupeExact, degreeWords, mergeExtracted, previewOps, sameEducation, vetOps, type AnswerOp } from "../lib/profile-fix";
import type { CvDoc, Education, Profile } from "../lib/types";
import { ok, done } from "./helpers";

const edu = (degree: string, school: string, start?: string, end?: string): Education => ({ degree, school, ...(start ? { start } : {}), ...(end ? { end } : {}) });

/* ---------- (2) Formations en double : le cas de sa capture ---------- */

const first = [
  edu("Master Data Management (Bac+5)", "Paris School of Business", "2023", "2025"),
  edu("Bachelor E-commerce & Marketing Numérique (Bac+3)", "Paris School of Business et UPEC", "2022", "2023"),
  edu("DUT Statistiques & Informatique Décisionnelle", "Université Sorbonne Paris Nord", "2020", "2022"),
];
const second = [
  edu("Master Data Management (Bac+5)", "Paris School of Business", "2023", "2025"),
  edu("Bachelor E-commerce et Marketing numérique (Bac+3)", "Paris School of Business et UPEC (double diplôme)", "2022", "2023"),
  edu("DUT Statistiques et Informatique décisionnelle (Bac+2)", "Université Sorbonne Paris Nord, Villetaneuse", "2020", "2022"),
];

ok("les mots d'une formation ignorent « (Bac+3) », « & », « et » et les accents", degreeWords("Bachelor E-commerce & Marketing Numérique (Bac+3)").join(" ") === degreeWords("Bachelor E-commerce et Marketing numérique (Bac+3)").join(" "));
ok("« & » contre « et » + « (Bac+2) » ajouté : même DUT", sameEducation(first[2], second[2]));
ok("même Bachelor", sameEducation(first[1], second[1]));
ok("le Master et le Bachelor ne se confondent pas", !sameEducation(first[0], first[1]) && !sameEducation(first[0], second[1]));
ok("deux Master de même nom mais d'années différentes restent deux diplômes", !sameEducation(edu("Master Data Management", "X", "2019", "2021"), edu("Master Data Management", "X", "2023", "2025")));
ok("« Master Informatique » et « Master Informatique décisionnelle » : deux formations (2 mots seulement, prudence)", !sameEducation(edu("Master Informatique", "X"), edu("Master Informatique décisionnelle", "X")));
ok("sans année d'un côté : le même intitulé reste le même diplôme", sameEducation(edu("DUT Statistiques et Informatique décisionnelle", "S"), edu("DUT Statistiques & Informatique Décisionnelle (Bac+2)", "S", "2020", "2022")));

const cur = { ...EMPTY_PROFILE, education: first } as Profile;
const ext = { ...EMPTY_PROFILE, education: second } as Profile;
const merged = mergeExtracted(cur, ext).profile;
ok("fusion de son CV avec son profil : 3 formations, pas 5", merged.education.length === 3, String(merged.education.length));
ok("la formation du profil garde sa forme (le profil d'aujourd'hui fait foi)", merged.education[1].degree === first[1].degree && merged.education[1].school === first[1].school);
const sparse = mergeExtracted({ ...EMPTY_PROFILE, education: [edu("DUT Statistiques & Informatique Décisionnelle", "")] } as Profile, ext).profile;
const dut = sparse.education.filter((e) => /^DUT/.test(e.degree));
ok("une formation connue est seulement complétée (école, années), sans second DUT", dut.length === 1 && dut[0].degree === "DUT Statistiques & Informatique Décisionnelle" && dut[0].school === "Université Sorbonne Paris Nord, Villetaneuse" && dut[0].end === "2022" && sparse.education.length === 3);
ok("une vraie nouvelle formation s'ajoute", mergeExtracted(cur, { ...EMPTY_PROFILE, education: [edu("MBA Finance", "HEC", "2026", "2027")] } as Profile).profile.education.length === 4);

const five = { ...EMPTY_PROFILE, education: [...first, second[1], second[2]] } as Profile;
const clean = dedupeExact(five);
ok("« Faire le point » : ses 5 lignes redeviennent 3", clean.profile.education.length === 3 && clean.changes.some((c) => /2 formations en double retirées/.test(c)), clean.changes.join(" | "));
ok("la première ligne de chaque formation est gardée", clean.profile.education.map((e) => e.degree).join("|") === first.map((e) => e.degree).join("|"));
ok("un profil sans doublon n'est pas touché (même liste)", dedupeEducation(first).list === first && dedupeEducation(first).dropped === 0);

// Sur le CV : TOUTES les formations du profil, mais une seule fois chacune
const cv: CvDoc = { headline: "Administrateur Base de Données", summary: "", experiences: [], education: [], skills: [], projects: [], certifications: [], languages: "", ats_keywords_used: [], notes_for_candidate: [] };
const onCv = enforceFacts(cv, five);
ok("le CV généré à partir de 5 lignes de profil n'affiche que 3 formations", onCv.cv.education.length === 3, String(onCv.cv.education.length));
const again = enforceFacts({ ...cv, education: onCv.cv.education }, five);
ok("et un CV qui les a déjà ne remet rien (pas de « formation absente » à tort)", again.report.restored.length === 0, again.report.restored.join(","));

/* ---------- (1) Mettre à jour mon profil : ajouter, jamais remplacer ---------- */

const mine: Profile = {
  ...EMPTY_PROFILE,
  identity: { name: "Juliana", email: "j@exemple.fr", city: "Paris", links: [] },
  targets: [{ id: "t1", title: "Data Analyst", pitch: "" }],
  experiences: [
    { id: "e1", company: "SNCF", role: "Assistante cheffe de projet numérique", start: "sept. 2024", end: "sept. 2025", achievements: [
      { text: "Support de niveau 3 en MOE : remontée des anomalies aux développeurs et cahier de recette", tags: [] }, // écrite à la main APRÈS le diagnostic
      { text: "Suivi du portail Médecine du Travail", tags: [] },
    ] },
  ],
  education: first,
  languages: [{ name: "Anglais", level: "B1" }],
  rules: ["Ne jamais inventer de chiffre.", "Une règle écrite après le diagnostic."],
  settled: [{ question: "Le Master est-il bien 2023-2025 ?", answer: "oui" }],
  preferences: { contracts: ["CDI"], onboarded: true } as Profile["preferences"],
  todo: [],
};
// Le profil que le diagnostic avait proposé il y a quelques jours : sans la réalisation N3, sans la règle, avec une réalisation de plus
const snapshot: Profile = {
  ...EMPTY_PROFILE,
  identity: { name: "Juliana", email: "j@exemple.fr", links: [{ label: "GitHub", url: "https://github.com/exemple" }] },
  targets: [{ id: "t9", title: "Data Engineer", pitch: "" }],
  experiences: [
    { id: "x1", company: "SNCF", role: "Assistante cheffe de projet numérique", start: "sept. 2024", end: "sept. 2025", achievements: [
      { text: "Suivi du portail Médecine du Travail", tags: [] },
      { text: "Rédaction de la documentation fonctionnelle de l'outil de médecine du travail", tags: [] },
    ] },
    { id: "x2", company: "ORANO", role: "Chargée de projet digital", start: "sept. 2022", end: "sept. 2023", achievements: [{ text: "Reporting SharePoint et Power BI", tags: [] }] },
  ],
  education: second,
  skills: { "Autres compétences": ["Power Automate"] },
  languages: [{ name: "Anglais", level: "C1" }, { name: "Turc", level: "A2" }],
  interests: ["Voyages"],
  todo: ["Quel est le volume de données traité chez ORANO ?"],
  rules: ["Règle du diagnostic"],
  preferences: { contracts: ["CDD"] },
};
const { profile: out, added } = addMissing(mine, snapshot);
ok("rien n'est perdu : la réalisation écrite à la main après le diagnostic est toujours là", out.experiences[0].achievements.some((a) => /Support de niveau 3 en MOE/.test(a.text)));
ok("les règles, réglages, cibles et la mémoire des questions réglées restent ceux d'aujourd'hui", out.rules.join("|") === mine.rules.join("|") && out.preferences.contracts.join() === "CDI" && out.targets[0].title === "Data Analyst" && out.settled?.length === 1);
ok("la réalisation nouvelle s'ajoute à l'expérience connue (sans doublonner la connue)", out.experiences[0].achievements.length === 3 && added.achievements === 2, JSON.stringify(added));
ok("l'expérience que le profil n'avait pas s'ajoute avec sa réalisation", out.experiences.length === 2 && out.experiences[1].company === "ORANO" && added.experiences === 1);
ok("la compétence, le centre d'intérêt, le lien et la question s'ajoutent", out.skills["Autres compétences"]?.[0] === "Power Automate" && out.interests[0] === "Voyages" && out.identity.links.length === 1 && out.todo.length === 1);
ok("la ville du profil n'est pas écrasée", out.identity.city === "Paris");
ok("une langue connue garde le niveau que la personne a réglé, une langue nouvelle s'ajoute", out.languages.find((l) => l.name === "Anglais")?.level === "B1" && out.languages.some((l) => l.name === "Turc"));
ok("les formations (écrites autrement) ne doublonnent pas : 3, pas 6", out.education.length === 3 && added.education === 0, String(out.education.length));
ok("le résumé dit ce qui a été ajouté", describeAdded(added).includes("2 réalisations") && describeAdded(added).includes("1 expérience") && describeAdded(added).includes("1 langue"), describeAdded(added));
const again2 = addMissing(out, snapshot);
ok("rejouer ne rajoute rien (idempotent) et le dit", describeAdded(again2.added) === "" && JSON.stringify(again2.profile.experiences) === JSON.stringify(out.experiences));
ok("le profil d'origine n'est pas modifié sur place", mine.experiences.length === 1 && mine.experiences[0].achievements.length === 2 && mine.languages.length === 1);

const route = readFileSync("app/api/cv/apply/route.ts", "utf8");
ok("la route écrit le profil fusionné, plus l'instantané du diagnostic", /addMissing\(current, proposed\)/.test(route) && !/data: Profile = settled\.length \? \{ \.\.\.proposed/.test(route) && !/: proposed;/.test(route));
ok("la route garde la mémoire des questions réglées", /mergeSettled\(current\.settled, proposed\.settled\)/.test(route) && /dropSettled\(/.test(route));
ok("le bouton dit ce qui a été ajouté", /Ajouté à ton profil/.test(readFileSync("components/apply-profile-button.tsx", "utf8")));

/* ---------- (3) « À compléter » : l'information donnée s'écrit seule ---------- */

const p: Profile = {
  ...EMPTY_PROFILE,
  identity: { name: "J", email: "j@exemple.fr", city: "Paris", links: [{ label: "GitHub", url: "https://github.com/exemple" }] },
  interests: ["Voyages (Ghana, Guinée équ", "Escalade"],
  languages: [{ name: "Anglais", level: "B1-B2" }],
  projects: [{ name: "JobPilot", description: "Application de suivi de candidatures", tags: [] }],
};
const answer = "conventions; voyages (Ghana, Guinée équatoriale, Allemagne, Belgique) ; gastronomie et DIY.";
const ops: AnswerOp[] = [
  { op: "interest", text: "Conventions" },
  { op: "interest", text: "Voyages (Ghana, Guinée équatoriale, Allemagne, Belgique)", old_text: "Voyages (Ghana, Guinée équ" },
  { op: "interest", text: "Gastronomie et DIY" },
];
const vetted = vetOps(p, ops, answer);
ok("sa réponse sur les centres d'intérêt donne trois lignes à valider, plus « il manque une information »", vetted.length === 3, String(vetted.length));
const after = applyOps(p, vetted);
ok("la liste coupée est complétée en place, les deux autres s'ajoutent, « Escalade » reste", after.interests.join("|") === "Voyages (Ghana, Guinée équatoriale, Allemagne, Belgique)|Escalade|Conventions|Gastronomie et DIY", after.interests.join("|"));
const prev = previewOps(p, vetted);
ok("l'avant / après montre la ligne coupée puis la ligne complète", prev[1].before === "Voyages (Ghana, Guinée équ" && prev[1].after.includes("Belgique") && prev[0].where === "Centres d'intérêt");
ok("un intérêt qui n'est pas dans sa réponse est refusé", vetOps(p, [{ op: "interest", text: "Randonnée en montagne" }], answer).length === 0);
ok("un intérêt déjà au profil n'est pas reproposé", vetOps(p, [{ op: "interest", text: "Escalade" }], "escalade").length === 0);
ok("un chiffre absent de sa réponse est refusé", vetOps(p, [{ op: "interest", text: "Voyages (12 pays)" }], "voyages").length === 0);

ok("niveau de langue : écrit comme elle l'a dit", vetOps(p, [{ op: "language", name: "Anglais", level: "B2" }], "Mon anglais est B2").length === 1 && applyOps(p, [{ op: "language", name: "Anglais", level: "B2" }]).languages[0].level === "B2");
ok("niveau de langue : un niveau qu'elle n'a pas dit est refusé", vetOps(p, [{ op: "language", name: "Anglais", level: "C1" }], "Mon anglais est B2").length === 0);
ok("langue nouvelle : ajoutée si elle la nomme", vetOps(p, [{ op: "language", name: "Turc", level: "A2" }], "Je parle turc, niveau A2").length === 1 && applyOps(p, [{ op: "language", name: "Turc", level: "A2" }]).languages.length === 2);
ok("langue nouvelle absente de sa réponse : refusée", vetOps(p, [{ op: "language", name: "Turc", level: "A2" }], "niveau A2").length === 0);
ok("même niveau déjà au profil : rien à faire", vetOps(p, [{ op: "language", name: "Anglais", level: "B1-B2" }], "B1-B2").length === 0);

ok("ville : reprise de sa réponse", vetOps(p, [{ op: "city", text: "Lyon" }], "J'habite à Lyon").length === 1 && applyOps(p, [{ op: "city", text: "Lyon" }]).identity.city === "Lyon");
ok("ville inventée : refusée", vetOps(p, [{ op: "city", text: "Marseille" }], "J'habite à Lyon").length === 0);

const lk: AnswerOp = { op: "link", label: "Portfolio", url: "https://exemple.fr/portfolio" };
ok("lien : seulement s'il est dans sa réponse, tel quel", vetOps(p, [lk], "Mon portfolio : https://exemple.fr/portfolio").length === 1 && applyOps(p, [lk]).identity.links.length === 2);
ok("lien absent de sa réponse : refusé", vetOps(p, [lk], "Mon portfolio est en ligne").length === 0);
ok("lien déjà au profil : pas de doublon", vetOps(p, [{ op: "link", label: "GitHub", url: "https://www.github.com/exemple/" }], "https://github.com/exemple").length === 0);
ok("un lien qui n'est pas http(s) est refusé", vetOps(p, [{ op: "link", label: "X", url: "javascript:alert(1)" }], "javascript:alert(1)").length === 0);

const yr: AnswerOp = { op: "project_year", name: "JobPilot", year: "2025" };
ok("année d'un projet : seulement si elle la donne", vetOps(p, [yr], "Je l'ai commencé en 2025").length === 1 && applyOps(p, [yr]).projects[0].year === "2025");
ok("année d'un projet absente de sa réponse : refusée", vetOps(p, [yr], "Je l'ai commencé il y a un an").length === 0);
ok("projet inconnu : refusé", vetOps(p, [{ op: "project_year", name: "Autre", year: "2025" }], "2025").length === 0);

const ai = readFileSync("lib/ai.ts", "utf8");
ok("l'IA connaît ces opérations et voit intérêts, langues, ville et années de projets", /"interest", "language", "city", "link", "project_year"/.test(ai) && /interets: profile\.interests/.test(ai) && /ville: profile\.identity\.city/.test(ai));

done();
