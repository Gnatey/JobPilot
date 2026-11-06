// CV sur mesure : un résultat ou un chiffre que le profil ne dit pas est retiré ou signalé (l'IA en ajoute parfois).
import { readFileSync } from "node:fs";
import { guardCv } from "../lib/cv-guard";
import type { CvDoc, Profile } from "../lib/types";
import { ok, done } from "./helpers";

const profile = {
  identity: { name: "Test", email: "test@exemple.fr" },
  experiences: [
    {
      id: "8f14e45f-ceea-4d7a-9c3d-123456789040", company: "Orano", role: "Alternant Data Analyst", start: "2022-09", end: "2024-08",
      achievements: [
        { text: "Développer des tableaux de bord interactifs sous Power BI (DAX) pour les Business Unit et le CODIR", tags: ["Power BI", "DAX"] },
        { text: "Automatiser des pipelines SQL ; réduction du temps de reporting de 30 %", tags: ["SQL"] },
      ],
    },
    {
      id: "c4ca4238-a0b9-4f23-8a1d-987654321012", company: "SNCF", role: "Alternant Chef de projet", start: "2020-09", end: "2022-08",
      achievements: [{ text: "Piloter le backlog Agile / Scrum et coordonner la MOA et la MOE", tags: ["Scrum"] }],
    },
  ],
  projects: [{ name: "Portfolio", description: "Site personnel présentant 5 projets data", tags: [] }],
} as unknown as Profile;

const cv = (bullets: string[], company = "Orano", notes: string[] = []): CvDoc => ({
  headline: "Data Analyst", summary: "", experiences: [{ company, role: "Alternant", dates: "2022-2024", bullets }],
  education: [], skills: [], projects: [], certifications: [], languages: "", ats_keywords_used: [], notes_for_candidate: notes,
});
const out = (bullets: string[], company?: string) => guardCv(cv(bullets, company), profile);
const first = (r: ReturnType<typeof guardCv>) => r.cv.experiences[0].bullets[0];

// ---------- Le cas signalé : un résultat inventé en fin de puce ----------
const bad = "Développer des tableaux de bord interactifs sous Power BI (DAX) pour le pilotage de la direction, réduisant le temps de reporting";
{
  // Ici le profil ne parle de « temps de reporting » que pour les pipelines SQL : on teste d'abord avec une expérience où le résultat n'existe pas
  const r = out([bad], "SNCF");
  ok("résultat que le profil ne dit pas : retiré en fin de puce", first(r) === "Développer des tableaux de bord interactifs sous Power BI (DAX) pour le pilotage de la direction", first(r));
  ok("le retrait est écrit dans les notes, avec le texte exact (pour le remettre)", r.cv.notes_for_candidate.length === 1 && r.cv.notes_for_candidate[0].includes("« réduisant le temps de reporting »") && r.cv.notes_for_candidate[0].includes("SNCF"));
  ok("le rapport nomme l'entreprise et le texte retiré", r.report.cut.length === 1 && r.report.cut[0].company === "SNCF" && r.report.cut[0].removed === "réduisant le temps de reporting");
}
{
  const r = out(["Automatiser les pipelines SQL du reporting, améliorant la qualité des données."], "SNCF");
  ok("le point final de la puce est conservé", first(r) === "Automatiser les pipelines SQL du reporting." && r.report.cut.length === 1, first(r));
}

// ---------- Un résultat bien présent dans le profil reste ----------
{
  const b = "Automatiser des pipelines SQL, réduisant de 30 % le temps de reporting";
  const r = out([b], "Orano");
  ok("résultat écrit dans le profil (« réduction du temps de reporting de 30 % ») : la puce reste intacte, sans note", first(r) === b && r.cv.notes_for_candidate.length === 0 && r.report.cut.length === 0 && r.report.numbers.length === 0);
}
{
  const b = "Coordonner la MOA et la MOE, assurant le pilotage du backlog Scrum";
  const r = out([b], "SNCF");
  ok("verbe d'effet mais les faits sont dans le profil (pilotage, backlog, Scrum) : rien n'est touché", first(r) === b && r.cv.notes_for_candidate.length === 0);
}
{
  const r = out(["Coordonner la MOA et la MOE, assurant le suivi du budget et des délais"], "SNCF");
  ok("même verbe, mais « budget » et « délais » n'existent pas dans le profil : retiré", r.report.cut.length === 1 && first(r) === "Coordonner la MOA et la MOE", first(r));
}

