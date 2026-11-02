// Raisons d'écart, lecture d'annonces, bandeau du favori, file de « Tout analyser » : logique pure, sans réseau.
import { cleanReason, reasonKey, reasonNote, rejectLabel, rejectLabelInline, withReasonNote } from "../lib/types";
import { detectSource, looksGone, normalizeJobUrl, readOffer, unreadableMessage } from "../lib/fetch-offer";
import { withHeader } from "../lib/offer-header";
import { buildQueue, type QueueApp, type QueueReco } from "../lib/analyze-queue";
import { isClose } from "../components/ui/score";
import { preBand, requiredYears } from "../lib/quick-score";
import { ok, done } from "./helpers";

// --- « Autre » avec pourquoi libre
ok("autre + texte → autre: texte (espaces nettoyés)", withReasonNote("autre", "  offre   100 % en anglais ") === "autre: offre 100 % en anglais");
ok("autre sans texte → autre", withReasonNote("autre", "  ") === "autre" && withReasonNote("autre") === "autre");
ok("une autre raison ignore le texte", withReasonNote("metier", "x") === "metier");
ok("texte borné à 200 caractères", withReasonNote("autre", "a".repeat(500)).length === "autre: ".length + 200);
ok("reasonKey / reasonNote", reasonKey("autre: en anglais") === "autre" && reasonNote("autre: en anglais") === "en anglais" && reasonKey("metier") === "metier" && reasonKey(null) === null && reasonNote("autre") === "");
ok("cleanReason : null, borne, normalise", cleanReason(null) === null && cleanReason("") === null && cleanReason("x".repeat(100))!.length === 40 && cleanReason("autre:    ") === "autre" && cleanReason("autre:  ok ") === "autre: ok");
ok("rejectLabel affiche le pourquoi libre", rejectLabel("autre: en anglais") === "Autre : en anglais" && rejectLabel("autre") === "Autre" && rejectLabel("trop_senior") === "Trop senior");
ok("rejectLabelInline : minuscule seulement sans pourquoi libre", rejectLabelInline("trop_senior") === "trop senior" && rejectLabelInline("autre: En anglais") === "Autre : En anglais");

// --- Sources et lecture d'annonces
ok("Glassdoor reconnu", detectSource("https://www.glassdoor.fr/job-listing/data-analyst-JV_IC123.htm") === "Glassdoor" && detectSource("https://fr.indeed.com/viewjob?jk=1") === "Indeed" && detectSource("https://example.com/job") === "Site entreprise");
ok("message d'échec : nomme Glassdoor / Indeed / LinkedIn", /Glassdoor/.test(unreadableMessage("https://www.glassdoor.com/x")) && /Indeed/.test(unreadableMessage("https://fr.indeed.com/viewjob?jk=1")) && /LinkedIn/.test(unreadableMessage("https://www.linkedin.com/jobs/view/1/")));
ok("message d'échec : site inconnu → pas de faux nom", !/Glassdoor|Indeed|LinkedIn/.test(unreadableMessage("https://example.com/job")));
ok("looksGone : annonce retirée", looksGone("Cette offre n'est plus disponible.") && looksGone("This job has expired") && !looksGone("Data Analyst chez Acme, CDI à Paris"));
ok("normalizeJobUrl : LinkedIn et Indeed", normalizeJobUrl("https://www.linkedin.com/jobs/view/12345/?trk=abc") === "https://www.linkedin.com/jobs/view/12345/" && normalizeJobUrl("https://fr.indeed.com/viewjob?jk=abc&from=x") === "https://fr.indeed.com/viewjob?jk=abc");

const page = (body: string) => `<html><head><title>t</title></head><body><main>${body}</main></body></html>`;
const getter = (status: number, body: string) => async () => ({ status, body });
ok("readOffer : 404 → retirée", (await readOffer("https://x.test/a", getter(404, ""))).gone === true);
ok("readOffer : 403 → illisible, pas retirée", JSON.stringify(await readOffer("https://x.test/a", getter(403, ""))) === JSON.stringify({ text: null, gone: false }));
ok("readOffer : texte « n'est plus disponible » → retirée", (await readOffer("https://x.test/a", getter(200, page("<h1>Offre</h1><p>Cette offre n'est plus disponible.</p>")))).gone === true);
const longText = "Data analyst confirmé pour notre équipe finance, missions variées autour de SQL et Power BI. ".repeat(8);
const r = await readOffer("https://x.test/a", getter(200, page(`<p>${longText}</p>`)));
ok("readOffer : vraie annonce lue", r.gone === false && (r.text ?? "").includes("Power BI"));

