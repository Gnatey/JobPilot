// CV sur mesure : les faits (formations, postes, dates, langues, certifications) viennent du profil, jamais de l'IA.
// Cas signalé : l'IA avait supprimé le Bachelor E-commerce & Marketing numérique (trou d'un an entre le DUT et le Master).
import { readFileSync } from "node:fs";
import { cleanLevel, educationDates, enforceFacts, languagesText, MAX_EXPERIENCES, MIN_EXPERIENCES, offerWords, sameLanguages } from "../lib/cv-facts";
import { checkCv } from "../lib/cv-check";
import type { CvDoc, Profile } from "../lib/types";
import { ok, done } from "./helpers";

const profile = {
  identity: { name: "Test", email: "test@exemple.fr", links: [] },
  experiences: [
    { id: "a", company: "Orano", role: "Chargée de projet digital", location: "Châtillon", start: "sept. 2022", end: "sept. 2023", achievements: [] },
    { id: "b", company: "SNCF", role: "Assistante cheffe de projet numérique", location: "Saint-Denis", start: "sept. 2024", end: "sept. 2025", achievements: [] },
    { id: "c", company: "SNCF", role: "Stagiaire data", location: "Paris", start: "juin 2021", end: "août 2021", achievements: [] },
  ],
  education: [
    { degree: "Master Data Management (Bac+5)", school: "Paris School of Business", start: "sept. 2023", end: "juin 2025" },
    { degree: "Bachelor E-commerce & Marketing numérique", school: "Paris School of Business / UPEC", start: "2022", end: "2023" },
    { degree: "DUT Statistiques & Informatique Décisionnelle", school: "Université Sorbonne Paris Nord", start: "2020", end: "2022" },
  ],
  projects: [],
  skills: {},
  certifications: ["OpenClassrooms : SQL", "OpenClassrooms : Python pour l'analyse de données", "DataCamp : Python"],
  languages: [{ name: "Français", level: "maternel" }, { name: "Anglais", level: "B1-B2" }],
} as unknown as Profile;

const base = (patch: Partial<CvDoc> = {}): CvDoc => ({
  headline: "Administrateur Base de Données", summary: "", experiences: [], education: [], skills: [], projects: [], certifications: [], languages: "", ats_keywords_used: [], notes_for_candidate: [], ...patch,
});

// ---------- Le cas signalé : la formation supprimée ----------
{
  const aiEdu = [
    { degree: "Master Data Management (Bac+5)", school: "Paris School of Business", dates: "2023-2025" },
    { degree: "DUT Statistiques & Informatique Décisionnelle", school: "Université Sorbonne Paris Nord", dates: "2020-2022" },
  ];
  const r = enforceFacts(base({ education: aiEdu }), profile);
  ok("le Bachelor supprimé par l'IA est remis : trois formations", r.cv.education.length === 3 && r.cv.education.some((e) => e.degree === "Bachelor E-commerce & Marketing numérique"));
  ok("avec son école et ses dates (2022-2023), prises dans le profil", r.cv.education.find((e) => e.degree.startsWith("Bachelor"))?.dates === "2022-2023" && r.cv.education.find((e) => e.degree.startsWith("Bachelor"))?.school === "Paris School of Business / UPEC");
  ok("le rapport dit ce qui a été remis ; aucune note à lire pour une simple correction", r.report.restored.join() === "Bachelor E-commerce & Marketing numérique" && r.cv.notes_for_candidate.length === 0);
  ok("les dates des autres formations sont celles du profil (« sept. 2023 – juin 2025 » devient « 2023-2025 »)", r.cv.education.map((e) => e.dates).join("|") === "2023-2025|2022-2023|2020-2022");
}
{
  const r = enforceFacts(base({ education: [] }), profile);
  ok("l'IA n'a rendu aucune formation : toutes celles du profil sont remises", r.cv.education.length === 3 && r.report.restored.length === 3);
}
{
  const r = enforceFacts(base({ education: [{ degree: "MBA Finance de marché", school: "HEC", dates: "2025" }, { degree: "Master Data Management", school: "PSB", dates: "2023-2025" }] }), profile);
  ok("une formation inventée est retirée et signalée", !r.cv.education.some((e) => /MBA/.test(e.degree)) && r.report.inventedEducation.join() === "MBA Finance de marché" && r.cv.notes_for_candidate.some((n) => n.includes("MBA Finance de marché") && n.includes("ne figure pas")));
  ok("la formation reconnue (« Master Data Management ») n'est pas prise pour une invention, et son texte est celui du profil", r.cv.education.some((e) => e.degree === "Master Data Management (Bac+5)") && r.report.inventedEducation.length === 1);
}
{
  const noEdu = { ...profile, education: [] } as unknown as Profile;
  const mine = [{ degree: "Licence X", school: "Y", dates: "2019" }];
  ok("profil sans formation renseignée : on ne vide pas le CV", enforceFacts(base({ education: mine }), noEdu).cv.education.length === 1);
}