// ---------- Prudence : on ne coupe pas ce qui est mêlé au reste de la phrase ----------
{
  const b = "Développer des tableaux de bord, améliorant la lisibilité, sous Power BI (DAX) pour le CODIR";
  const r = out([b], "SNCF");
  ok("résultat inventé au milieu de la phrase (virgule, parenthèse) : la puce n'est PAS coupée (on ne perd pas l'outil), mais signalée", first(r) === b && r.report.cut.length === 0 && r.report.flagged.length === 1 && r.cv.notes_for_candidate[0].includes("À vérifier ou à retirer"));
}
{
  const r = out(["Analyser, permettant des économies"], "SNCF");
  ok("coupe qui ne laisserait presque rien : la puce reste, signalée", first(r) === "Analyser, permettant des économies" && r.report.flagged.length === 1);
}

// ---------- Chiffres ----------
{
  const r = out(["Développer des tableaux de bord sous Power BI utilisés par 200 collaborateurs"], "Orano");
  ok("chiffre qui n'est nulle part dans le profil : signalé, puce inchangée", first(r) === "Développer des tableaux de bord sous Power BI utilisés par 200 collaborateurs" && r.report.numbers.length === 1 && r.report.numbers[0].numbers.join() === "200" && r.cv.notes_for_candidate[0].includes("« 200 »"));
}
{
  const r = out(["Réduire le temps de reporting de 30 % grâce à des pipelines SQL"], "Orano");
  ok("chiffre du profil (30) : aucune alerte", r.report.numbers.length === 0 && r.cv.notes_for_candidate.length === 0);
}
{
  const r = out(["Présenter 5 projets data sur un portfolio"], "Portfolio");
  ok("chiffre venu d'un projet du profil : aucune alerte", r.report.numbers.length === 0);
}
{
  // Les chiffres des identifiants (« 8f14e45f… » contient 45) ne doivent pas faire passer un chiffre inventé pour connu
  const r = out(["Former 45 utilisateurs sous Power BI"], "Orano");
  ok("les chiffres des identifiants ne comptent pas comme des chiffres du profil", r.report.numbers.length === 1 && r.report.numbers[0].numbers.join() === "45");
}
{
  const r = out(["Mettre en place un reporting à 12,5 jours de délai"], "Orano");
  ok("décimale à virgule lue comme un seul nombre", r.report.numbers[0]?.numbers.join() === "12.5");
}

// ---------- Entreprise absente du profil, accents, casse ----------
{
  // Même puce que plus haut : coupée pour SNCF (le profil n'y parle pas de reporting), gardée pour Orano (il y est écrit)
  const r = guardCv(cv([bad], "ORANO Nucléaire"), profile);
  ok("nom d'entreprise un peu différent (« ORANO Nucléaire » pour « Orano ») : l'expérience Orano est retrouvée, son résultat de reporting justifie la puce", first(r) === bad && r.report.cut.length === 0);
}
{
  const r = out(["Industrialiser des pipelines SQL, réduisant le temps de reporting"], "Entreprise inconnue");
  ok("entreprise inconnue du profil : on compare avec toutes les expériences (le résultat existe quelque part : reste)", r.report.cut.length === 0);
}

// ---------- Puces sans résultat, entrées bizarres ----------
{
  const plain = ["Développer des tableaux de bord interactifs sous Power BI (DAX) pour les Business Unit et le CODIR", "Piloter le backlog Agile"];
  const r = out(plain, "Orano");
  ok("puces qui reprennent le profil : rien ne bouge, aucune note", r.cv.experiences[0].bullets.join("|") === plain.join("|") && r.cv.notes_for_candidate.length === 0);
}
{
  const r = guardCv({ ...cv([]), notes_for_candidate: undefined as never, experiences: [{ company: "Orano", role: "", dates: "", bullets: [] }] }, profile);
  ok("pas de puces, pas de notes : ne plante pas", r.cv.notes_for_candidate.length === 0 && r.cv.experiences[0].bullets.length === 0);
  const empty = guardCv(cv([bad], "SNCF"), { identity: { name: "x", email: "x" } } as unknown as Profile);
  ok("profil vide : ne plante pas", empty.cv.experiences.length === 1);
}

// ---------- Les notes de l'IA sont gardées, les doublons évités, l'entrée n'est pas modifiée ----------
{
  const input = cv([bad], "SNCF", ["Ajoute un chiffre à la puce 2"]);
  const copy = JSON.stringify(input);
  const once = guardCv(input, profile);
  ok("l'objet reçu n'est pas modifié", JSON.stringify(input) === copy);
  ok("les notes de l'IA passent en premier, les nôtres suivent", once.cv.notes_for_candidate[0] === "Ajoute un chiffre à la puce 2" && once.cv.notes_for_candidate.length === 2);
  const twice = guardCv(once.cv, profile);
  ok("deuxième passage : mêmes puces, mêmes notes (pas de doublon)", JSON.stringify(twice.cv) === JSON.stringify(once.cv) && twice.report.cut.length === 0);
}

