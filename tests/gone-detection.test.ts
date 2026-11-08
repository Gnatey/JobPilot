// Détection des annonces « disparues » (7 novembre, retour de Juliana : « offre toujours disponible mais répertoriée comme disparue »).
// Cause trouvée : les phrases de `looksGone` n'avaient ni frontières de mots ni formes accordées, donc un mot ordinaire d'une annonce en ligne
// (« supprimer les doublons », « archivage », « candidat pourvu d'un diplôme », « le contrat expire ») la faisait classer disparue, et la date limite
// des données de l'annonce (souvent laissée dépassée par les sites) comptait comme preuve. Aucun réseau : la lecture est simulée.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { goneNotice, looksGone, readOffer } from "../lib/fetch-offer";
import { checkable, checkTarget, goneWhy } from "../lib/offer-check-read";
import { verdictOf } from "../lib/offer-check";
import { ok, done } from "./helpers";

const src = (f: string) => readFileSync(join(process.cwd(), f), "utf8");

// ---------- Des annonces EN LIGNE qui ne doivent jamais sortir « disparues » ----------
const online: [string, string][] = [
  ["clôture comptable dans le titre", "Chargé de clôture comptable H/F\nEntreprise X, Paris\nVos missions : réaliser les clôtures mensuelles"],
  ["poste + clôture annuelle", "Poste : clôture annuelle et reporting, rattaché au DAF"],
  ["supprimer les doublons", "Data analyst\nPoste centré sur la qualité des données : supprimer les doublons, nettoyer les référentiels"],
  ["retirer les données", "Analyste BI\nOffre : vous pourrez retirer les données obsolètes du périmètre"],
  ["candidat pourvu d'un diplôme", "Data analyst H/F\nPoste ouvert à tout candidat pourvu d'un Bac+5 en statistiques"],
  ["poste pourvu d'une voiture", "Data analyst\nCe poste est pourvu d'une voiture de fonction"],
  ["poste à pourvoir", "Data analyst\nPoste à pourvoir immédiatement, CDI"],
  ["archivage légal", "Gestionnaire de données\nAnnonce : vous gérez l'archivage légal et les archives"],
  ["le contrat expire", "Data analyst\nPoste en CDD : le contrat expire le 30 juin"],
  ["l'offre expire (échéance à venir)", "Data analyst\nL'offre expire le 30 novembre, postulez vite"],
  ["anglais : session expirée", "Job search: your session has expired, please sign in"],
  ["poste dans le titre, rien d'autre", "Data Analyst chez Acme, CDI à Paris"],
];
for (const [name, text] of online) ok(`annonce en ligne : ${name} → pas disparue`, !looksGone(text), goneNotice(text) ?? "");

// ---------- De vraies pages « annonce retirée » ----------
const gone: [string, string][] = [
  ["offre expirée (titre de page)", "Offre expirée | HelloWork"],
  ["cette offre n'est plus disponible", "Cette offre n'est plus disponible.\nRetrouvez d'autres offres"],
  ["cette annonce a été retirée", "Cette annonce a été retirée par l'employeur"],
  ["ce poste est pourvu", "Ce poste est pourvu."],
  ["le poste n'est plus à pourvoir", "Ce poste n'est plus à pourvoir."],
  ["n'est plus d'actualité", "Cette annonce n'est plus d'actualité"],
  ["l'offre d'emploi a expiré", "Cette offre d'emploi a expiré"],
  ["annonce introuvable", "Annonce introuvable"],
  ["la page n'existe plus", "Désolé, la page n'existe plus"],
  ["anglais : job expired", "Sorry, this job has expired."],
  ["anglais : position filled", "The position has been filled"],
  ["anglais : no longer accepting", "This job is no longer accepting applications"],
];
for (const [name, text] of gone) ok(`vraie page retirée : ${name} → disparue`, looksGone(text), text);

// ---------- La phrase repérée est rendue (pour la preuve affichée) ----------
ok("goneNotice rend la phrase repérée, courte", goneNotice("Cette offre n'est plus disponible.") === "n'est plus disponible" && (goneNotice(gone[0][1]) ?? "").length <= 90);
ok("un pied de page ne compte pas (seuls les 1000 premiers signes)", !looksGone(`${"Data analyst, missions et profil. ".repeat(60)}\nCette offre n'est plus disponible.`));

