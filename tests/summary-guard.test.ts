// Résumé du CV : une compétence que le profil ne montre qu'en formation n'est pas présentée comme un acquis de métier (cas de Juliana, 11 novembre).
import { readFileSync } from "node:fs";
import { checkSummary, summaryNotes } from "../lib/summary-guard";
import { checkCv } from "../lib/cv-check";
import type { CvDoc, Profile } from "../lib/types";
import { ok, done } from "./helpers";

const profile = {
  identity: { name: "Juliana N.", email: "j@example.org", links: [] },
  targets: [{ id: "t1", title: "Data Scientist", pitch: "" }],
  experiences: [
    { id: "e1", company: "ORANO", role: "Data Analyst", type: "Alternance", start: "sept. 2023", end: "sept. 2024", achievements: [{ text: "Conçu des tableaux de bord Power BI pour la Business Unit", tags: ["Power BI", "SQL"] }, { text: "Administré le CRM et construit des pipelines SQL", tags: ["CRM"] }] },
    { id: "e2", company: "SNCF", role: "Chef de projet MOA", type: "Alternance", start: "sept. 2024", end: "sept. 2025", achievements: [{ text: "Piloté le backlog Agile / Scrum", tags: ["Scrum"] }] },
  ],
  education: [{ degree: "Master Data Management", school: "PSB", details: ["NLP, LLM, machine learning supervisé et non supervisé"] }, { degree: "Bachelor E-commerce", school: "PSB" }],
  projects: [{ name: "Tracker Power BI", description: "Suivi de candidatures", tags: ["Power BI", "Streamlit"] }],
  skills: { Langages: ["Python", "SQL"], Analyse: ["Power BI", "Streamlit"] },
  certifications: [], languages: [], interests: [], preferences: { contracts: [] }, rules: [], todo: [],
} as unknown as Profile;

// Le cas signalé : résumé généré pour l'offre « Data scientist CDD » de BPCE
const summary = "Data Scientist avec expertise Python, SQL et machine learning, forte expérience en conception de pipelines de données et en optimisation de flux. Maîtrise des outils d'analyse (Power BI, Streamlit) et du traitement du langage naturel. Disponible immédiatement.";
const r = checkSummary(summary, profile);
ok("machine learning et langage naturel : vus seulement en formation, signalés", r.school.includes("machine learning") && r.school.includes("traitement du langage naturel (NLP)") && r.school.length === 2, JSON.stringify(r));
ok("Python, SQL, Power BI, Streamlit : démontrés par une expérience, un projet ou les compétences, jamais signalés", !r.school.some((x) => /python|sql|power bi|streamlit/i.test(x)) && r.absent.length === 0);
const notes = summaryNotes(r);
ok("une seule note, qui cite les deux mots et dit « aucune de tes expériences »", notes.length === 1 && /machine learning/.test(notes[0]) && /langage naturel/.test(notes[0]) && /aucune de tes expériences/.test(notes[0]), notes.join(" | "));

// Une expérience qui le cite : rien à dire
const withWork = { ...profile, experiences: [{ ...profile.experiences[0], achievements: [{ text: "Entraîné un modèle de machine learning supervisé pour prédire le churn", tags: [] }] }, profile.experiences[1]] } as unknown as Profile;
ok("une expérience qui cite le machine learning : plus de signalement pour ce mot", !checkSummary(summary, withWork).school.includes("machine learning") && checkSummary(summary, withWork).school.includes("traitement du langage naturel (NLP)"));

// Compétence nulle part dans le profil
const none = { ...profile, education: [{ degree: "Master Data Management", school: "PSB" }] } as unknown as Profile;
const r2 = checkSummary("Spécialiste du deep learning et des LLM.", none);
ok("un mot que le profil ne dit nulle part est « absent », pas « formation »", r2.absent.includes("deep learning") && r2.absent.includes("LLM") && r2.school.length === 0, JSON.stringify(r2));
ok("la note d'un mot absent dit « pas dans ton profil »", summaryNotes(r2).length === 1 && /ne figurent pas dans ton profil/.test(summaryNotes(r2)[0]));

// Pas de faux positifs
ok("résumé sans ces mots : rien", checkSummary("Data Analyst : tableaux de bord Power BI, SQL, Python. Disponible immédiatement.", profile).school.length === 0);
ok("un mot qui contient les lettres (« total », « portail », « fragile ») n'est jamais lu comme TAL, RAG ou NLP", checkSummary("Pilotage du total des portails, base fragile.", none).absent.length === 0);
ok("résumé vide ou absent : rien", checkSummary("", profile).school.length === 0 && checkSummary(undefined, profile).absent.length === 0 && summaryNotes(checkSummary(null, profile)).length === 0);
ok("majuscules, accents et anglais reconnus (Machine Learning, NLP, Apprentissage supervisé)", checkSummary("MACHINE LEARNING et NLP ; apprentissage supervisé", profile).school.length === 2);

// « Contrôler mes CV » : le même constat, en « À relire » (jamais « À corriger »)
const cv = { headline: "Data scientist", summary, experiences: [{ company: "ORANO", role: "Data Analyst", location: "", dates: "sept. 2023 - sept. 2024", bullets: ["Conçu des tableaux de bord Power BI pour la Business Unit"] }], education: [], skills: [], projects: [], certifications: [], languages: "", interests: [], ats_keywords_used: [], notes_for_candidate: [] } as unknown as CvDoc;
const issues = checkCv(cv, profile).filter((i) => /^Résumé/.test(i.text));
ok("Contrôler mes CV : « À relire » avec le résumé", issues.length === 1 && issues[0].level === "read" && /machine learning/.test(issues[0].text), JSON.stringify(issues));

// Branchement dans la génération
{
  const ai = readFileSync("lib/ai.ts", "utf8");
  const gen = ai.slice(ai.indexOf("export async function generateCv"), ai.indexOf("/* ---------- 4."));
  ok("generateCv signale le résumé APRÈS le garde-fou et l'écrit dans notes_for_candidate, sans toucher au texte", gen.indexOf("guardCv(") > 0 && gen.indexOf("summaryNotes(checkSummary(checked.summary, profile))") > gen.indexOf("guardCv(") && /checked\.notes_for_candidate = \[\.\.\.\(checked\.notes_for_candidate \?\? \[\]\), \.\.\.claims\]/.test(gen));
}

done();