// ---------- Dates d'une formation ----------
ok("« sept. 2023 » → « juin 2025 » s'écrit 2023-2025", educationDates({ start: "sept. 2023", end: "juin 2025" }) === "2023-2025");
ok("deux années identiques : une seule", educationDates({ start: "2023", end: "2023" }) === "2023" && educationDates({ start: "sept. 2023", end: "" }) === "2023");
ok("formation en cours : « 2023 - en cours »", educationDates({ start: "2023", end: "en cours" }) === "2023 - en cours");
ok("aucune année lisible : le texte tel quel ; rien du tout : vide", educationDates({ start: "automne", end: "été" }) === "automne - été" && educationDates({}) === "");

// ---------- Expériences : entreprise, poste, lieu, dates ----------
const exp = (patch: Partial<CvDoc["experiences"][0]>): CvDoc["experiences"][0] => ({ company: "Orano", role: "Chargée de projet digital", location: "", dates: "Sept 2022 - Sept 2023", bullets: ["Analyser les flux"], ...patch });
{
  const r = enforceFacts(base({ experiences: [exp({ role: "Data Analyst BI senior", company: "ORANO Group", dates: "Sept 2021 - Sept 2022" })] }), profile);
  const e = r.cv.experiences[0];
  ok("intitulé de poste adapté à l'offre par l'IA : remis tel que dans le profil", e.role === "Chargée de projet digital" && r.report.roles.length === 1);
  ok("nom d'entreprise : celui du profil", e.company === "Orano");
  ok("dates fausses : celles du profil", e.dates === "sept. 2022 - sept. 2023" && r.report.dates.length === 1);
  ok("lieu : celui du profil quand l'IA ne l'avait pas mis", e.location === "Châtillon");
  ok("les puces de l'IA ne sont pas touchées", e.bullets.join() === "Analyser les flux");
}
{
  const r = enforceFacts(base({ experiences: [exp({ dates: "Sept 2022 – Sept 2023" })] }), profile);
  ok("mêmes dates écrites autrement (« Sept 2022 – Sept 2023 ») : la façon d'écrire de l'IA est gardée, pas de fausse alerte", r.cv.experiences[0].dates === "Sept 2022 – Sept 2023" && r.report.dates.length === 0 && r.report.roles.length === 0);
}
{
  const r = enforceFacts(base({ experiences: [exp({ company: "SNCF", role: "Assistante cheffe de projet", dates: "Sept 2024 - Sept 2025" }), exp({ company: "SNCF", role: "Stage data", dates: "Juin 2021 - Août 2021" })] }), profile);
  ok("deux postes à la SNCF : chacun retrouve le sien (par la période)", r.cv.experiences[0].role === "Assistante cheffe de projet numérique" && r.cv.experiences[1].role === "Stagiaire data" && r.cv.experiences[1].location === "Paris");
}
{
  const r = enforceFacts(base({ experiences: [exp({ company: "Société Inconnue", role: "Directeur" })] }), profile);
  ok("entreprise absente du profil : laissée, mais signalée", r.cv.experiences[0].company === "Société Inconnue" && r.report.unknownCompanies.join() === "Société Inconnue" && r.cv.notes_for_candidate[0].includes("à vérifier"));
}