// ---------- Pages complètes : readOffer ----------
type Get = NonNullable<Parameters<typeof readOffer>[1]>;
const page = (status: number, body = ""): Get => async () => ({ status, body });
const html = (title: string, body: string) => `<html><head><title>${title}</title></head><body><main>${body}</main></body></html>`;
const ad = "Nous recherchons un data analyst pour rejoindre notre équipe. Missions : construire des tableaux de bord, fiabiliser les données, supprimer les doublons et archiver l'historique. Profil : SQL, Power BI, rigueur. ".repeat(3);
const ld = (until: string) => `<html><head><script type="application/ld+json">${JSON.stringify({ "@type": "JobPosting", title: "Data analyst", validThrough: until, description: ad, hiringOrganization: { name: "Acme" } })}</script></head><body><main>${ad}</main></body></html>`;
const past = new Date(Date.now() - 40 * 864e5).toISOString().slice(0, 10);

{
  const r = await readOffer("https://exemple.fr/o/1", page(200, html("Data analyst", ad)));
  ok("annonce longue qui parle de supprimer et d'archiver : en ligne, texte rendu", r.gone === false && !!r.text && verdictOf(r) === "online");
}
{
  const r = await readOffer("https://exemple.fr/o/1", page(200, ld(past)));
  ok("date limite dépassée de 40 jours, annonce lisible : en ligne (la date n'est pas une preuve)", r.gone === false && !!r.text && verdictOf(r) === "online");
}
{
  const r = await readOffer("https://exemple.fr/o/1", page(404));
  ok("404 : disparue, preuve « page introuvable (404) »", r.gone === true && /404/.test(r.why ?? ""));
  const r2 = await readOffer("https://exemple.fr/o/1", page(410));
  ok("410 : disparue, preuve « annonce supprimée (410) »", r2.gone === true && /410/.test(r2.why ?? ""));
}
{
  const r = await readOffer("https://exemple.fr/o/1", page(200, html("Offre", "Cette offre n'est plus disponible.")));
  ok("page qui annonce le retrait : disparue, preuve = la phrase de la page", r.gone === true && /n'est plus disponible/.test(r.why ?? "") && r.text === null);
}
{
  const r = await readOffer("https://exemple.fr/o/1", page(403));
  ok("403 : ni disparue ni lisible, aucune preuve", r.gone === false && r.text === null && r.why === undefined);
}

// ---------- La preuve montre l'adresse lue quand ce n'est pas celle de la ligne ----------
ok("goneWhy : même adresse → la preuve seule", goneWhy("le site répond « page introuvable » (404)", "https://a.fr/x", "https://a.fr/x") === "le site répond « page introuvable » (404)");
ok("goneWhy : adresse décodée → elle est nommée (sans paramètres)", /adresse lue : hellowork\.com\/fr-fr\/emplois\/7\.html$/.test(goneWhy("x", "https://emails.hellowork.com/clic/a/b", "https://www.hellowork.com/fr-fr/emplois/7.html?utm=1")));
{
  const tracked = (target: string) => "https://emails.hellowork.com/clic/abc/" + Buffer.from(target).toString("base64url");
  ok("lien de suivi HelloWork vers une annonce : lu sous sa forme canonique, sans adresse e-mail ni suivi", checkTarget(tracked("https://www.hellowork.com/fr-fr/emplois/777.html?utm_source=mail&email=a%40b.fr")) === "https://www.hellowork.com/fr-fr/emplois/777.html");
  ok("lien de suivi HelloWork qui ne mène pas à une annonce : jamais lu (un « introuvable » n'y prouverait rien)", !checkable(tracked("https://www.hellowork.com/fr-fr/candidat/alertes?id=1")));
}

// ---------- Câblage ----------
{
  const f = src("lib/fetch-offer.ts");
  ok("readOffer n'utilise plus validThrough comme preuve", !/expired\s*=\s*true/.test(f) && /N'est PAS une preuve|n'est PAS une preuve/.test(f));
  for (const route of ["app/api/offers/analyze/route.ts", "app/api/offers/[id]/reanalyze/route.ts", "app/api/recommendations/[id]/diagnostic/route.ts"]) {
    ok(`${route} dit pourquoi l'annonce est jugée disparue`, /goneMessage\(.*read\.why\)/.test(src(route)));
  }
  for (const route of ["app/api/offers/check/route.ts", "app/api/recommendations/check/route.ts"]) {
    ok(`${route} renvoie la preuve (why) des annonces disparues`, /goneWhy\(read\.why/.test(src(route)));
  }
  ok("le bilan affiche la preuve de chaque annonce disparue", /Preuve : \{s\.why\}/.test(src("components/analyze-skips.tsx")) && /Preuve : \{g\.why\}/.test(src("components/check-recos.tsx")));
}
done();
