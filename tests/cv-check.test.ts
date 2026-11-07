// Contrôle de mes CV : compare un CV déjà enregistré (peut-être déjà envoyé) au profil, en lecture seule.
import { readFileSync } from "node:fs";
import { checkCv, fixCount, isCv } from "../lib/cv-check";
import { enforceFacts } from "../lib/cv-facts";
import type { CvDoc, Profile } from "../lib/types";
import { ok, done } from "./helpers";

const profile = {
  identity: { name: "Test", email: "test@exemple.fr", phone: "06 15 15 15 15", links: [] },
  // Les réglages portent des chiffres (quota du jour : 15) qui ne prouvent rien sur les réalisations
  preferences: { daily_quota: 15, weekly_goal: 10 },
  experiences: [
    { id: "a", company: "Orano", role: "Chargée de projet digital", location: "Châtillon", start: "sept. 2022", end: "sept. 2023", achievements: [{ text: "Analyser les flux de données et optimiser les requêtes via SQL et Power BI", tags: [] }] },
    { id: "b", company: "SNCF", role: "Assistante cheffe de projet numérique", location: "Saint-Denis", start: "sept. 2024", end: "sept. 2025", achievements: [{ text: "Planifier les jalons et suivre les indicateurs de performance des projets via Planner et Excel", tags: [] }] },
  ],
  education: [
    { degree: "Master Data Management (Bac+5)", school: "Paris School of Business", start: "sept. 2023", end: "juin 2025" },
    { degree: "Bachelor E-commerce & Marketing numérique", school: "Paris School of Business / UPEC", start: "2022", end: "2023" },
    { degree: "DUT Statistiques & Informatique Décisionnelle", school: "Université Sorbonne Paris Nord", start: "2020", end: "2022" },
  ],
  projects: [], skills: {}, certifications: ["OpenClassrooms : SQL"],
  languages: [{ name: "Français", level: "maternel" }, { name: "Anglais", level: "B1-B2" }],
} as unknown as Profile;

// Le CV de l'exemple signalé : Bachelor absent, chiffres ajoutés à la main (98 %, 15 %)
const sent: CvDoc = {
  headline: "Administrateur Base de Données", summary: "Diplômée d'un Master Data Management.",
  experiences: [
    { company: "SNCF", role: "Assistante cheffe de projet numérique", location: "Saint-Denis", dates: "Sept 2024 - Sept 2025", bullets: ["Planifier les jalons et suivre les indicateurs de performance des projets via Planner et Excel +15% d'efficacité"] },
    { company: "Orano", role: "Chargée de projet digital", location: "Châtillon", dates: "Sept 2022 - Sept 2023", bullets: ["Analyser les flux de données et optimiser les requêtes via SQL et Power BI"] },
  ],
  education: [
    { degree: "Master Data Management (Bac+5)", school: "Paris School of Business", dates: "2023-2025" },
    { degree: "DUT Statistiques & Informatique Décisionnelle", school: "Université Sorbonne Paris Nord", dates: "2020-2022" },
  ],
  skills: [], projects: [], certifications: ["OpenClassrooms : SQL"], languages: "Français (maternel) · Anglais (B1-B2)", ats_keywords_used: [], notes_for_candidate: [],
};

// ---------- Le cas signalé ----------
{
  const issues = checkCv(sent, profile);
  ok("formation absente : signalée, à corriger", issues.some((i) => i.level === "fix" && i.text === "Formation absente du CV : « Bachelor E-commerce & Marketing numérique »"));
  ok("le chiffre ajouté à la main (15) : à relire, pas à corriger", issues.some((i) => i.level === "read" && i.text.includes("« 15 »") && i.text.startsWith("SNCF")));
  ok("rien d'autre à corriger : un seul écart de fait", fixCount(issues) === 1, issues.map((i) => i.text).join(" | "));
  ok("les écarts à corriger passent avant ceux à relire", issues[0].level === "fix" && issues[issues.length - 1].level === "read");
}

