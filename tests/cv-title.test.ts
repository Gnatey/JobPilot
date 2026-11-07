// Titre du CV = intitulé de l'offre (règle de profil de Juliana), testé sur les vrais intitulés de son export du 6 novembre.
import { cleanOfferTitle, alignHeadline, sameTitle, isSeniorTitle, withOfferTitle, MAX_TITLE } from "../lib/cv-title";
import { ok, done } from "./helpers";

const c = cleanOfferTitle;
// Le cas signalé
ok("Klesia : « Administrateur base de données H/F » devient « Administrateur base de données »", c("Administrateur base de données H/F") === "Administrateur base de données");
const k = alignHeadline("Data Engineer", "Administrateur base de données H/F");
ok("le CV Klesia ne dit plus « Data Engineer » : le titre de l'IA est remplacé par celui de l'offre", k.aligned && k.headline === "Administrateur base de données");

// Intitulés réels (export du 6 novembre)
const REAL: [string, string][] = [
  ["Data analyst (H/F)", "Data analyst"],
  ["Data Analyst – H/F", "Data Analyst"],
  ["Data analyst F/H", "Data analyst"],
  ["Data Analyst Full Remote (France entière)", "Data Analyst"],
  ["Data Analyst - Data Services Factory (F/H)", "Data Analyst"],
  ["Business Analyst - Transport - Île-de-France (H/F)", "Business Analyst"],
  ["Business Analyst - Services Publics - Nantes", "Business Analyst"],
  ["Business Analyst Risk H/F", "Business Analyst Risk"],
  ["Data Engineer / IA / Ingénieur Data (H/F)", "Data Engineer"],
  ["Data Engineer / Power Platform", "Data Engineer"],
  ["Chargé d'études statistiques Junior H/F", "Chargé d'études statistiques Junior"],
  ["Gestionnaire de Données Industrielles ERP H/F", "Gestionnaire de Données Industrielles ERP"],
  ["Ingénieur(e) en gestion des données de santé", "Ingénieur(e) en gestion des données de santé"],
  ["Consultant.e Business Intelligence F/H", "Consultant.e Business Intelligence"],
  ["Chargé(e) de projets transversaux – Direction générale", "Chargé(e) de projets transversaux"],
  ["Chargé.e de Support et Projets SIRH - CEGID HR (Talentsoft)/Neocase F/H", "Chargé.e de Support et Projets SIRH"],
  ["Consultant Junior IT M&A - Tech & IT Due Diligence et PMI F/H", "Consultant Junior IT M&A"],
  ["Chef de projet en transformation numérique - Industrie H/F", "Chef de projet en transformation numérique"],
  ["Chargé(e) de gestion et qualité des données clients H/F", "Chargé(e) de gestion et qualité des données clients"],
  ["Business Analyst SAP QM (H/F)", "Business Analyst SAP QM"],
  ["Administrateur Bases de Données H/F", "Administrateur Bases de Données"],
  ["Gestionnaire Base de Données", "Gestionnaire Base de Données"],
  ["Product Owner H/F", "Product Owner"],
];
for (const [raw, want] of REAL) ok(`« ${raw} » donne « ${want} »`, c(raw) === want, c(raw));
ok("un titre court coupé au séparateur ne devient pas un mot seul (« Data - AI Analyst » reste entier)", c("Data - AI Analyst") === "Data - AI Analyst");
ok("tout en majuscules : mis en minuscules et majuscules, sans majuscule à « de »", c("ADMINISTRATEUR BASE DE DONNÉES H/F") === "Administrateur Base de Données");
ok("H/F/X, M/F, F/H et (H/F) sont retirés ; un mot qui contient ces lettres n'est jamais touché", c("Analyste BI M/F") === "Analyste BI" && c("Technicien H/F/X") === "Technicien" && c("Chef de projet HF") === "Chef de projet HF" && c("Responsable Fiabilité Hydraulique") === "Responsable Fiabilité Hydraulique");
ok("vide, trop court ou trop long : rien (le titre de l'IA est gardé)", c("") === "" && c(null) === "" && c("H/F") === "" && c("A".repeat(MAX_TITLE + 1)) === "" && c("Analyste data " + "très long ".repeat(10)) === "");