// --- Bandeau de l'annonce (favori)
const desc = "Vos missions : construire des tableaux de bord Power BI, automatiser des reportings SQL pour la direction financière du groupe.";
const pageText = `Menu Emplois Entreprises\nBusiness Controller H/F\nDekra Personnel · Paris\nCDI · 45 000 – 50 000 € / an · Bac+5 · 3 ans d'expérience\n${desc}\nPostuler`;
const withBand = withHeader(desc, pageText, "Business Controller - HelloWork");
ok("bandeau : salaire, expérience et études rejoignent la description", /45 000/.test(withBand) && /Bac\+5/.test(withBand) && /3 ans/.test(withBand) && withBand.includes(desc), withBand.slice(0, 80));
ok("bandeau : page = description → inchangé", withHeader(desc, desc) === desc);
const otherDesc = "Texte sélectionné avec une mise en forme différente de celle de la page affichée dans le navigateur.";
ok("bandeau : description introuvable dans la page → début de la page", /45 000/.test(withHeader(otherDesc, pageText + "\nSimilaires : Data Analyst, BI Developer, Contrôleur de gestion")));

// --- Pré-score et étoile d'accueil
ok("étoile : seulement ≥ 70", isClose(70) && isClose(95) && !isClose(69) && !isClose(null) && preBand(55).id === "maybe" && preBand(10).id === "far");
ok("requiredYears : non précisé → null", requiredYears("Rejoignez une équipe dynamique") === null && requiredYears("5 ans d'expérience minimum") === 5);

// --- File de « Tout analyser »
const apps: QueueApp[] = [
  { id: "a1", title: "Data Analyst", company: "Acme", url: "https://fr.indeed.com/viewjob?jk=aaa&from=x", created_at: "2026-11-01" },
  { id: "a2", title: "BI Developer", company: "Beta", url: "https://www.welcometothejungle.com/fr/jobs/bi", created_at: "2026-11-02" },
  { id: "a3", title: "Sans rien", company: "Gamma", url: null, created_at: "2026-11-02" },
  { id: "a4", title: "Contrôleur", company: "Delta", url: null, created_at: "2026-10-30" },
  { id: "a5", title: "Inconnu", company: "Eps", url: "https://example.com/x", created_at: "2026-10-29" },
];
const snippet = "Analyse de données pour la direction. ".repeat(5); // 190 caractères : un extrait (≥ 150, < 300), pas une annonce complète
const recos: QueueReco[] = [
  { id: "r1", title: "Data Analyst", company: "Acme", url: "https://fr.indeed.com/viewjob?jk=aaa", quick_score: 62, source: "Indeed", origin: "email", snippet },
  { id: "r2", title: "BI Developer", company: "Beta", url: "https://www.welcometothejungle.com/fr/jobs/bi", quick_score: 81, source: "Welcome to the Jungle", origin: "page", snippet: "x".repeat(400) },
  { id: "r4", title: "Contrôleur", company: "Delta", url: null, quick_score: 40, source: "APEC", origin: "email", snippet },
];
const q = buildQueue(apps, recos);
ok("file : meilleur pré-score d'abord", q.items.map((i) => i.app_id).join() === "a2,a1,a4,a5", q.items.map((i) => i.app_id).join());
ok("file : Indeed n'est pas exclu, analysé sur extrait", q.items.find((i) => i.app_id === "a1")?.extract === true && q.items.find((i) => i.app_id === "a1")?.full === false);
ok("file : annonce lue en entier = complète", q.items.find((i) => i.app_id === "a2")?.full === true);
ok("file : rapprochement par titre + entreprise quand le lien manque", q.items.find((i) => i.app_id === "a4")?.reco_id === "r4");
ok("file : lien seul (sans reco) = à tenter, sans score, en dernier", q.items[q.items.length - 1].app_id === "a5" && q.items[q.items.length - 1].quick_score === null);
ok("file : ni lien, ni texte, ni extrait → écartée de la file", q.skipped.map((s) => s.id).join() === "a3");
done();
