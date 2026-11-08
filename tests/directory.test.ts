/**
 * Annuaire d'entreprises (Recherche) : logique (lib/directory.ts) et données (lib/directory-data.ts). Aucun réseau.
 * Les adresses ne peuvent pas être ouvertes ici : le test vérifie leur FORME (https, propre, unique) et la cohérence avec les familles de métiers
 * et les secteurs de l'application. Un lien qui vieillit se corrige dans lib/directory-data.ts.
 */
import { ok, done } from "./helpers";
import {
  TYPES, FAMILY_LABELS, SECTOR_OPTIONS, familiesOfRole, familiesOfRoles, sectorsOf, matchProfile, searchDirectory, groupByType, hostOf, isGeneralist,
  type Entry,
} from "../lib/directory";
import { DIRECTORY } from "../lib/directory-data";

const mk = (name: string, families: string[], sector: string, kw = "", type: Entry["type"] = "Grands groupes"): Entry =>
  ({ name, type, url: `https://${name.toLowerCase().replace(/\W+/g, "")}.example/jobs`, families, sector, kw });

// ---------- familiesOfRole ----------
ok("poste exact : Data Analyst = Data et BI", familiesOfRole("Data Analyst").includes("Data et BI"));
ok("poste exact sans accents ni majuscules", familiesOfRole("data analyst").includes("Data et BI"));
ok("poste contenant un poste connu : « Data Analyst junior »", familiesOfRole("Data Analyst junior").includes("Data et BI"));
ok("mot propre au domaine : « BI »", familiesOfRole("Consultant BI").includes("Data et BI"));
ok("mot courant absent de la liste : « Développeur web »", familiesOfRole("Développeur web").includes("Informatique et développement"));
ok("intitulé inconnu = aucune famille", familiesOfRole("Charmeur de serpents").length === 0);
ok("chaîne vide = aucune famille", familiesOfRole("   ").length === 0);
ok("plusieurs postes = union sans doublon", (() => { const f = familiesOfRoles(["Data Analyst", "Data Analyst junior"]); return f.length === new Set(f).size && f.includes("Data et BI"); })());

// ---------- sectorsOf ----------
ok("secteur exact : « Banque »", sectorsOf(["Banque"]).join() === "Banque");
ok("secteur sans accent ni casse", sectorsOf(["banque"]).includes("Banque"));
ok("groupe entier : « Finance » donne ses options", ["Banque", "Assurance", "Fintech"].every((o) => sectorsOf(["Finance"]).includes(o)));
ok("secteur inconnu = rien", sectorsOf(["Zzzzzz"]).length === 0);
ok("secteur vide ignoré", sectorsOf(["", "  "]).length === 0);

// ---------- matchProfile ----------
const A = mk("Alpha", ["Data et BI", "Informatique et développement"], "ESN et conseil IT");
const B = mk("Beta", ["Data et BI"], "Banque");
const C = mk("Gamma", ["Santé et social"], "Santé et pharma");
const G = mk("Generaliste", FAMILY_LABELS.slice(), "", "", "Sites d'emploi spécialisés");
const entries = [C, B, A, G];
ok("sans poste ni secteur reconnu : rien", matchProfile(entries, { roles: ["Charmeur de serpents"], sectors: [] }).length === 0);
ok("un poste ne remonte que les employeurs de sa famille", matchProfile(entries, { roles: ["Data Analyst"], sectors: [] }).every((m) => m.entry.name !== "Gamma"));
ok("le secteur choisi pèse plus qu'une famille", (() => { const m = matchProfile(entries, { roles: ["Data Analyst"], sectors: ["Banque"] }); return m[0].entry.name === "Beta"; })());
ok("un site généraliste passe après un employeur précis", (() => { const m = matchProfile(entries, { roles: ["Data Analyst"], sectors: [] }).map((x) => x.entry.name); return m.indexOf("Generaliste") > m.indexOf("Alpha") && m.indexOf("Generaliste") > m.indexOf("Beta"); })());
ok("isGeneralist : toutes les familles", isGeneralist(G) && !isGeneralist(A));
ok("un secteur seul suffit", matchProfile(entries, { roles: [], sectors: ["Santé et pharma"] })[0]?.entry.name === "Gamma");
ok("égalité de points = ordre alphabétique", (() => { const m = matchProfile([mk("Zeta", ["Data et BI"], "x"), mk("Alpha2", ["Data et BI"], "x")], { roles: ["Data Analyst"], sectors: [] }); return m[0].entry.name === "Alpha2"; })());

