// CV généré : tout texte se modifie à l'écran, un texte vidé disparaît, les projets « Toujours sur mes CV » sont remis, les doublons et tirets invisibles disparaissent.
import { readFileSync } from "node:fs";
import { cleanCvText, joinDates, pinProjects, setBullet, setCert, setEdu, setExp, setProject, setSkill, setTail } from "../lib/cv-edit";
import { dedupeCert, enforceFacts } from "../lib/cv-facts";
import { educationEntries, tailLines } from "../lib/cv-format";
import type { CvDoc, Profile } from "../lib/types";
import { ok, done } from "./helpers";

const cv = (patch: Partial<CvDoc> = {}): CvDoc => ({
  headline: "Data Analyst", summary: "Résumé",
  experiences: [{ company: "SNCF", role: "Assistante cheffe de projet numérique", location: "Saint-Denis", dates: "Sept 2024 - Sept 2025", bullets: ["Assurer le support niveau 3", "Planifier les jalons"] }],
  education: [{ degree: "Master Data Management", school: "PSB", dates: "2023-2025" }, { degree: "DUT STID", school: "Sorbonne Paris Nord", dates: "2020-2022" }],
  skills: [{ label: "Bases de données", items: "MySQL, PostgreSQL" }, { label: "BI", items: "Power BI" }],
  projects: [{ name: "Base de données relationnelle", description: "MySQL Workbench" }, { name: "Détection de Deepfakes", description: "Streamlit" }],
  certifications: ["OpenClassrooms – SQL, Excel", "DataCamp – Python"], languages: "Français (langue maternelle) · Anglais (B1-B2)", extras: "Voyages",
  ats_keywords_used: [], notes_for_candidate: [], ...patch,
});
const clone = <T,>(x: T): T => structuredClone(x);

// ---------- Poste et formation ----------
{
  const c = clone(cv());
  setExp(c, 0, "role", "  Chargée de projet  ");
  setExp(c, 0, "dates", "Sept 2024 – Sept 2025");
  setExp(c, 0, "location", "");
  setEdu(c, 1, "school", "Université Sorbonne Paris Nord");
  ok("poste : intitulé et dates modifiés, espaces retirés", c.experiences[0].role === "Chargée de projet" && c.experiences[0].dates === "Sept 2024 – Sept 2025");
  ok("lieu vidé : vide (le modèle ne l'affiche plus)", c.experiences[0].location === "");
  ok("formation : école modifiée sans toucher les autres", c.education[1].school === "Université Sorbonne Paris Nord" && c.education[0].school === "PSB");
  setExp(c, 7, "role", "x"); setEdu(c, 9, "degree", "x");
  ok("un indice qui n'existe plus ne casse rien", c.experiences.length === 1 && c.education.length === 2);
}

// ---------- Puces : Entrée en ouvre une, vidée elle disparaît ----------
{
  const c = clone(cv());
  setBullet(c, 0, 0, "Assurer le support niveau 3\nAnimer des formations");
  ok("Entrée dans une puce : deux puces à sa place", c.experiences[0].bullets.join("|") === "Assurer le support niveau 3|Animer des formations|Planifier les jalons");
  setBullet(c, 0, 1, "");
  ok("puce vidée : retirée, les autres restent dans l'ordre", c.experiences[0].bullets.join("|") === "Assurer le support niveau 3|Planifier les jalons");
  setBullet(c, 0, 0, "  Texte modifié  ");
  ok("puce modifiée", c.experiences[0].bullets[0] === "Texte modifié");
}

// ---------- Projets, compétences ----------
{
  const c = clone(cv());
  setProject(c, 0, "description", "");
  ok("description vidée mais nom présent : le projet reste", c.projects.length === 2 && c.projects[0].description === "");
  setProject(c, 0, "name", "");
  ok("nom ET description vidés : le projet disparaît", c.projects.length === 1 && c.projects[0].name === "Détection de Deepfakes");
  setSkill(c, 0, "label", "Bases de données et SQL");
  ok("intitulé de compétences modifié", c.skills[0].label === "Bases de données et SQL" && c.skills[0].items === "MySQL, PostgreSQL");
  setSkill(c, 1, "items", ""); setSkill(c, 1, "label", "");
  ok("ligne de compétences entièrement vidée : retirée", c.skills.length === 1);
}