// ---------- Aucune réserve dans le texte du CV ----------
{
  const r = out(["Développer des tableaux de bord sous Power BI (DAX) [chiffre à valider] pour les Business Unit et le CODIR"], "Orano");
  ok("« [chiffre à valider] » retiré du texte, espaces propres", first(r) === "Développer des tableaux de bord sous Power BI (DAX) pour les Business Unit et le CODIR", first(r));
  ok("la réserve retirée est dite dans les notes (à côté, pas dans le CV)", r.report.placeholders.length === 1 && r.report.placeholders[0].removed === "[chiffre à valider]" && r.cv.notes_for_candidate[0].includes("« [chiffre à valider] »") && r.cv.notes_for_candidate[0].includes("Orano"));
}
{
  const r = out(["Automatiser des pipelines SQL (à compléter)", "Piloter le backlog Agile (À VÉRIFIER : durée)"], "Orano");
  ok("« (à compléter) » et « (À VÉRIFIER : durée) » retirés, majuscules comprises", r.cv.experiences[0].bullets.join("|") === "Automatiser des pipelines SQL|Piloter le backlog Agile", r.cv.experiences[0].bullets.join("|"));
}
{
  const r = out(["Automatiser des pipelines SQL – à valider."], "Orano");
  ok("fin de puce « – à valider » retirée, point final gardé hors réserve", first(r) === "Automatiser des pipelines SQL", first(r));
}
{
  const b = "Rédiger des spécifications à valider par la MOA et la MOE";
  const r = out([b], "SNCF");
  ok("une phrase normale qui contient « à valider » n'est PAS touchée", first(r) === b && r.report.placeholders.length === 0);
}
{
  const input = cv(["Analyser des données"], "Orano");
  input.summary = "Data analyst orienté BI [à compléter : années d'expérience], disponible immédiatement.";
  input.projects = [{ name: "Portfolio", description: "Site personnel (à valider)" }];
  const r = guardCv(input, profile);
  ok("résumé et projets aussi : réserves retirées", r.cv.summary === "Data analyst orienté BI, disponible immédiatement." && r.cv.projects[0].description === "Site personnel", `${r.cv.summary} | ${r.cv.projects[0].description}`);
  ok("rien n'est écrit dans le CV : le texte final ne contient plus « valider », « compléter » ni « vérifier »", !/valider|compléter|vérifier/i.test(JSON.stringify([r.cv.summary, r.cv.projects, r.cv.experiences])));
  const again = guardCv(r.cv, profile);
  ok("deuxième passage : rien de plus, pas de note en double", again.report.placeholders.length === 0 && again.cv.notes_for_candidate.length === r.cv.notes_for_candidate.length);
}

// ---------- Branchement ----------
const ai = readFileSync("lib/ai.ts", "utf8");
ok("generateCv passe le CV par le garde-fou avant de poser les liens", ai.includes('import { guardCv } from "./cv-guard"') && ai.includes("guardCv(pinProjects(enforceFacts(cv, profile).cv, profile), profile)") && ai.indexOf("guardCv(pinProjects(enforceFacts(") < ai.indexOf("attachLinks(cleanCvText(checked)"));
ok("règles de rédaction : pas de résultat ajouté, destinataires gardés, pas de formule creuse", ai.includes("N'ajoute JAMAIS un résultat") && ai.includes("« Business Unit », « CODIR »") && ai.includes("Pas de formule creuse"));

// ---------- Les chiffres du profil qui ne sont pas des réalisations ne « connaissent » pas un chiffre du CV ----------
{
  const withSettings = {
    ...profile,
    identity: { name: "Test", email: "test@exemple.fr", phone: "06 12 34 56 78", city: "Paris 18" },
    preferences: { daily_quota: 15, weekly_goal: 10, search_zone: { scope: "departement", departments: [{ code: "93", name: "Seine-Saint-Denis" }, { code: "75", name: "Paris" }] } },
    todo: ["Ajouter 12 projets"], rules: [],
  } as unknown as Profile;
  const r = guardCv(cv(["Piloter le backlog Agile / Scrum +15% d'efficacité"], "SNCF"), withSettings);
  ok("quota du jour du profil (15) : le « 15 % » du CV reste signalé comme absent du profil", r.report.numbers.some((n) => n.numbers.includes("15")), JSON.stringify(r.report.numbers));
  ok("code de département (93), téléphone, tâche : jamais une preuve", ["93", "75", "56", "12"].every((n) => guardCv(cv([`Piloter le backlog Agile / Scrum, ${n}% de gain`], "SNCF"), withSettings).report.numbers.some((x) => x.numbers.includes(n))));
  ok("un chiffre écrit dans une réalisation du profil reste connu (30 %)", guardCv(cv(["Automatiser des pipelines SQL ; réduction du temps de reporting de 30 %"]), withSettings).report.numbers.length === 0);
}

done();
