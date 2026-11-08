// « Vérifier les annonces » : verdicts d'après la lecture de la page (sans IA), découpage en paquets, bilan. Aucun réseau : la lecture est simulée.
import { CHECK_BATCH, chunk, checkSummary, tally, verdictOf, type CheckResult } from "../lib/offer-check";
import { checkable } from "../lib/offer-check-read";
import { readOffer } from "../lib/fetch-offer";
import { LIMITS } from "../lib/rate-limit";
import { ok, done } from "./helpers";

type Get = NonNullable<Parameters<typeof readOffer>[1]>;
const page = (status: number, body = ""): Get => async () => ({ status, body });
const html = (title: string, body: string) => `<html><head><title>${title}</title></head><body><main>${body}</main></body></html>`;
const ad = "Nous recherchons un data analyst pour rejoindre notre équipe. Missions : construire des tableaux de bord, fiabiliser les données, accompagner les métiers. Profil : SQL, Power BI, rigueur. ".repeat(3);

// ---------- Verdicts : « disparue » seulement sur preuve ----------
ok("page 404 : disparue, avec la preuve", verdictOf(await readOffer("https://exemple.fr/o/1", page(404))) === "gone" && /404/.test((await readOffer("https://exemple.fr/o/1", page(404))).why ?? ""));
ok("page 410 : disparue", verdictOf(await readOffer("https://exemple.fr/o/1", page(410))) === "gone");
ok("403 (le site bloque les robots) : inconnue, JAMAIS disparue", verdictOf(await readOffer("https://exemple.fr/o/1", page(403))) === "unknown");
ok("429 et 999 : inconnues", verdictOf(await readOffer("https://exemple.fr/o/1", page(429))) === "unknown" && verdictOf(await readOffer("https://exemple.fr/o/1", page(999))) === "unknown");
ok("panne du site (500) : inconnue", verdictOf(await readOffer("https://exemple.fr/o/1", page(500))) === "unknown");
ok("réseau coupé (exception) : inconnue", verdictOf(await readOffer("https://exemple.fr/o/1", async () => { throw new Error("réseau"); })) === "unknown");
ok("« cette offre n'est plus disponible » : disparue", verdictOf(await readOffer("https://exemple.fr/o/1", page(200, html("Offre", "Cette offre n'est plus disponible.")))) === "gone");
ok("« offer expired » en anglais : disparue", verdictOf(await readOffer("https://exemple.fr/o/1", page(200, html("Job", "Sorry, this job has expired.")))) === "gone");
ok("une annonce lisible : en ligne", verdictOf(await readOffer("https://exemple.fr/o/1", page(200, html("Data analyst", ad)))) === "online");
ok("page de connexion ou page vide : inconnue (on ne devine pas)", verdictOf(await readOffer("https://exemple.fr/o/1", page(200, html("Connexion", "Sign in to continue")))) === "unknown");
const past = new Date(Date.now() - 10 * 864e5).toISOString().slice(0, 10);
const ld = (until: string) => `<html><head><script type="application/ld+json">${JSON.stringify({ "@type": "JobPosting", title: "Data analyst", validThrough: until, description: ad, hiringOrganization: { name: "Acme" } })}</script></head><body><main>${ad}</main></body></html>`;
// La date limite seule n'est PLUS une preuve (7 novembre) : beaucoup de sites la laissent dépassée sur une annonce toujours en ligne, et elle faisait classer « disparues » des offres lisibles
ok("date limite dépassée dans les données mais l'annonce se lit : en ligne (jamais disparue sur la date seule)", verdictOf(await readOffer("https://exemple.fr/o/1", page(200, ld(past)))) === "online");
ok("date limite à venir : en ligne", verdictOf(await readOffer("https://exemple.fr/o/1", page(200, ld(new Date(Date.now() + 20 * 864e5).toISOString().slice(0, 10))))) === "online");

// ---------- Quels liens lit-on ? ----------
ok("un site d'entreprise ou HelloWork se lit", checkable("https://www.hellowork.com/fr-fr/emplois/1.html") && checkable("https://careers.exemple.fr/o/1"));
ok("Indeed n'est pas lu (il refuse d'office)", !checkable("https://fr.indeed.com/viewjob?jk=abc"));
ok("pas de lien, ou un lien qui n'est pas http(s) : rien à lire", !checkable(null) && !checkable("") && !checkable("javascript:alert(1)") && !checkable("pas une adresse") && !checkable("ftp://exemple.fr/x"));

// ---------- Paquets ----------
const ids = Array.from({ length: 14 }, (_, i) => `a${i}`);
ok("14 lignes font 3 paquets d'au plus 6, dans l'ordre, sans perte", (() => { const c = chunk(ids, CHECK_BATCH); return c.length === 3 && c.every((x) => x.length <= CHECK_BATCH) && c.flat().join() === ids.join(); })());
ok("liste vide : aucun paquet ; taille absurde : jamais de boucle infinie", chunk([], 6).length === 0 && chunk([1, 2, 3], 0).length === 3);
ok("la limite de requêtes couvre 84 lignes (14 appels) avec de la marge", LIMITS.checkAds.max >= Math.ceil(84 / CHECK_BATCH) * 2 && LIMITS.checkAds.windowSec <= 86400);

// ---------- Bilan ----------
const res = (verdicts: CheckResult["verdict"][]): CheckResult[] => verdicts.map((verdict, i) => ({ id: `a${i}`, verdict, site: "HelloWork" }));
const t = tally(res(["gone", "gone", "online", "unknown", "skipped", "online"]));
ok("le décompte range chaque verdict", t.gone === 2 && t.online === 2 && t.unknown === 1 && t.skipped === 1);
ok("la phrase de bilan dit les trois choses", (() => { const s = checkSummary(t); return /2 annonces disparues/.test(s) && /2 encore en ligne/.test(s) && /2 impossibles à vérifier/.test(s); })());
ok("aucune disparue : dit « aucune »", /aucune annonce disparue/.test(checkSummary(tally(res(["online"])))));
ok("singulier", /1 annonce disparue/.test(checkSummary(tally(res(["gone"])))) && !/impossible/.test(checkSummary(tally(res(["gone"])))));
ok("une vérification arrêtée le dit", /arrêtée avant la fin/.test(checkSummary(t, true)) && !/arrêtée/.test(checkSummary(t, false)));

done();
