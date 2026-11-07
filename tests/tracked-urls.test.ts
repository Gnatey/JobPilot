// Liens de suivi des e-mails HelloWork : l'adresse réelle de l'annonce est dans le jeton ; Indeed sans texte est mis de côté d'office dans la file.
import { detectSource, normalizeJobUrl, untrackUrl } from "../lib/fetch-offer";
import { NOT_READABLE_SITES, buildQueue, type QueueApp, type QueueReco } from "../lib/analyze-queue";
import { ok, done } from "./helpers";

// Un lien de suivi comme ceux des e-mails HelloWork, fabriqué ici (jamais une vraie adresse e-mail dans le dépôt).
const tracked = (target: string, who = "personne@exemple.fr") => `https://emails.hellowork.com/clic/463bbe22-0281-406c-86a8-984aa291cea8/50/6f1f05387268354f2a015991644ac527/${Buffer.from(`${who}\u{1F8A8}${target}`).toString("base64url")}`;
const real = "https://www.hellowork.com/fr-fr/emplois/82945204.html";

// ---------- Décodage du lien de suivi ----------
const t1 = tracked(`${real}?utm_source=pushOffres_connexes&utm_term=82945204&utm_content=liste2title`);
ok("le lien de suivi HelloWork donne l'adresse réelle de l'annonce", untrackUrl(t1).startsWith(real));
ok("seule l'adresse de l'annonce est gardée : jamais l'adresse e-mail du jeton", !untrackUrl(t1).includes("exemple.fr") && !untrackUrl(t1).includes("@") && !normalizeJobUrl(t1).includes("@"));
ok("l'adresse canonique est sans aucun paramètre de suivi", normalizeJobUrl(t1) === real);
ok("deux e-mails, deux jetons différents, même annonce : la même adresse (plus de doublon)", normalizeJobUrl(t1) === normalizeJobUrl(tracked(`${real}?utm_source=pushOffres&utm_medium=email&utm_campaign=pushOffres&utm_term=1&utm_content=liste1title`, "autre@exemple.fr")));
ok("le site est reconnu : HelloWork", detectSource(t1) === "HelloWork" && detectSource(normalizeJobUrl(t1)) === "HelloWork");
ok("une adresse HelloWork directe est nettoyée de la même façon", normalizeJobUrl(`${real}?utm_source=x&utm_term=9`) === real);
ok("une page HelloWork qui n'est pas une annonce garde son adresse (sans les marqueurs utm)", normalizeJobUrl("https://www.hellowork.com/fr-fr/metiers/data-analyst.html?utm_source=x") === "https://www.hellowork.com/fr-fr/metiers/data-analyst.html");

// ---------- Sécurité du décodage ----------
ok("un jeton qui mène ailleurs que sur hellowork.com n'est PAS suivi", untrackUrl(tracked("https://site-pirate.example/x")) === tracked("https://site-pirate.example/x"));
ok("un faux site « hellowork.com.pirate.fr » n'est pas suivi", untrackUrl(tracked("https://hellowork.com.pirate.fr/x")).startsWith("https://emails.hellowork.com/clic/"));
ok("un jeton illisible ou vide laisse l'adresse telle quelle", untrackUrl("https://emails.hellowork.com/clic/a/b/c/%%%") === "https://emails.hellowork.com/clic/a/b/c/%%%" && untrackUrl("https://emails.hellowork.com/clic/") === "https://emails.hellowork.com/clic/");
ok("un autre domaine que emails.hellowork.com n'est jamais décodé", untrackUrl(tracked(real).replace("emails.hellowork.com", "autre.example")).startsWith("https://autre.example/"));
ok("pas une adresse : renvoyée telle quelle, sans erreur", untrackUrl("pas une adresse") === "pas une adresse" && normalizeJobUrl("pas une adresse") === "pas une adresse");
ok("les autres sites ne changent pas (LinkedIn, Indeed)", normalizeJobUrl("https://www.linkedin.com/jobs/view/123456/?trk=x") === "https://www.linkedin.com/jobs/view/123456/" && normalizeJobUrl("https://fr.indeed.com/viewjob?jk=abc&from=x") === "https://fr.indeed.com/viewjob?jk=abc");

// ---------- La file : Indeed sans texte est mis de côté d'office ----------
const snippet = "Analyse de données pour la direction. ".repeat(5); // 190 caractères : un extrait
const apps: QueueApp[] = [
  { id: "i1", title: "Indeed sans rien", company: "A", url: "https://fr.indeed.com/viewjob?jk=111", created_at: "2026-11-01" },
  { id: "i2", title: "Indeed avec extrait", company: "B", url: "https://fr.indeed.com/viewjob?jk=222", created_at: "2026-11-01" },
  { id: "l1", title: "LinkedIn sans rien", company: "C", url: "https://www.linkedin.com/jobs/view/333/", created_at: "2026-11-01" },
  { id: "h1", title: "HelloWork suivi", company: "D", url: t1, created_at: "2026-11-01" },
  { id: "w1", title: "Site entreprise", company: "E", url: "https://exemple.fr/offre", created_at: "2026-11-01" },
  { id: "n1", title: "Sans lien", company: "F", url: null, created_at: "2026-11-01" },
  { id: "i3", title: "Indeed annonce lue", company: "G", url: "https://fr.indeed.com/viewjob?jk=444", created_at: "2026-11-01" },
];
const recos: QueueReco[] = [
  { id: "r2", title: "Indeed avec extrait", company: "B", url: "https://fr.indeed.com/viewjob?jk=222", quick_score: 60, source: "Indeed", origin: "email", snippet },
  { id: "r3", title: "Indeed annonce lue", company: "G", url: "https://fr.indeed.com/viewjob?jk=444", quick_score: 70, source: "Indeed", origin: "page", snippet: "x".repeat(500) },
];
const q = buildQueue(apps, recos);
ok("Indeed est le site mis de côté (LinkedIn n'y est pas : ses annonces se lisent au moins en partie)", NOT_READABLE_SITES.join() === "Indeed");
ok("Indeed sans texte ni extrait : mis de côté d'office, jamais tenté", q.blocked.map((b) => b.app_id).join() === "i1" && !q.items.some((i) => i.app_id === "i1"));
ok("la ligne mise de côté garde son lien, son site et son titre pour le bilan", q.blocked[0].url === "https://fr.indeed.com/viewjob?jk=111" && q.blocked[0].site === "Indeed" && q.blocked[0].title === "Indeed sans rien" && q.blocked[0].company === "A");
ok("Indeed AVEC un extrait ou l'annonce lue : toujours analysé", q.items.some((i) => i.app_id === "i2" && i.extract) && q.items.some((i) => i.app_id === "i3" && i.full));
ok("LinkedIn sans texte : toujours tenté (lecture ou lecteur de secours)", q.items.some((i) => i.app_id === "l1" && i.site === "LinkedIn"));
ok("HelloWork (lien de suivi), site d'entreprise : tentés, avec leur site", q.items.find((i) => i.app_id === "h1")?.site === "HelloWork" && q.items.find((i) => i.app_id === "w1")?.site === "Site entreprise");
ok("sans lien ni texte : écartée comme avant, pas dans les lignes mises de côté", q.skipped.map((s) => s.id).join() === "n1" && !q.blocked.some((b) => b.app_id === "n1"));
ok("rien n'est perdu : chaque ligne est dans la file, mise de côté ou écartée", q.items.length + q.blocked.length + q.skipped.length === apps.length);
done();