// ---------- Langues, certifications, intérêts ----------
{
  const c = clone(cv());
  setTail(c, "languages", "Français · Anglais (B1-B2)");
  setTail(c, "extras", "");
  setTail(c, "certifications", "OpenClassrooms – SQL · DataCamp – Python · Google – Data Analytics");
  ok("langues modifiées", c.languages === "Français · Anglais (B1-B2)");
  ok("intérêts vidés : la ligne disparaît du CV", !tailLines(c).some((l) => l.field === "extras"));
  ok("certifications : une par segment « · »", c.certifications.length === 3 && c.certifications[2] === "Google – Data Analytics");
  setCert(c, 1, "");
  ok("une certification vidée disparaît", c.certifications.length === 2 && c.certifications[1] === "Google – Data Analytics");
  setCert(c, 0, "OpenClassrooms – SQL avancé");
  ok("une certification modifiée", c.certifications[0] === "OpenClassrooms – SQL avancé");
  const lines = tailLines(cv());
  ok("chaque ligne finale sait quel champ elle modifie", lines.map((l) => l.field).join(",") === "languages,certifications,extras");
}

// ---------- Dates en marge (modèle chronologique) ----------
{
  ok("dates sur deux lignes remises sur une ligne", joinDates("Sept 2024 –\nSept 2025") === "Sept 2024 – Sept 2025");
  ok("dates déjà sur une ligne : inchangées", joinDates("2023-2025") === "2023-2025");
  const order = educationEntries(cv()).map((x) => x.i).join(",");
  ok("formations : l'indice garde la place dans le CV (pour modifier la bonne)", order === "0,1");
  const rev = cv({ education: [{ degree: "DUT", school: "S", dates: "2020-2022" }, { degree: "Master", school: "P", dates: "2023-2025" }] });
  const e = educationEntries(rev);
  ok("formations triées du plus récent au plus ancien, avec leur place d'origine", e[0].e.degree === "Master" && e[0].i === 1 && e[1].i === 0);
}

// ---------- Projets « Toujours sur mes CV » ----------
const profile = {
  projects: [
    { name: "Base de données relationnelle", description: "MySQL", tags: [] },
    { name: "Site JobPilot - Indépendante (auto-entreprise)", description: "Application web de suivi de candidatures (Next.js, Supabase).", tags: ["Supabase"], link: "https://jobpilot-ashy.vercel.app/", pin: true },
    { name: "Jeux SOMNIUM - Indépendante (auto-entreprise)", description: "Jeu d'horreur 2D", tags: [], link: "https://dendeylight.itch.io/somnium" },
  ],
} as unknown as Profile;
{
  const r = pinProjects(cv(), profile);
  const j = r.projects.find((p) => /JobPilot/.test(p.name));
  ok("projet épinglé absent du CV : remis, avec son texte et son lien du profil", !!j && j.description.includes("Supabase") && j.link === "https://jobpilot-ashy.vercel.app/");
  ok("2 projets de l'IA + 1 épinglé = 3 : rien n'est retiré", r.projects.length === 3);
  ok("les projets choisis par l'IA pour l'offre restent devant", r.projects[0].name === "Base de données relationnelle");
  ok("un projet non épinglé n'est jamais ajouté", !r.projects.some((p) => /SOMNIUM/.test(p.name)));
}
{
  const withIt = cv({ projects: [{ name: "Site JobPilot", description: "Ma propre formulation", link: "x" }, { name: "Base de données relationnelle", description: "MySQL" }, { name: "Détection de Deepfakes", description: "Streamlit" }] });
  const r = pinProjects(withIt, profile);
  ok("projet épinglé déjà choisi par l'IA (nom proche) : gardé tel quel, pas de doublon", r.projects.length === 3 && r.projects.filter((p) => /JobPilot/.test(p.name)).length === 1 && r.projects[0].description === "Ma propre formulation");
}
{
  const full = cv({ projects: [{ name: "A projet", description: "a" }, { name: "B projet", description: "b" }, { name: "C projet", description: "c" }] });
  const r = pinProjects(full, profile);
  ok("CV déjà à 3 projets : l'épinglé entre, le dernier non épinglé sort", r.projects.length === 3 && r.projects.some((p) => /JobPilot/.test(p.name)) && !r.projects.some((p) => p.name === "C projet") && r.projects[0].name === "A projet");
}
{
  const none = { projects: [{ name: "X", description: "y", tags: [] }] } as unknown as Profile;
  const c0 = cv();
  ok("aucun projet épinglé : le CV ne change pas", pinProjects(c0, none) === c0);
  const empty = { projects: [{ name: "Vide", description: "", tags: ["Python", "SQL"], pin: true }] } as unknown as Profile;
  ok("épinglé sans description : les outils du profil servent de ligne", pinProjects(cv({ projects: [] }), empty).projects[0].description === "Python, SQL");
}