// ---------- Langues et certifications ----------
ok("langues : « Français (maternel) · Anglais (B1-B2) »", languagesText(profile.languages) === "Français (maternel) · Anglais (B1-B2)" && languagesText([]) === "" && languagesText([{ name: "Espagnol", level: "" }]) === "Espagnol");
{
  const r = enforceFacts(base({ languages: "Français (maternel) · Anglais (C1) · Espagnol (B2)" }), profile);
  ok("niveau de langue gonflé par l'IA : remis comme dans le profil", r.cv.languages === "Français (maternel) · Anglais (B1-B2)" && r.report.languages);
  const same = enforceFacts(base({ languages: "anglais B1-B2, Français maternel" }), profile);
  ok("mêmes langues et niveaux écrits autrement (ordre, ponctuation) : pas d'écart signalé, texte remis comme le profil", !same.report.languages && same.cv.languages === "Français (maternel) · Anglais (B1-B2)");
  ok("le profil n'a aucune langue : rien d'inventé sur le CV", enforceFacts(base({ languages: "Anglais courant" }), { ...profile, languages: [] } as unknown as Profile).cv.languages === "");
}
{
  const r = enforceFacts(base({ certifications: ["OpenClassrooms – SQL, Python pour l'analyse de données", "DataCamp – Python", "AWS Certified Solutions Architect"] }), profile);
  ok("certification inventée : retirée et signalée", r.cv.certifications.length === 2 && !r.cv.certifications.some((c) => /AWS/.test(c)) && r.report.inventedCerts.length === 1 && r.cv.notes_for_candidate.some((n) => n.includes("AWS Certified")));
  ok("deux certifications du profil regroupées sur une ligne par l'IA : gardées (ce n'est pas une invention)", r.cv.certifications[0].startsWith("OpenClassrooms") && r.cv.certifications[1] === "DataCamp – Python");
}

// ---------- Robustesse ----------
{
  const input = base({ education: [{ degree: "Master Data Management", school: "PSB", dates: "2023-2025" }], experiences: [exp({ role: "Autre" })] });
  const copy = JSON.stringify(input);
  const once = enforceFacts(input, profile);
  ok("l'objet reçu n'est pas modifié", JSON.stringify(input) === copy);
  const twice = enforceFacts(once.cv, profile);
  ok("deuxième passage : rien ne change, pas de note en double", JSON.stringify(twice.cv) === JSON.stringify(once.cv) && twice.report.restored.length === 0 && twice.report.roles.length === 0);
  ok("profil presque vide : ne plante pas", enforceFacts(base({ experiences: [exp({})] }), { identity: { name: "x", email: "x" } } as unknown as Profile).cv.experiences.length === 1);
  ok("CV sans formations ni expériences : ne plante pas", enforceFacts({ ...base(), experiences: undefined as never, education: undefined as never, certifications: undefined as never, notes_for_candidate: undefined as never }, profile).cv.education.length === 3);
}

