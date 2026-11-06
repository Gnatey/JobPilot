// « À compléter » : la réponse de la personne sert aussi à répondre à sa préoccupation (pas seulement à réécrire une ligne), sans chiffre inventé,
// et les IA qui jugent des dates connaissent la date du jour (le diagnostic du 6 novembre 2026 trouvait « futuristes » des périodes passées).
import { readFileSync } from "node:fs";
import { finishAnswer, vetReply } from "../lib/answer-reply";
import { EMPTY_PROFILE } from "../lib/empty-profile";
import { dateLine } from "../lib/format";
import { answerView, vetOps, type AnswerOp } from "../lib/profile-fix";
import type { Profile } from "../lib/types";
import { ok, done } from "./helpers";

const profile: Profile = {
  ...EMPTY_PROFILE,
  experiences: [{
    id: "e1", company: "SNCF", role: "Assistante cheffe de projet numérique", type: "Alternance", start: "Sept 2024", end: "Sept 2025",
    achievements: [{ text: "Gérer le portail collaboratif Médecine du Travail : réduction de 30 % des délais de communication", tags: [] }],
  }],
  education: [{ degree: "Master Data Management", school: "Paris School of Business", start: "2023", end: "2025" }],
};
const TODAY = dateLine(new Date("2026-11-06T12:00:00Z"));
const question = "Le Master est indiqué 2023-2025 alors que le CV mentionne des expériences en 2024-2025 : confusion entre étudiant et professionnel ?";
const answer = "C'était une alternance pendant mon Master, je n'étais pas encore diplômée en 2024.";

// La date du jour
ok("la date du jour est donnée en français", TODAY === "Nous sommes le 6 novembre 2026.", TODAY);
const ai = readFileSync("lib/ai.ts", "utf8");
ok("le diagnostic de CV et la réponse à une question reçoivent la date du jour", (ai.match(/\$\{dateLine\(\)\}/g) ?? []).length >= 2);
ok("le diagnostic dit qu'une période finie est passée, jamais « futuriste »", /jamais « future » ni « futuriste »/.test(ai));

// Réponse à la préoccupation : les chiffres viennent de ce que l'IA a lu
const known = [question, answer, "Master 2023 2025 SNCF 2024 2025", TODAY].join("\n");
const reply = "Ce n'est pas une incohérence : ton alternance SNCF (2024 - 2025) tombe pendant ton Master (2023-2025). Tu as traité 40000 lignes par jour. Rien à corriger.";
const kept = vetReply(reply, known);
ok("une phrase avec un chiffre inconnu est retirée, le reste est gardé", !kept.includes("40000") && kept.includes("Ce n'est pas une incohérence") && kept.includes("Rien à corriger"), kept);
ok("les années du profil, de la question et de la date du jour sont connues", vetReply("Nous sommes en 2026 : 2024 et 2025 sont passés.", known) === "Nous sommes en 2026 : 2024 et 2025 sont passés.");
ok("la mise en forme est retirée", vetReply("**Pas de souci.** Rien à corriger.", known) === "Pas de souci. Rien à corriger.");
ok("pas de réponse = rien", vetReply(undefined, known) === "" && vetReply(42, known) === "" && vetReply("   ", known) === "");
const long = Array.from({ length: 12 }, (_, i) => `Phrase numéro ${i} qui explique une chose simple.`.replace(/\d+/, "")).join(" ");
ok("la réponse reste courte (450 signes au plus, coupée entre deux phrases)", vetReply(long, known).length <= 450 && /\.$/.test(vetReply(long, known)));