// Niveau senior : on ne s'intitule pas senior
ok("« Data Engineer Senior » n'est pas copié sur un CV junior", !alignHeadline("Data Analyst", "Data Engineer Senior H/F").aligned && alignHeadline("Data Analyst", "Data Engineer Senior H/F").headline === "Data Analyst" && alignHeadline("Data Analyst", "Data Engineer Senior H/F").reason === "senior");
ok("senior, sénior, confirmé, lead, expert, directeur reconnus ; junior non ; « seniorité » dans un mot non", ["Dev Senior", "Analyste Sénior", "Data Engineer confirmé", "Tech Lead Data", "Expert BI", "Directeur data"].every(isSeniorTitle) && !isSeniorTitle("Analyste BI Junior") && !isSeniorTitle("Chargé de projet leadership"));
ok("offre sans titre : titre de l'IA gardé", alignHeadline("Business Analyst", "").headline === "Business Analyst" && alignHeadline("Business Analyst", undefined).reason === "no-title");
ok("une IA sans titre : le titre de l'offre est mis", alignHeadline("", "Data analyst (H/F)").headline === "Data analyst" && alignHeadline(undefined, "Data analyst (H/F)").aligned);

// Le contrôle des CV déjà enregistrés
ok("même métier : singulier et pluriel, junior en plus, analyste / analyst", sameTitle("Administrateur Base de Données", "Administrateur Bases de Données H/F") && sameTitle("Data Analyst", "Data Analyst Junior H/F") && sameTitle("Analyste Data", "Data Analyst"));
ok("autre métier : Data Engineer contre Administrateur base de données, Reporting Analyst contre Chargé d'études", !sameTitle("Data Engineer", "Administrateur base de données H/F") && !sameTitle("Reporting Analyst", "Chargé d'études statistiques Junior H/F") && !sameTitle("Data Analyst", "Data Engineer H/F"));
ok("un titre vide ne correspond à rien", !sameTitle("", "Data Analyst") && !sameTitle("Data Analyst", null));
// ---------- Branchement dans la génération ----------
import { readFileSync } from "node:fs";
{
  const ai = readFileSync("lib/ai.ts", "utf8");
  const gen = ai.slice(ai.indexOf("export async function generateCv"), ai.indexOf("/* ---------- 4."));
  ok("generateCv aligne le titre sur l'offre AVANT les faits du profil et le garde-fou", gen.indexOf("alignHeadline(cv.headline, offer.title)") > 0 && gen.indexOf("alignHeadline(") < gen.indexOf("enforceFacts(cv, profile)"));
  ok("le prompt ne laisse plus l'IA choisir le titre d'une cible quand l'offre lui paraît éloignée", /Ne le remplace JAMAIS par le titre d'une cible/.test(gen) && !/s'il correspond au profil/.test(gen));
  ok("offre de niveau senior : une note le dit à la personne", /demande un niveau senior/.test(gen) && /notes_for_candidate/.test(gen));
}

// ---------- CV réutilisé pour une autre offre ----------
{
  const src = { headline: "Data Engineer", summary: "x", experiences: [{ company: "Orano" }] };
  const out = withOfferTitle(src, "Administrateur base de données H/F");
  ok("CV réutilisé : le titre devient celui de la nouvelle offre, le reste est copié tel quel", out.headline === "Administrateur base de données" && out.summary === "x" && out.experiences === src.experiences);
  ok("le CV source n'est jamais modifié", src.headline === "Data Engineer" && out !== src);
  ok("offre senior ou sans titre : le CV est repris sans changement", withOfferTitle(src, "Data Engineer Senior H/F") === src && withOfferTitle(src, "") === src && withOfferTitle(src, null) === src);
  ok("contenu absent : pas d'erreur", withOfferTitle(null as never, "Data Analyst") === null);
  const route = readFileSync("app/api/offers/[id]/generate/route.ts", "utf8");
  ok("la route de génération applique le titre de l'offre aux CV réutilisés", /content: withOfferTitle\(src\.content as CvDoc, offer\.extracted\?\.title \|\| offer\.title\)/.test(route));
}

done();