// ---------- Expérience retirée par l'IA (10 novembre : CV « Data Power BI » avec ORANO seule, la SNCF avait disparu) ----------
const A = (text: string) => ({ id: text.slice(0, 6), text, tags: [] });
const orano = { id: "a", company: "Orano", role: "Chargée de projet digital", location: "Châtillon", start: "sept. 2022", end: "sept. 2023", achievements: [A("Développer des dashboards interactifs Power BI pour les BU et le CODIR"), A("Administrer le CRM Microsoft Dynamics 365")] };
const sncf = {
  id: "b", company: "SNCF", role: "Assistante cheffe de projet numérique", location: "Saint-Denis", start: "sept. 2024", end: "sept. 2025",
  achievements: [A("Gérer le portail collaboratif Médecine du Travail"), A("Piloter des projets de transformation numérique en Agile Scrum"), A("Rédiger les cahiers des charges et de recette"), A("Planifier les jalons et suivre les KPI projet avec Planner et Excel")],
};
const stageBanque = { id: "c", company: "Banque Exemple", role: "Stagiaire", location: "Lyon", start: "juin 2021", end: "août 2021", achievements: [] };
const full = { ...profile, experiences: [orano, sncf, stageBanque] } as unknown as Profile;
{
  const only = exp({ bullets: ["Concevoir des dashboards Power BI"] });
  const r = enforceFacts(base({ headline: "Data Power BI", experiences: [only], ats_keywords_used: ["Agile Scrum", "KPI"] }), full);
  ok("l'IA n'a gardé qu'ORANO : la SNCF du profil est remise (deux expériences)", r.cv.experiences.length === 2 && r.cv.experiences.some((e) => e.company === "SNCF"));
  ok("remise du plus récent au plus ancien : SNCF (2024-2025) avant ORANO (2022-2023)", r.cv.experiences[0].company === "SNCF" && r.cv.experiences[1].company === "Orano");
  const s = r.cv.experiences[0];
  ok("poste, lieu et dates de l'expérience remise : ceux du profil", s.role === "Assistante cheffe de projet numérique" && s.location === "Saint-Denis" && s.dates === "sept. 2024 - sept. 2025");
  ok("trois puces au plus, reprises mot pour mot du profil", s.bullets.length === 3 && s.bullets.every((b) => sncf.achievements.some((a) => a.text === b)));
  ok("les réalisations les plus proches de l'offre (mots-clés du CV) passent en premier", /Agile Scrum/.test(s.bullets[0]), s.bullets[0]);
  ok("l'expérience que l'IA avait gardée n'est pas touchée (puces de l'IA)", r.cv.experiences[1].bullets.join() === "Concevoir des dashboards Power BI");
  ok("une expérience du profil sans réalisation (stage) n'est pas remise", !r.cv.experiences.some((e) => e.company === "Banque Exemple"));
  ok("le rapport le dit ; aucune note à lire (corriger une erreur de l'IA ne fait pas de note)", r.report.missingExperiences.join() === "SNCF (Assistante cheffe de projet numérique)" && r.cv.notes_for_candidate.length === 0);
  const again = enforceFacts(r.cv, full);
  ok("deuxième passage : rien ne change", JSON.stringify(again.cv) === JSON.stringify(r.cv) && again.report.missingExperiences.length === 0);
  const issues = checkCv(base({ headline: "Data Power BI", experiences: [only] }), full);
  ok("« Contrôler mes CV » : « Expérience absente du CV » (à corriger) nomme la SNCF", issues.some((i) => i.level === "fix" && i.text.startsWith("Expérience absente du CV") && i.text.includes("SNCF")));
}
{
  const both = [exp({ company: "SNCF", role: "Assistante cheffe de projet numérique", dates: "Sept 2024 - Sept 2025" }), exp({})];
  const r = enforceFacts(base({ experiences: both }), full);
  ok("le CV a déjà les deux entreprises : rien n'est ajouté, l'ordre de l'IA est gardé", r.cv.experiences.length === 2 && r.cv.experiences[0].company === "SNCF" && r.report.missingExperiences.length === 0);
  ok("aucune alerte au Contrôle quand toutes les expériences sont là", checkCv(base({ headline: "Data", experiences: both }), full).every((i) => !i.text.startsWith("Expérience absente")));
}
{
  const stage = { id: "d", company: "SNCF", role: "Stagiaire data", location: "Paris", start: "juin 2021", end: "août 2021", achievements: [A("Nettoyer des données de maintenance")] };
  const two = { ...full, experiences: [orano, sncf, stage] } as unknown as Profile;
  const r = enforceFacts(base({ experiences: [exp({ company: "SNCF", role: "Assistante cheffe de projet numérique", dates: "Sept 2024 - Sept 2025" }), exp({})] }), two);
  ok("deux postes dans la même entreprise : si le CV en garde un, l'autre (petit stage) n'est pas remis", r.cv.experiences.length === 2 && r.report.missingExperiences.length === 0);
}
{
  const many = Array.from({ length: 6 }, (_, i) => ({ id: `x${i}`, company: `Société ${"ABCDEF"[i]}`, role: "Analyste", location: "", start: `sept. ${2015 + i}`, end: `sept. ${2016 + i}`, achievements: [A("Produire des tableaux de bord")] }));
  const r = enforceFacts(base({ experiences: [] }), { ...profile, experiences: many } as unknown as Profile);
  ok(`un CV sans aucune expérience est complété jusqu'à ${MIN_EXPERIENCES}, les plus récentes à égalité de pertinence`, r.cv.experiences.length === MIN_EXPERIENCES && r.cv.experiences.map((e) => e.company).join("|") === "Société F|Société E|Société D");
}