// ---------- searchDirectory ----------
const S = [mk("Crédit Agricole", ["Banque et assurance"], "Banque", "lcl"), mk("Capgemini", ["Informatique et développement"], "ESN et conseil IT", "sogeti"), mk("Banque de France", ["Banque et assurance"], "Banque")];
ok("recherche sans accents ni majuscules", searchDirectory(S, "credit agricole")[0]?.name === "Crédit Agricole");
ok("recherche dans les mots en plus", searchDirectory(S, "sogeti")[0]?.name === "Capgemini");
ok("chaque mot doit se trouver", searchDirectory(S, "banque france").map((e) => e.name).join() === "Banque de France");
ok("un nom qui commence par la saisie passe d'abord", searchDirectory(S, "banque")[0]?.name === "Banque de France");
ok("recherche dans le secteur", searchDirectory(S, "esn").length === 1);
ok("recherche vide = rien", searchDirectory(S, "  ").length === 0 && searchDirectory(S, "a").length === 0);
ok("recherche sans résultat", searchDirectory(S, "zzzz").length === 0);

// ---------- groupByType ----------
ok("types dans l'ordre d'affichage, types vides retirés", (() => {
  const g = groupByType([mk("x", [], "", "", "Sites d'emploi spécialisés"), mk("y", [], "", "", "ESN et conseil")], (e) => e.type);
  return g.map((x) => x.type).join("|") === "ESN et conseil|Sites d'emploi spécialisés";
})());
ok("hostOf : sans www", hostOf("https://www.example.com/a?b=1") === "example.com");
ok("hostOf : adresse illisible = vide", hostOf("pas une adresse") === "");

