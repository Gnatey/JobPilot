// Lettre de motivation : un chiffre que ni le profil ni l'annonce ne contiennent est signalé (l'IA en ajoute parfois « avec le résultat »).
import { readFileSync } from "node:fs";
import { guardLetter } from "../lib/letter-guard";
import type { Profile } from "../lib/types";
import { ok, done } from "./helpers";

const profile = {
  identity: { name: "Test", email: "test@exemple.fr", phone: "06 12 34 56 78" },
  preferences: { daily_quota: 15, departments: ["93", "75"], weekly_goal: 7 },
  rules: ["Ne jamais dépasser 2 pages"],
  todo: [{ id: "t1", question: "Quel est ton chiffre sur 12 mois ?" }],
  experiences: [
    {
      id: "8f14e45f-ceea-4d7a-9c3d-123456789040", company: "Orano", role: "Alternant Data Analyst", start: "2022-09", end: "2024-08",
      achievements: [
        { text: "Développer des tableaux de bord Power BI pour les Business Unit et le CODIR", tags: ["Power BI"] },
        { text: "Automatiser des pipelines SQL ; réduction du temps de reporting de 30 %", tags: ["SQL"] },
        { text: "Analyser 3,5 millions de lignes de ventes", tags: [] },
      ],
    },
  ],
  projects: [{ name: "Portfolio", description: "Site personnel présentant 5 projets data", tags: [] }],
} as unknown as Profile;

const offer = { title: "Data Analyst", company: "Acme", location: "Paris 75009", seniority: "2 ans d'expérience minimum", must_have: ["SQL", "Power BI"], missions: ["Suivre 12 indicateurs commerciaux"] };

const run = (paragraphs: string[], have: string[] = []) => guardLetter(paragraphs, profile, offer, have);

// ---------- Le chiffre inventé ----------
{
  const r = run(["Chez Orano, j'ai bâti un tableau de bord qui a fait gagner 40 % de temps aux équipes. Cela m'a appris à écouter les besoins."]);
  ok("un chiffre absent du profil et de l'annonce est signalé", r.notes.length === 1 && r.report.numbers.length === 1 && r.report.numbers[0].numbers[0] === "40", JSON.stringify(r.report));
  ok("la note cite la phrase exacte (pour la retrouver dans la lettre) et dit quoi faire", r.notes[0].includes("« 40 »") && r.notes[0].includes("j'ai bâti un tableau de bord qui a fait gagner 40 % de temps aux équipes.") && r.notes[0].includes("À vérifier ou à retirer"), r.notes[0]);
  ok("seule la phrase concernée est citée, pas le paragraphe entier", !r.notes[0].includes("Cela m'a appris"));
}

// ---------- Ce qui est connu ----------
ok("un chiffre du profil est connu (30 %, 3,5 millions, 5 projets)", run(["J'ai réduit le temps de reporting de 30 %.", "J'ai analysé 3.5 millions de lignes de ventes.", "Mon portfolio présente 5 projets data."]).notes.length === 0);
ok("un chiffre de l'annonce est connu (2 ans, 12 indicateurs, 75009)", run(["Vos 12 indicateurs m'intéressent : j'ai plus de 2 ans de pratique à Paris 75009."]).notes.length === 0);
ok("une lettre sans chiffre ne produit aucune note", run(["Je souhaite rejoindre votre équipe.", "Je reste disponible pour un échange."]).notes.length === 0);

// ---------- Les chiffres qui ne prouvent rien (même défaut que celui du CV, « 15 % » du 6 novembre) ----------
{
  const r = run(["Mon travail a fait économiser 15 % du budget.", "J'ai suivi 93 clients.", "J'ai passé 7 ans dans la data.", "Elle m'a coûté 12 mois d'efforts."]);
  const flagged = r.report.numbers.flatMap((x) => x.numbers);
  ok("quota du jour (15), département (93), objectif (7), numéro de téléphone, règle, tâche : jamais une preuve", flagged.includes("15") && flagged.includes("93") && flagged.includes("7"), JSON.stringify(flagged));
  ok("le « 12 » de l'annonce reste connu même s'il est aussi dans une tâche", !flagged.includes("12"));
}

// ---------- Plusieurs chiffres, plusieurs phrases ----------
{
  const r = run(["J'ai livré 8 rapports en 4 semaines. J'ai aussi formé 20 collègues."]);
  ok("deux chiffres dans une phrase : une seule note, au pluriel", r.notes.length === 2 && r.notes[0].includes("les chiffres « 8 », « 4 »") && r.notes[0].includes("ne figurent"), r.notes.join(" | "));
  ok("deux phrases fautives : une note chacune", r.report.numbers.length === 2 && r.notes[1].includes("« 20 »"));
}

// ---------- Détails ----------
ok("les remarques déjà écrites par l'IA ne sont pas répétées", (() => {
  const first = run(["J'ai gagné 40 % de temps."]);
  return run(["J'ai gagné 40 % de temps."], first.notes).notes.length === 0;
})());
ok("une phrase très longue est coupée dans la note, sans casser un mot", (() => {
  const long = `J'ai mené ${"un projet très ambitieux ".repeat(12)}pendant 99 jours.`;
  const n = run([long]).notes[0];
  const quoted = n.slice(n.indexOf("(« ") + 3, n.indexOf(" »). À"));
  return quoted.length <= 145 && quoted.endsWith("…");
})());
ok("paragraphes vides ou absents : aucune erreur", run([]).notes.length === 0 && run(["", "   "]).notes.length === 0 && guardLetter(undefined as unknown as string[], profile, undefined).notes.length === 0);
ok("la lettre n'est jamais modifiée : le garde-fou ne rend que des remarques", Object.keys(run(["X 40"])).sort().join() === "notes,report");

// ---------- Branchement ----------
const ai = readFileSync("lib/ai.ts", "utf8");
const gen = ai.slice(ai.indexOf("export async function generateLetter"), ai.indexOf("/* ---------- 5. Préparation"));
ok("generateLetter appelle guardLetter sur les paragraphes de l'IA, avec le profil et l'annonce, et ajoute les notes à celles de l'IA", /guardLetter\(raw\.paragraphs[^)]*profile, offer, have\)/.test(gen) && gen.includes("notes_for_candidate: [...have, ...guard.notes]"));
ok("le prompt ne demande plus « le résultat » sans condition : seulement s'il est écrit dans le profil", gen.includes("le résultat SEULEMENT s'il est écrit dans le profil") && !gen.includes("ce que j'ai fait, le résultat)"));
ok("les notes de la lettre s'affichent dans la case « À vérifier avant d'envoyer »", readFileSync("components/document-view.tsx", "utf8").includes("notes_for_candidate"));

done();
