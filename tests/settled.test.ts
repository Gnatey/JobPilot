// Mémoire des questions réglées de « À compléter » : une question réglée ne revient pas au prochain diagnostic,
// et cette mémoire ne devient jamais un « chiffre connu » du profil ni du texte envoyé aux IA qui rédigent.
// Et : les exemples du diagnostic n'ont pas de chiffre inventé, les repères « Page 1 of 2 » des exports ne sont pas lus comme du CV.
import { readFileSync } from "node:fs";
import { forAi } from "../lib/ai";
import { profileText } from "../lib/cv-guard";
import { EMPTY_PROFILE } from "../lib/empty-profile";
import { addSettled, applyOps, dropSettled, isSettled, mergeSettled, numbersCovered, SETTLED_MAX, settledForAi, stripPageMarks } from "../lib/profile-fix";
import type { Profile } from "../lib/types";
import { ok, done } from "./helpers";

const Q = "Le Master est indiqué 2023-2025 alors que le CV mentionne des expériences en 2024-2025 : confusion entre étudiant et professionnel ?";

// ---- La mémoire
const one = addSettled(undefined, Q, "C'était une alternance.");
ok("une question réglée est notée avec sa réponse", one.length === 1 && one[0].answer === "C'était une alternance." && one[0].question.startsWith("Le Master"));
ok("« Fait » sans réponse : notée quand même", addSettled([], "Quel volume ?", "").length === 1);
ok("une question vide n'est pas notée", addSettled(undefined, "   ", "x").length === 0 && addSettled(undefined, "", "x").length === 0);
ok("la même question reformulée à l'identique (accents, majuscules, ponctuation) ne fait pas de doublon, la plus récente gagne",
  (() => { const l = addSettled(one, "LE MASTER est indiqué 2023 2025 alors que le CV mentionne des expériences en 2024-2025 : confusion entre étudiant et professionnel", "Oui, alternance, diplôme en 2025."); return l.length === 1 && l[0].answer.startsWith("Oui"); })());
ok("on reconnaît une question réglée sans tenir compte des accents ni de la casse", isSettled(one, Q.toUpperCase()) && isSettled(one, Q.normalize("NFD").replace(/[̀-ͯ]/g, "")) && !isSettled(one, "Autre question") && !isSettled(undefined, Q));
ok("la liste « à poser » perd ce qui est réglé", JSON.stringify(dropSettled([Q, "Quel volume de données ?"], one)) === JSON.stringify(["Quel volume de données ?"]));
ok("sans mémoire, la liste ne change pas", dropSettled(["a", "b"], undefined).length === 2 && dropSettled(["a"], []).length === 1);

let many = addSettled(undefined, "Question 0", "r");
for (let i = 1; i < SETTLED_MAX + 8; i++) many = addSettled(many, `Question numéro ${i} sur autre chose`, "r");
ok(`la mémoire garde les ${SETTLED_MAX} plus récentes`, many.length === SETTLED_MAX && !isSettled(many, "Question 0") && isSettled(many, `Question numéro ${SETTLED_MAX + 7} sur autre chose`));
const long = addSettled(undefined, "q ".repeat(300), "r ".repeat(300));
ok("question et réponse sont coupées (200 signes)", long[0].question.length <= 200 && long[0].answer.length <= 200);

const a = addSettled(undefined, "Q1", "ancienne");
const b = addSettled(addSettled(undefined, "Q1", "récente"), "Q2", "x");
const m = mergeSettled(a, b);
ok("deux mémoires s'additionnent sans rien perdre, la plus récente l'emporte", m.length === 2 && m.find((s) => s.question === "Q1")?.answer === "récente" && isSettled(m, "Q2"));
ok("fusionner avec rien ne casse pas", mergeSettled(undefined, undefined).length === 0 && mergeSettled(a, undefined).length === 1);
ok("ce que l'IA lit : question et réponse, ou « marquée comme faite »", (() => { const v = settledForAi([{ question: "Q", answer: "" }, { question: "R", answer: "oui" }]); return v[0].reponse === "(marquée comme faite)" && v[1].reponse === "oui"; })());