// ---------- Un CV conforme ne donne rien ----------
{
  const clean = enforceFacts(sent, profile).cv;
  const cleaned = { ...clean, experiences: clean.experiences.map((e) => ({ ...e, bullets: e.bullets.map((b) => b.replace(/ \+15% d'efficacité/, "")) })) };
  ok("CV remis d'aplomb (formation remise, chiffre retiré) : aucun écart", checkCv(cleaned, profile).length === 0, checkCv(cleaned, profile).map((i) => i.text).join(" | "));
}

// ---------- Les autres écarts de fait ----------
{
  const bad: CvDoc = { ...sent, experiences: [{ ...sent.experiences[1], role: "Data Analyst BI", dates: "Sept 2020 - Sept 2021" }], languages: "Français · Anglais (C1)", certifications: ["AWS Certified Solutions Architect"], education: [...sent.education, { degree: "MBA Finance de marché", school: "HEC", dates: "2025" }] };
  const t = checkCv(bad, profile).map((i) => i.text).join("\n");
  ok("poste différent du profil", t.includes("Orano : poste écrit « Data Analyst BI », ton profil dit « Chargée de projet digital »"));
  ok("dates différentes du profil", t.includes("Orano : dates « Sept 2020 - Sept 2021 », ton profil dit « sept. 2022 - sept. 2023 »"));
  ok("langues : ce qui est écrit et ce que dit le profil", t.includes("Langues : « Français · Anglais (C1) » sur le CV, « Français (maternel) · Anglais (B1-B2) » dans ton profil"));
  ok("certification et formation inconnues du profil", t.includes("Certification qui ne figure pas dans ton profil : « AWS Certified Solutions Architect »") && t.includes("Formation qui ne figure pas dans ton profil : « MBA Finance de marché »"));
}
{
  const unknown: CvDoc = { ...sent, experiences: [{ ...sent.experiences[0], company: "Société Inconnue" }] };
  ok("entreprise absente du profil", checkCv(unknown, profile).some((i) => i.level === "fix" && i.text.includes("« Société Inconnue » : aucune expérience de ton profil ne porte ce nom")));
}
{
  const hedge: CvDoc = { ...sent, experiences: [{ ...sent.experiences[1], bullets: ["Analyser les flux de données [chiffre à valider] et optimiser les requêtes via SQL et Power BI"] }] };
  ok("réserve « [chiffre à valider] » écrite dans le CV : à corriger", checkCv(hedge, profile).some((i) => i.level === "fix" && i.text.includes("« [chiffre à valider] » est écrite dans le CV")));
}
{
  const result: CvDoc = { ...sent, experiences: [{ ...sent.experiences[1], bullets: ["Analyser les flux de données et optimiser les requêtes via SQL et Power BI, réduisant le temps de reporting"] }] };
  ok("résultat que le profil ne dit pas : à relire", checkCv(result, profile).some((i) => i.level === "read" && i.text.includes("« réduisant le temps de reporting »")));
}
{
  const two: CvDoc = { ...sent, experiences: [{ ...sent.experiences[1], bullets: ["Analyser les flux 98% de fiabilité sur 250 jeux de données"] }] };
  ok("plusieurs chiffres : un seul message au pluriel", checkCv(two, profile).filter((i) => i.text.includes("chiffres")).length === 1);
}

// ---------- Ses vrais CV (contrôle du 6 novembre) : 37 CV sur 46 étaient signalés à tort pour leurs langues ----------
{
  const hers = { ...profile, languages: [{ name: "Français", level: "Langue maternelle" }, { name: "Anglais", level: "B1-B2 (intermédiaire)" }] } as unknown as Profile;
  const clean = enforceFacts(sent, profile).cv;
  const base = { ...clean, experiences: clean.experiences.map((e) => ({ ...e, bullets: e.bullets.map((b) => b.replace(/ \+15% d'efficacité/, "")) })) };
  const variants = ["Français (langue maternelle) · Anglais (B1-B2)", "Français (maternel) · Anglais (B1\u2011B2)", "Français (maternelle) · Anglais (B1-B2)", "Français (Langue maternelle) · Anglais (B1-B2)"];
  ok("les 4 façons d'écrire ses langues sur ses CV : aucun écart « Langues »", variants.every((v) => !checkCv({ ...base, languages: v }, hers).some((i) => i.text.startsWith("Langues"))));
  ok("un vrai écart de langue (C1) reste signalé, avec le texte propre du profil", checkCv({ ...base, languages: "Français (maternel) · Anglais (C1)" }, hers).some((i) => i.level === "fix" && i.text === "Langues : « Français (maternel) · Anglais (C1) » sur le CV, « Français (langue maternelle) · Anglais (B1-B2) » dans ton profil"));
}

// ---------- Entrées bizarres (anciens CV, contenu vide) ----------
ok("contenu absent, texte, vide ou d'un autre format : aucun contrôle, pas d'erreur", checkCv(null, profile).length === 0 && checkCv("texte", profile).length === 0 && checkCv({}, profile).length === 0 && checkCv(42, profile).length === 0 && checkCv({ foo: 1 }, profile).length === 0);
ok("ancien CV sans langues ni certifications : ne plante pas", Array.isArray(checkCv({ headline: "X", experiences: [{ company: "Orano", role: "", dates: "", bullets: [] }], education: [] } as unknown as CvDoc, profile)));
ok("isCv : un CV lisible oui, un document vide ou d'un autre format non", isCv(sent) && !isCv(null) && !isCv({}) && !isCv({ foo: 1 }) && !isCv("texte") && !isCv(42));
{
  const input = JSON.stringify(sent);
  checkCv(sent, profile);
  ok("le CV contrôlé n'est jamais modifié", JSON.stringify(sent) === input);
}

// ---------- Branchement ----------
const read = (f: string) => readFileSync(f, "utf8");
const page = read("app/mon-cv/controle/page.tsx");
ok("page : titre d'onglet propre", /export const metadata = \{ title: "Contrôle de mes CV" \}/.test(page));
ok("page : lit tous les CV page après page (fetchAll + order id), jamais avec un limit", page.includes("fetchAll((a, b) => supabase.from(\"documents\")") &&/\.eq\("kind", "cv"\)\.order\("id"\)/.test(page) && !/\.limit\(/.test(page));
ok("page : lecture seule (aucune écriture en base, aucun appel d'IA)", !/\.(insert|update|upsert|delete)\(/.test(page) && !page.includes("@/lib/ai") && !page.includes("spendAi"));
ok("page : les CV envoyés d'abord, via isUnsentApp et la candidature choisie", page.includes("isUnsentApp(app)") && page.includes("pickApplication(") && page.includes("Number(b.sent) - Number(a.sent)"));
ok("page : écarts lisibles par un lecteur d'écran (« À corriger : », « À relire : »)", page.includes("À corriger : ") && page.includes("À relire : "));
ok("page : « À corriger » et « À relire » sont deux sections ; un document illisible n'est jamais déclaré conforme", page.includes('title="À corriger"') && page.includes('title="À relire"') && page.includes("isCv(d.content)") && page.includes("unreadable"));
ok("Mon CV : lien vers le contrôle", read("app/mon-cv/page.tsx").includes('href="/mon-cv/controle"') && read("app/mon-cv/page.tsx").includes("Contrôler mes CV"));

// ---------- Titre du CV et intitulé de l'offre (7 novembre : « Data Engineer » sur une offre « Administrateur base de données ») ----------
{
  const titleIssues = (headline: string, offer?: string | null) => checkCv({ ...sent, headline }, profile, offer).filter((i) => i.text.startsWith("Titre du CV"));
  const bad = titleIssues("Data Engineer", "Administrateur base de données H/F");
  ok("titre du CV différent de l'offre : à corriger, avec les deux titres", bad.length === 1 && bad[0].level === "fix" && bad[0].text.includes("« Data Engineer »") && bad[0].text.includes("« Administrateur base de données »"), bad.map((i) => i.text).join("|"));
  ok("le même métier (H/F, pluriel, junior en plus) : rien à signaler", titleIssues("Administrateur Base de Données", "Administrateur Bases de Données H/F").length === 0 && titleIssues("Data Analyst", "Data Analyst Junior (H/F)").length === 0);
  ok("offre de niveau senior : le titre de l'IA est voulu, rien à signaler", titleIssues("Data Analyst", "Data Engineer Senior H/F").length === 0);
  ok("offre inconnue ou sans titre exploitable (ou appel sans titre) : rien à signaler", titleIssues("Data Analyst", null).length === 0 && titleIssues("Data Analyst", "").length === 0 && titleIssues("Data Analyst").length === 0);
  ok("un CV sans titre n'est pas accusé d'un mauvais titre", checkCv({ ...sent, headline: "" }, profile, "Data Analyst").every((i) => !i.text.startsWith("Titre du CV")));
  ok("la page de contrôle passe le titre de l'offre", readFileSync("app/mon-cv/controle/page.tsx", "utf8").includes("checkCv(d.content, profile, d.offers?.title)"));
}

done();