// ---------- 18 novembre : « choisir les expériences pertinentes », plus « toutes » (CV LHH à 8 postes, page 2) ----------
const E = (id: string, company: string, role: string, start: string, end: string, ...acts: string[]) => ({ id, company, role, location: "", start, end, achievements: acts.map(A) });
const eight = [
  E("e1", "SNCF", "Assistante cheffe de projet numérique", "sept. 2024", "sept. 2025", "Piloter des projets de transformation numérique en Agile Scrum", "Support technique de niveau 3 via le ticketing interne"),
  E("e2", "Bpifrance", "Assistante cheffe de projet pilotage opérationnel", "mars 2024", "juin 2024", "Gestion et actualisation de bases de données Excel : importation, vérification, mise à jour"),
  E("e3", "Axens", "Data Coordinator", "sept. 2023", "déc. 2023", "Saisie et mise à jour de données sectorielles dans SAP"),
  E("e4", "Orano", "Chargée de projet digital", "sept. 2022", "sept. 2023", "Analyse et optimisation des flux de données avec Power BI et SQL", "Administration du CRM Microsoft Dynamics 365", "Mise en place de protocoles d'évaluation et d'amélioration de la qualité des données"),
  E("e5", "Studio Théâtre ESCA", "Agent d'accueil", "oct. 2021", "mars 2022", "Accueil et conseil des spectateurs ; annonces devant le public"),
  E("e6", "Vortech", "Assistante administrative", "juin 2021", "août 2021", "Reporting de données sur Excel et résolution d'anomalies"),
  E("e7", "Croix-Rouge française", "Agent d'accueil", "juin 2021", "juil. 2021", "Vérification et mise à jour des dossiers patients sur Doctolib ; saisie informatique"),
  E("e8", "Guevalt", "Gestionnaire de base de données", "mars 2021", "avr. 2021", "Réception, traitement et contrôle de données de vaccination, avec vérification des informations manquantes"),
];
const hers = { ...profile, experiences: eight } as unknown as Profile;
const lhh = offerWords({ title: "Gestionnaire Base de données", domain: "Industrie", keywords: ["ERP", "base de données", "qualité des données", "doublons", "import/export", "nomenclatures", "gammes"], must_have: ["Maîtrise d'un ERP", "Bonne connaissance des bases de données"], missions: ["Créer et mettre à jour les données de base dans l'ERP", "Contrôler la qualité des données et traiter les doublons"] });
const asCv = (p: Profile["experiences"][number]) => exp({ company: p.company, role: p.role, dates: `${p.start} - ${p.end}`, bullets: p.achievements.map((a) => a.text) });
{
  // L'IA a écrit les 8 postes (ce que le profil enrichi du 17 novembre lui faisait faire) : le CV est ramené à MAX, les moins proches de l'offre partent
  const r = enforceFacts(base({ headline: "Gestionnaire Base de données", experiences: eight.map(asCv) }), hers, lhh);
  const names = r.cv.experiences.map((e) => e.company);
  ok(`8 postes écrits : ${MAX_EXPERIENCES} au plus sur le CV`, r.cv.experiences.length === MAX_EXPERIENCES, names.join());
  ok("la plus récente (SNCF) est toujours là", names.includes("SNCF"));
  ok("les postes proches de l'offre restent : Bpifrance (bases de données), Orano (qualité des données), Guevalt (même intitulé)", ["Bpifrance", "Orano", "Guevalt"].every((c) => names.includes(c)), names.join());
  ok("les accueils (ESCA, Croix-Rouge) partent", !names.includes("Studio Théâtre ESCA") && !names.includes("Croix-Rouge française"), names.join());
  ok("le rapport nomme ce qui est laissé de côté", r.report.droppedExperiences.length === 3 && r.report.droppedExperiences.some((x) => x.startsWith("Studio Théâtre ESCA")));
  ok("une note le dit à la personne (elles restent dans le profil)", r.cv.notes_for_candidate.some((n) => /laissé de côté 3 expériences/.test(n) && /Studio Théâtre ESCA/.test(n) && /dans ton profil/.test(n)), r.cv.notes_for_candidate.join(" | "));
  ok("ordre du plus récent au plus ancien conservé", r.cv.experiences[0].company === "SNCF");
  const again = enforceFacts(r.cv, hers, lhh);
  ok("deuxième passage : rien ne change, pas de note en double", JSON.stringify(again.cv) === JSON.stringify(r.cv) && again.report.droppedExperiences.length === 0);
  ok("toutes les formations restent (règle inchangée)", r.cv.education.length === 3);
}
{
  // L'IA a bien choisi (4 postes pertinents) : le code ne touche à rien, aucune note
  const chosen = [eight[0], eight[1], eight[3], eight[7]].map(asCv);
  const r = enforceFacts(base({ headline: "Gestionnaire Base de données", experiences: chosen }), hers, lhh);
  ok("4 postes choisis par l'IA : rien n'est ajouté ni retiré", r.cv.experiences.map((e) => e.company).join("|") === "SNCF|Bpifrance|Orano|Guevalt" && r.report.missingExperiences.length === 0 && r.report.droppedExperiences.length === 0);
  ok("« Contrôler mes CV » : un CV volontairement allégé (4 sur 8) n'est plus signalé « expérience absente »", checkCv(base({ headline: "Gestionnaire Base de données", experiences: chosen }), hers).every((i) => !i.text.startsWith("Expérience absente")));
}
{
  // L'IA a oublié la plus récente et n'a gardé qu'un vieux poste : la SNCF revient, le CV est complété par les postes les plus proches de l'offre
  const r = enforceFacts(base({ headline: "Gestionnaire Base de données", experiences: [asCv(eight[7])] }), hers, lhh);
  const names = r.cv.experiences.map((e) => e.company);
  ok(`la plus récente oubliée revient et le CV monte à ${MIN_EXPERIENCES} postes`, names.includes("SNCF") && names.includes("Guevalt") && names.length === MIN_EXPERIENCES, names.join());
  ok("le troisième est le plus proche de l'offre (Bpifrance ou Orano), pas un accueil", names.some((c) => c === "Bpifrance" || c === "Orano") && !names.includes("Studio Théâtre ESCA") && !names.includes("Croix-Rouge française"), names.join());
}
{
  // Entreprise inconnue du profil : jamais retirée par le plafond (elle est signalée), la plus récente jamais retirée non plus
  const withUnknown = [...eight.map(asCv), exp({ company: "Société Inconnue", role: "Directrice", dates: "2020 - 2021", bullets: ["x"] })];
  const r = enforceFacts(base({ headline: "Gestionnaire Base de données", experiences: withUnknown }), hers, lhh);
  ok("une entreprise inconnue reste (signalée), la SNCF aussi", r.cv.experiences.some((e) => e.company === "Société Inconnue") && r.cv.experiences.some((e) => e.company === "SNCF") && r.report.unknownCompanies.length === 1);
}
{
  const full2 = { ...profile, experiences: [{ ...orano, start: "", end: "" }, sncf] } as unknown as Profile;
  const r = enforceFacts(base({ experiences: [exp({ dates: "" })] }), full2);
  ok("dates illisibles dans le profil : l'expérience est remise quand même, ordre d'origine conservé, sans planter", r.cv.experiences.length === 2);
}