// ---------- Les données ----------
const TRACKING = /[?&](utm_[a-z]+|gclid|fbclid|gad_source|gad_campaignid|token|magic-token|ref|trk|sc_[a-z]+|cmpid)=/i;
const names = DIRECTORY.map((e) => e.name.toLowerCase());
const urls = DIRECTORY.map((e) => e.url.toLowerCase());
ok("l'annuaire est assez fourni", DIRECTORY.length >= 120, `${DIRECTORY.length} entrées`);
ok("noms uniques", new Set(names).size === names.length, names.filter((n, i) => names.indexOf(n) !== i).join(", "));
ok("adresses uniques", new Set(urls).size === urls.length, urls.filter((n, i) => urls.indexOf(n) !== i).join(", "));
ok("toutes les adresses sont en https", DIRECTORY.every((e) => e.url.startsWith("https://")), DIRECTORY.filter((e) => !e.url.startsWith("https://")).map((e) => e.name).join(", "));
ok("adresses lisibles (nom de domaine avec un point, sans espace)", DIRECTORY.every((e) => /^https:\/\/[a-z0-9.-]+\.[a-z]{2,}(\/\S*)?$/i.test(e.url) && hostOf(e.url) !== ""), DIRECTORY.filter((e) => !/^https:\/\/[a-z0-9.-]+\.[a-z]{2,}(\/\S*)?$/i.test(e.url)).map((e) => e.name).join(", "));
ok("aucune adresse avec un paramètre de suivi ou un jeton", DIRECTORY.every((e) => !TRACKING.test(e.url)), DIRECTORY.filter((e) => TRACKING.test(e.url)).map((e) => e.name).join(", "));
ok("aucune adresse ne contient un identifiant de personne (adresse e-mail, @)", DIRECTORY.every((e) => !e.url.includes("@")));
const ONE_OFFER = /\/(jobs?|offres?|offers?|annonces?|apply|detail|emplois?)\/\d{5,}/i;
ok("aucune adresse n'est celle d'une offre précise (/job/12345…)", DIRECTORY.every((e) => !ONE_OFFER.test(new URL(e.url).pathname)), DIRECTORY.filter((e) => ONE_OFFER.test(new URL(e.url).pathname)).map((e) => e.name).join(", "));
ok("les sites déjà proposés dans Recherche (Indeed, LinkedIn…) ne sont pas dupliqués", DIRECTORY.every((e) => !/(indeed|linkedin|hellowork|welcometothejungle|meteojob|apec\.fr|francetravail)/i.test(hostOf(e.url))));
ok("types connus", DIRECTORY.every((e) => (TYPES as readonly string[]).includes(e.type)));
ok("tous les types sont utilisés", TYPES.every((t) => DIRECTORY.some((e) => e.type === t)));
ok("familles = libellés de JOB_FAMILIES", DIRECTORY.every((e) => e.families.length > 0 && e.families.every((f) => FAMILY_LABELS.includes(f))), DIRECTORY.filter((e) => !e.families.every((f) => FAMILY_LABELS.includes(f))).map((e) => e.name).join(", "));
ok("pas de famille répétée dans une entrée", DIRECTORY.every((e) => new Set(e.families).size === e.families.length), DIRECTORY.filter((e) => new Set(e.families).size !== e.families.length).map((e) => e.name).join(", "));
ok("secteur = option de SECTOR_FAMILIES (vide seulement pour un site généraliste)", DIRECTORY.every((e) => (e.sector === "" ? isGeneralist(e) : SECTOR_OPTIONS.includes(e.sector))), DIRECTORY.filter((e) => !(e.sector === "" ? isGeneralist(e) : SECTOR_OPTIONS.includes(e.sector))).map((e) => `${e.name} (${e.sector})`).join(", "));
ok("le texte affiché ne dit pas « recrute » à la place des employeurs (noms et mots en plus sans promesse)", DIRECTORY.every((e) => !/recrute|embauche|offres? (ouverte|disponible)/i.test(e.name + " " + (e.kw ?? ""))));

// Chaque métier est couvert : au moins 3 employeurs précis (hors sites généralistes) pour les familles centrales, 2 pour les autres
const CORE = ["Data et BI", "Informatique et développement", "Produit et gestion de projet", "Conseil et stratégie", "Finance, comptabilité et gestion", "Banque et assurance", "Marketing et communication", "Commercial et vente", "Ressources humaines et recrutement", "Juridique et conformité"];
for (const fam of FAMILY_LABELS) {
  const n = DIRECTORY.filter((e) => !isGeneralist(e) && e.families.includes(fam)).length;
  const need = CORE.includes(fam) ? 3 : 2;
  ok(`famille couverte : ${fam}`, n >= need, `${n} employeurs précis (il en faut ${need})`);
}

// Le profil de Juliana (Data Analyst / BI) voit des employeurs de plusieurs types, pas un seul rayon
const juliana = matchProfile(DIRECTORY, { roles: ["Data Analyst", "BI Analyst"], sectors: [] });
ok("profil Data / BI : au moins 30 employeurs proposés", juliana.length >= 30, `${juliana.length}`);
ok("profil Data / BI : au moins 4 types d'employeurs représentés", new Set(juliana.map((m) => m.entry.type)).size >= 4);
ok("profil Data / BI : aucun hôpital en tête sans le secteur", !juliana.slice(0, 10).some((m) => m.entry.sector === "Santé et pharma" && m.entry.type === "Secteur public, santé et associations"));
const banker = matchProfile(DIRECTORY, { roles: ["Data Analyst"], sectors: ["Banque"] });
ok("profil Data + secteur Banque : une banque passe devant une ESN", banker[0].entry.sector === "Banque");
const teacher = matchProfile(DIRECTORY, { roles: ["Professeur des écoles"], sectors: [] });
ok("profil enseignement : l'Éducation nationale est proposée", teacher.some((m) => m.entry.name === "Éducation nationale") || familiesOfRole("Professeur des écoles").length === 0);

done();
