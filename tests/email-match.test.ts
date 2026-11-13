// Rapprochement d'un e-mail avec une candidature (lib/email-match.ts) : sans réseau ni IA.
import { ok, done } from "./helpers";
import { matchApplication, nextStatus, companyMatch, type AppRef, type MailRef } from "../lib/email-match";

const app = (id: string, company: string, title: string, status: string): AppRef => ({ id, company, title, status });
const mail = (company: string, category: string, extra: Partial<MailRef> = {}): MailRef => ({ company, subject: "", snippet: "", category, ...extra });
const idOf = (apps: AppRef[], m: MailRef) => matchApplication(apps, m)?.app.id ?? null;

/* ---------- Statuts ---------- */
ok("accusé de réception : Postulé ne bouge pas", nextStatus("postule", "accuse_reception") === null);
ok("invitation : Postulé passe en Entretien", nextStatus("postule", "entretien") === "entretien");
ok("un mail ne fait jamais reculer une carte", nextStatus("offre", "entretien") === null);
ok("un refus ne touche pas une carte « À postuler »", nextStatus("a_postuler", "refus") === null);
ok("un refus passe une carte Postulé en Refusé", nextStatus("postule", "refus") === "refuse");

/* ---------- Entreprise ---------- */
ok("« Storm Group » = « Storm »", companyMatch("Storm Group", "Storm") === "exact");
ok("« Air » est dans « Air Liquide » (proche, pas exact)", companyMatch("Air", "Air Liquide") === "partial");
ok("deux entreprises différentes ne se rapprochent pas", companyMatch("Sysco", "Solaris Gestion") === null);

/* ---------- Choix de la carte ---------- */
const storm = [
  app("DA", "Storm Group", "Data Analyst - H/F", "postule"),
  app("BA", "Storm Group", "Business Analyst IA Générative & IA Agentique - Assurance H/F", "refuse"),
];

// Le cas du 13 novembre : une seule carte vivante chez Storm Group, un mail pour une AUTRE offre de ce recruteur
ok("mail d'une autre offre de la même entreprise, classé entretien : aucune carte", idOf(storm, mail("Storm Group", "entretien", {
  subject: "Storm Group | Suivi de candidature", snippet: "Nous avons bien reçu votre candidature pour le poste de Consultant BI. Nous reviendrons vers vous pour planifier un entretien.", jobTitle: "Consultant BI",
})) === null);
ok("même mail classé refus : aucune carte non plus (une autre offre n'est pas refusée)", idOf(storm, mail("Storm Group", "refus", { subject: "Suivi de candidature", snippet: "pour le poste de Consultant BI", jobTitle: "Consultant BI" })) === null);
ok("mail qui nomme le bon poste : la carte Data Analyst", idOf(storm, mail("Storm Group", "entretien", { subject: "Entretien", snippet: "pour le poste de Data Analyst", jobTitle: "Data Analyst" })) === "DA");
ok("intitulé du mail un peu différent (Data Analyste) : toujours la carte Data Analyst", idOf(storm, mail("Storm Group", "entretien", { snippet: "poste Data Analyste", jobTitle: "Data Analyste" })) === "DA");
ok("mail qui ne nomme aucun poste : comme avant, la seule carte vivante de l'entreprise", idOf(storm, mail("Storm Group", "entretien", { subject: "Suivi de candidature", snippet: "Merci pour votre candidature" })) === "DA");
ok("intitulé du mail partageant un mot avec la carte : gardée (pas de coupe sur un doute)", idOf(storm, mail("Storm Group", "entretien", { snippet: "poste de Data Engineer", jobTitle: "Data Engineer" })) === "DA");

// Refus : jamais une carte non envoyée, jamais l'autre poste
const sysco = [app("F", "Sysco", "Functional Support Analyst", "a_postuler"), app("G", "Sysco", "Data Engineer", "postule")];
ok("refus : la carte « À postuler » est écartée, la carte envoyée du bon poste est prise", idOf(sysco, mail("Sysco", "refus", { snippet: "Functional Support Analyst", jobTitle: "Functional Support Analyst" })) === null);
ok("refus du bon poste envoyé", idOf(sysco, mail("Sysco", "refus", { snippet: "poste de Data Engineer", jobTitle: "Data Engineer" })) === "G");

// Carte « À postuler » : seulement si l'intitulé est dans le mail
const draft = [app("A", "Acme", "Analyste BI", "a_postuler")];
ok("carte « À postuler » : sans intitulé dans le mail, rien", idOf(draft, mail("Acme", "accuse_reception", { subject: "Bonne réception" })) === null);
ok("carte « À postuler » : intitulé dans le mail, prise", idOf(draft, mail("Acme", "accuse_reception", { snippet: "votre candidature au poste d'Analyste BI" })) === "A");

// Deux cartes vivantes, mail ambigu : aucune
const two = [app("1", "Acme", "Data Analyst Paris", "postule"), app("2", "Acme", "Data Analyst Lyon", "postule")];
ok("deux cartes aussi proches : on ne choisit pas", idOf(two, mail("Acme", "entretien", { snippet: "Data Analyst" })) === null);

// Entreprise différente : jamais
ok("autre entreprise : aucune carte", idOf(storm, mail("Sysco", "entretien", { snippet: "Data Analyst" })) === null);
ok("mail sans entreprise : aucune carte", idOf(storm, mail("", "entretien", { snippet: "Data Analyst" })) === null);

done();