// ---------- Branchement ----------
const ai = readFileSync("lib/ai.ts", "utf8");
ok("consigne de l'IA : les expériences pertinentes ET celles qui s'en rapprochent, 3 à 5, la plus récente toujours, plus « TOUTES les expériences »", ai.includes("experiences : les expériences du profil les plus pertinentes pour l'offre ET celles qui s'en rapprochent") && ai.includes("3 à 5 expériences") && ai.includes("figure TOUJOURS") && !ai.includes("experiences : TOUTES les expériences"));
ok("generateCv remet les faits du profil AVANT le garde-fou et la pose des liens, avec les mots de l'offre", ai.includes('import { enforceFacts, offerWords } from "./cv-facts"') && ai.indexOf("enforceFacts(cv, profile, offerWords(offer))") > -1 && ai.indexOf("enforceFacts(cv, profile, offerWords(offer))") < ai.indexOf("attachLinks(cleanCvText(checked)"));
ok("règle de rédaction : toutes les formations, intitulés et dates du profil mot pour mot", ai.includes("education : TOUTES les formations du profil") && ai.includes("mot pour mot"));

// ---------- Langues : comparées par le sens, avec les vrais textes du profil et des CV de Juliana (6 novembre) ----------
{
  const hers = [{ name: "Français", level: "Langue maternelle" }, { name: "Anglais", level: "B1-B2 (intermédiaire)" }] as Profile["languages"];
  ok("niveau du profil « B1-B2 (intermédiaire) » : pas de parenthèses imbriquées sur le CV", languagesText(hers) === "Français (langue maternelle) · Anglais (B1-B2)", languagesText(hers));
  ok("cleanLevel : glose retirée, mot de niveau en minuscule, B1-B2 intact", cleanLevel("B1-B2 (intermédiaire)") === "B1-B2" && cleanLevel("Langue maternelle") === "langue maternelle" && cleanLevel("B2") === "B2" && cleanLevel("") === "" && cleanLevel(undefined) === "" && cleanLevel("(courant)") === "courant" && cleanLevel("Courant (C1)") === "courant, C1");
  const same = ["Français (langue maternelle) · Anglais (B1-B2)", "Français (maternel) · Anglais (B1\u2011B2)", "Français (maternelle) · Anglais (B1-B2)", "Français (Langue maternelle) · Anglais (B1-B2 (intermédiaire))", "Anglais B1-B2, Français natif", "Français : langue maternelle ; Anglais : B1-B2"];
  ok("les 5 façons dont ses CV écrivent les mêmes langues : aucun écart", same.every((t) => sameLanguages(t, hers)), same.filter((t) => !sameLanguages(t, hers)).join(" | "));
  const diff = ["Français (maternel) · Anglais (C1)", "Français (maternel)", "Français · Anglais (B1-B2)", "Français (maternel) · Anglais (B1-B2) · Espagnol (B2)", "Français (maternel) · Anglais (courant)", "Anglais (B1-B2)", ""];
  ok("autre niveau, langue absente, langue en trop, niveau manquant ou inventé : écart", diff.every((t) => !sameLanguages(t, hers)), diff.filter((t) => sameLanguages(t, hers)).join(" | "));
  ok("profil sans langue : seul un CV sans langue est conforme", sameLanguages("", []) && !sameLanguages("Anglais (B2)", []) && sameLanguages("", undefined as unknown as Profile["languages"]));
  ok("deux langues de même nom préfixe (Chinois / Chinois mandarin) : pas de confusion", sameLanguages("Chinois (B1) · Chinois mandarin (C1)", [{ name: "Chinois", level: "B1" }, { name: "Chinois mandarin", level: "C1" }] as Profile["languages"]));
  const r = enforceFacts(base({ languages: "Français (maternel) · Anglais (B1‑B2)" }), { ...profile, languages: hers } as unknown as Profile);
  ok("enforceFacts : même sens = pas d'écart signalé, texte du CV remis propre", !r.report.languages && r.cv.languages === "Français (langue maternelle) · Anglais (B1-B2)", r.cv.languages);
}

done();