// ---------- Certifications en double et tirets invisibles ----------
{
  const dup = "OpenClassrooms : Python pour l'analyse de données, SQL, Objectif IA, Excel, ChatGPT & productivité, SQL, Python pour l'analyse de données, HTML5, CSS3, Web fundamentals";
  ok("un intitulé écrit deux fois n'est gardé qu'une fois (l'ordre du premier est conservé)", dedupeCert(dup) === "OpenClassrooms : Python pour l'analyse de données, SQL, Objectif IA, Excel, ChatGPT & productivité, HTML5, CSS3, Web fundamentals");
  ok("sans doublon : inchangé", dedupeCert("DataCamp : Python") === "DataCamp : Python");
  ok("majuscules et accents ne font pas deux intitulés", dedupeCert("X : Données, donnees, DONNÉES") === "X : Données");
  ok("une virgule entre parenthèses ne sépare rien", dedupeCert("X : Excel (tableaux, formules), SQL") === "X : Excel (tableaux, formules), SQL");
  ok("sans fournisseur (pas de « : ») : dédoublonné aussi", dedupeCert("SQL, SQL, Python") === "SQL, Python");
  const profileCerts = { identity: { name: "J" }, languages: [], education: [], experiences: [], projects: [], certifications: [dup, "DataCamp : Python"] } as unknown as Profile;
  const r = enforceFacts(cv({ certifications: [dup, "DataCamp : Python", "DataCamp : Python"] }), profileCerts);
  ok("enforceFacts : doublons retirés dans une certification et entre deux certifications identiques", r.cv.certifications.length === 2 && (r.cv.certifications[0].match(/SQL/g) ?? []).length === 1 && (r.cv.certifications[0].match(/Python pour/g) ?? []).length === 1);
  const c = cleanCvText(cv({ skills: [{ label: "Automatisation", items: "CI‑CD, Front‑to‑Back, GitHub Actions" }], summary: "Maîtrise de l'automatisation CI‑CD" }));
  ok("tiret insécable remplacé par un tiret simple, dans tout le CV", c.skills[0].items === "CI-CD, Front-to-Back, GitHub Actions" && c.summary.endsWith("CI-CD") && !JSON.stringify(c).includes("‑"));
  ok("le reste du texte (accents, apostrophes, nombres) n'est pas touché", c.education[0].degree === "Master Data Management" && cleanCvText(12) === 12 && cleanCvText(null) === null);
}

// ---------- Aucun texte du CV n'est figé dans un modèle ----------
{
  const src = readFileSync("components/cv-templates.tsx", "utf8");
  const BARE = /(?<!v=)\{((?:x\.(?:role|company|location|dates))|(?:e\.(?:degree|school|dates))|(?:p\.(?:name|description))|(?:s\.(?:label|items))|cv\.(?:languages|extras))\}/g;
  ok("le contrôle lui-même repère un champ figé (et laisse passer v={…})", [..."<p>{x.role}</p>".matchAll(BARE)].length === 1 && [...'<F v={x.role} on={f} />'.matchAll(BARE)].length === 0);
  const bare = [...src.matchAll(BARE)].map((m) => m[1]);
  ok("aucun champ de poste, de formation, de projet ou de compétence affiché sans pouvoir être modifié", bare.length === 0, bare.join(", "));
  ok("le titre « Expériences et missions » n'existe plus (« Expériences » suffit)", !/Expériences et missions/.test(src));
  const used = ["Classique", "Moderne", "Esn", "Compact", "Colonnes", "Timeline", "Elegant", "Bandeau"].every((n) => new RegExp(`export function ${n}\\(`).test(src));
  ok("les 8 modèles sont toujours là", used);
  ok("puces : le nombre de puces fait partie de la clé (sinon « Entrée » en fin de puce laisse l'ancien texte à l'écran)", /key=\{`\$\{i\}-\$\{j\}-\$\{b\}-\$\{cv\.experiences\[i\]\.bullets\.length\}`\}/.test(src));
  const noUpdTail = /<Tail cv=\{cv\}(?![^>]*upd=)/.test(src);
  ok("les lignes finales (langues, certifications, intérêts) se modifient dans chaque modèle", !noUpdTail);
}

// ---------- Génération : l'ordre des étapes ----------
{
  const ai = readFileSync("lib/ai.ts", "utf8");
  ok("generateCv : faits du profil, projets épinglés, garde-fou, puis nettoyage des tirets, puis liens", /guardCv\(pinProjects\(enforceFacts\(cv, profile\)\.cv, profile\), profile\)/.test(ai) && /attachLinks\(cleanCvText\(checked\)/.test(ai));
  const page = readFileSync("app/profil/page.tsx", "utf8");
  ok("la case « Toujours sur mes CV » est dans le profil", /Toujours sur mes CV/.test(page) && /pin: ev\.target\.checked/.test(page));
}

done();