// Ce que la route renvoie
const badOp: AnswerOp = { op: "replace", exp_id: "e1", old_text: profile.experiences[0].achievements[0].text, new_text: "Géré le portail avec 40 % de gain" };
const goodOp: AnswerOp = { op: "replace", exp_id: "e1", old_text: profile.experiences[0].achievements[0].text, new_text: "Géré le portail collaboratif Médecine du Travail : réduction de 30 % des délais de communication" };
const r1 = finishAnswer(profile, { ops: [badOp], reply, settled: true }, question, answer, TODAY);
ok("une réécriture au chiffre inventé est refusée, la réponse à la préoccupation reste", r1.ops.length === 0 && r1.reply.includes("Rien à corriger") && r1.settled && r1.proposed === 1, JSON.stringify(r1));
const r2 = finishAnswer(profile, { ops: [goodOp], reply: "Ta ligne dit déjà le résultat.", settled: true }, question, answer, TODAY);
ok("une réécriture sans chiffre nouveau passe", r2.ops.length === 1 && r2.reply !== "" && r2.settled);
const r3 = finishAnswer(profile, { ops: [], reply: "", settled: true }, question, answer, TODAY);
ok("« réglé » sans réponse à lire n'est pas affiché comme réglé", !r3.settled && r3.reply === "" && r3.ops.length === 0);
const r4 = finishAnswer(profile, null, question, answer, TODAY);
ok("sortie vide de l'IA : rien, sans erreur", r4.ops.length === 0 && r4.reply === "" && !r4.settled && r4.proposed === 0);
const r5 = finishAnswer(profile, { ops: [], reply: "Il manque encore le volume traité.", settled: false }, question, answer, TODAY);
ok("réponse qui demande un complément : pas réglée", r5.reply !== "" && !r5.settled);

// Ce que la personne voit
const some = [goodOp];
ok("réponse et réécriture : les deux", answerView({ ops: some, reply: "x", proposed: 1 }) === "reply_and_fix");
ok("réponse seule : « c'était une alternance » n'est plus « rien à écrire »", answerView({ ops: [], reply: "x", proposed: 0 }) === "reply_only");
ok("réécriture seule", answerView({ ops: some, reply: "", proposed: 1 }) === "fix_only");
ok("phrase écartée pour un chiffre inventé", answerView({ ops: [], reply: "", proposed: 2 }) === "rejected");
ok("rien du tout", answerView({ ops: [], reply: "", proposed: 0 }) === "none");

// Câblage : la route et l'écran
const route = readFileSync("app/api/profile/answer/route.ts", "utf8");
ok("la route passe par finishAnswer et ne relit pas si une réponse existe", /finishAnswer\(/.test(route) && /!result\.reply/.test(route));
const screen = readFileSync("components/todo-answer.tsx", "utf8");
ok("l'écran montre « Ma réponse » et propose de retirer la question réglée", screen.includes("Ma réponse") && screen.includes("C'est réglé, retirer la question"));

// Une réponse qui n'entre pas dans le profil ne doit pas laisser croire le contraire (« Comment je vais m'en souvenir ? », 6 novembre soir)
ok("l'IA n'annonce jamais que le contexte est « pris en compte » : seul ce qui est appliqué entre dans le profil", /ne dis JAMAIS que le contexte ou la réponse est « pris en compte »/.test(ai));
ok("un ordre de grandeur donné par la personne s'écrit avec ses mots, un exemple non", ai.includes("s'écrit tel quel, avec ses mots") && ai.includes("Un simple exemple (« par exemple 50 ») n'est pas un résultat"));
ok("un chiffre sans unité n'est pas écrit : l'IA demande ce qui est compté", ai.includes("Un chiffre sans unité ne s'écrit pas") && ai.includes("demande ce qui est compté"));
ok("l'écran dit que la réponse n'est pas dans le profil tant qu'elle n'est pas écrite", screen.includes("tes CV n'en tiennent pas compte") && screen.includes("Rien n'est ajouté à ton profil avec cette réponse"));
ok("les questions de volume demandent l'unité sous la zone de réponse", /COUNT_Q\.test\(t\) && <p[^>]*>Un chiffre sans unité ne peut pas aller sur un CV/.test(screen));
const rangeOp: AnswerOp = { op: "add", exp_id: "e1", text: "Traité plus de 1 000 lignes par jour dans des rapports Power BI" };
ok("« plus de 1 000 lignes par jour », dit par la personne, passe le garde-fou des chiffres", vetOps(profile, [rangeOp], "Plus de 1 000 lignes par jour").length === 1);
ok("le même chiffre sans qu'elle l'ait dit est refusé", vetOps(profile, [rangeOp], "Je ne sais plus").length === 0);

done();