// ---- Elle ne devient jamais un chiffre connu, ni un texte envoyé aux IA qui rédigent
const profile: Profile = {
  ...EMPTY_PROFILE,
  experiences: [{ id: "e1", company: "SNCF", role: "Assistante cheffe de projet", type: "Alternance", start: "Sept 2024", end: "Sept 2025", achievements: [{ text: "Gérer le portail collaboratif", tags: [] }] }],
  settled: addSettled(undefined, "Quel est le taux d'erreur ?", "Environ 98 % de données conformes, 15 % de gain."),
};
ok("la réponse réglée ne rend pas un « 98 % » ou « 15 % » inventé connu pour le CV et la lettre", !profileText(profile).includes("98") && !numbersCovered("98 %", profileText(profile)) && !numbersCovered("15 %", profileText(profile)));
const sent = JSON.stringify(forAi(profile));
ok("le profil envoyé aux IA qui rédigent ne contient pas la mémoire", !sent.includes("settled") && !sent.includes("98") && sent.includes("SNCF"));
ok("appliquer une réécriture garde la mémoire", applyOps(profile, [{ op: "add", exp_id: "e1", text: "Rédigé la documentation" }]).settled?.length === 1);

// ---- Câblage (sources)
const ai = readFileSync("lib/ai.ts", "utf8");
ok("le diagnostic lit la mémoire (consigne + bloc DÉJÀ TRANCHÉ)", ai.includes("DÉJÀ TRANCHÉ PAR LA PERSONNE") && /déjà tranché : la personne a déjà répondu/.test(ai));
ok("l'audit lit la mémoire (deja_tranche)", /deja_tranche: settledForAi\(profile\.settled\)/.test(ai) && ai.includes('"deja_tranche" (s\'il est présent)'));
ok("les exemples du diagnostic n'ont pas de chiffre inventé ([chiffre])", ai.includes("mets [chiffre] à la place") && ai.includes("chiffres remplacés par [chiffre]"));
const job = readFileSync("lib/cv-job.ts", "utf8");
ok("un nouveau diagnostic garde la mémoire et ne remet pas dans la liste ce qui est réglé", /proposed\.settled = current\.settled/.test(job) && /dropSettled\(/.test(job));
const apply = readFileSync("app/api/cv/apply/route.ts", "utf8");
ok("appliquer un ancien diagnostic ne fait pas oublier ce qui a été réglé depuis", /mergeSettled\(current\.settled, proposed\.settled\)/.test(apply) && /dropSettled\(/.test(apply));
const screen = readFileSync("components/todo-answer.tsx", "utf8");
ok("« C'est réglé » et « Fait » notent la question ; « Je ne sais pas » la retire seulement",
  /onChange\(settle\(t, draft\.answer\)\)[^]*C'est réglé/.test(screen) && /onChange\(settle\(t, isOpen \? draft\.answer : ""\)\)[^]*>Fait</.test(screen) && /onChange\(removeTodo\(t\)\); reset\(\); toast\("Question retirée : tu pourras la reprendre/.test(screen));
ok("« Appliquer » note la question quand la préoccupation est réglée", /draft\.settled \? settle\(t, draft\.answer, applied\) : removeTodo\(t, applied\)/.test(screen));
const audit = readFileSync("components/profile-audit.tsx", "utf8");
ok("« Faire le point » ne remet pas dans la liste une question réglée", /!isSettled\(next\.settled, q\)/.test(audit));

// ---- Repères de pagination
ok("« Tab 1 Page 1 of 2 » en tête est retiré", stripPageMarks("Tab 1 Page 1 of 2\nJuliana NIAPOH\nData Analyst") === "Juliana NIAPOH\nData Analyst");
ok("« Page 2 of 2 » en pied est retiré", stripPageMarks("Excel, SQL\nPage 2 of 2") === "Excel, SQL");
ok("« Page 1 sur 2 » et « Page 1/2 » aussi", stripPageMarks("Page 1 sur 2\nA\nPage 2/2") === "A");
ok("un repère collé à la fin d'une ligne de texte est retiré, la ligne reste", stripPageMarks("Gestion de projet Page 1 of 2") === "Gestion de projet");
ok("les lignes vides du CV sont gardées, le reste du texte n'est pas touché", stripPageMarks("A\n\nB : page de garde, 2 pages\nC") === "A\n\nB : page de garde, 2 pages\nC");
ok("un CV sans repère ressort identique", (() => { const t = "Juliana\nSNCF - Alternance - 2024"; return stripPageMarks(t) === t; })());
const diag = readFileSync("app/api/cv/diagnose/route.ts", "utf8");
ok("les CV déposés et collés passent par stripPageMarks", (diag.match(/stripPageMarks\(/g) ?? []).length === 2);

done();
