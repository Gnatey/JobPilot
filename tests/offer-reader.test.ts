// Lecteur de pages en secours (Jina Reader) : seulement quand la lecture directe échoue, jamais dans la synchro,
// seule l'adresse part chez le prestataire, un mur de connexion ou une page d'erreur ne devient jamais une « annonce ».
// Aucun vrai appel réseau : un faux getter remplace Jina. L'effet sur de vraies annonces LinkedIn / Indeed n'est PAS testé ici.
import { readFileSync } from "node:fs";
import { parseReaderText, readViaReader, readerEnabled, READER_BASE } from "../lib/offer-reader";
import { readOfferWithReader } from "../lib/fetch-offer";
import { ok, done } from "./helpers";

const job = (n = 6) => Array.from({ length: n }, (_, i) => `Missions ${i} : analyser les données de vente, construire des tableaux de bord Power BI et présenter les résultats aux équipes métier chaque semaine.`).join("\n");
const jina = (body: string, head = "") => `Title: Data Analyst H/F - Acme\n\nURL Source: https://www.linkedin.com/jobs/view/123/\n\n${head}Markdown Content:\n${body}`;

// ---- parseReaderText
const good = parseReaderText(jina(`# Data Analyst\n![logo](https://x/y.png)\nVoir [le site](https://acme.fr/carrieres) pour postuler.\n${job()}`));
ok("une vraie annonce est gardée, sans en-tête du lecteur ni image ni adresse de lien", !!good && good.includes("Power BI") && !good.includes("Markdown Content") && !good.includes("logo") && good.includes("Voir le site pour postuler") && !good.includes("acme.fr/carrieres"), String(good).slice(0, 80));
ok("« Target URL returned error » : le site a refusé, rien", parseReaderText(jina(job(), "Warning: Target URL returned error 403: Forbidden\n\n")) === null);
ok("un mur de connexion court est refusé", parseReaderText(jina("Sign in to view this job. Join now or sign in to continue. " + "Rejoindre LinkedIn. ".repeat(14))) === null);
ok("une page « vérification anti-robot » est refusée", parseReaderText(jina("Just a moment... Verify you are human by completing the action below. ".repeat(6))) === null);
ok("une vraie annonce longue qui contient « Se connecter » dans son menu n'est PAS refusée", !!parseReaderText(jina(`Se connecter | Accueil\n${job(14)}`)));
ok("un texte trop court n'est pas une annonce", parseReaderText(jina("Data Analyst chez Acme, Paris.")) === null);
ok("sortie absurde : rien, sans erreur", parseReaderText(undefined as unknown as string) === null && parseReaderText("") === null);

// ---- readViaReader (faux réseau)
type Call = { url: string; headers: Record<string, string> };
const fake = (status: number, body: string, calls: Call[] = []) => async (url: string, o: { headers: Record<string, string> }) => { calls.push({ url, headers: o.headers }); return { status, body }; };
const URL1 = "https://www.linkedin.com/jobs/view/123/";
delete process.env.JINA_READER; delete process.env.JINA_API_KEY;
{
  const calls: Call[] = [];
  const t = await readViaReader(URL1, fake(200, jina(job()), calls));
  ok("l'adresse est envoyée au lecteur, rien d'autre", !!t && calls.length === 1 && calls[0].url === READER_BASE + URL1 && !Object.keys(calls[0].headers).some((h) => /cookie|profile/i.test(h)));
  ok("sans clé Jina, pas d'en-tête d'autorisation", calls[0].headers.Authorization === undefined);
  process.env.JINA_API_KEY = "cle-de-test";
  const c2: Call[] = [];
  await readViaReader(URL1, fake(200, jina(job()), c2));
  ok("avec une clé facultative, elle part en Bearer", c2[0].headers.Authorization === "Bearer cle-de-test");
  delete process.env.JINA_API_KEY;
}
{
  const calls: Call[] = [];
  ok("adresse interne : jamais envoyée au prestataire", await readViaReader("http://169.254.169.254/latest/meta-data", fake(200, jina(job()), calls)) === null && await readViaReader("http://localhost:3000/x", fake(200, jina(job()), calls)) === null && calls.length === 0);
  ok("adresse avec identifiants ou autre protocole : refusée", await readViaReader("https://user:pass@site.fr/offre", fake(200, jina(job()), calls)) === null && await readViaReader("javascript:alert(1)", fake(200, jina(job()), calls)) === null && await readViaReader("ftp://site.fr/o", fake(200, jina(job()), calls)) === null && calls.length === 0);
  ok("erreur 500 ou 429 du lecteur : rien", await readViaReader(URL1, fake(500, "x")) === null && await readViaReader(URL1, fake(429, "x")) === null);
  ok("réseau en panne : rien, sans erreur", await readViaReader(URL1, async () => { throw new Error("réseau"); }) === null);
  process.env.JINA_READER = "off";
  ok("JINA_READER=off : éteint, aucun appel", !readerEnabled() && await readViaReader(URL1, fake(200, jina(job()), calls)) === null && calls.length === 0);
  process.env.JINA_READER = "OFF ";
  ok("« OFF » avec espace éteint aussi", !readerEnabled());
  delete process.env.JINA_READER;
  ok("par défaut : allumé", readerEnabled());
}

// ---- readOfferWithReader : le lecteur n'est qu'un secours
const page = (body: string) => async () => ({ status: 200, body: `<html><head><title>Offre</title></head><body><main>${body}</main></body></html>` });
const blocked = async () => ({ status: 403, body: "" });
const gone404 = async () => ({ status: 404, body: "" });
const longText = job(8);
{
  let used = 0;
  const reader = async () => { used++; return "TEXTE DU LECTEUR " + longText; };
  const direct = await readOfferWithReader("https://acme.fr/o/1", page(longText), reader);
  ok("lecture directe réussie : le lecteur n'est pas appelé", !!direct.text && used === 0);
  const g = await readOfferWithReader("https://acme.fr/o/2", gone404, reader);
  ok("annonce retirée (404) : le lecteur n'est pas appelé, elle reste « retirée »", g.gone && g.text === null && used === 0);
  const b = await readOfferWithReader("https://www.linkedin.com/jobs/view/9/", blocked, reader);
  ok("site qui bloque : le lecteur prend le relais", b.text?.startsWith("TEXTE DU LECTEUR") === true && !b.gone && used === 1);
  const none = await readOfferWithReader("https://www.indeed.com/viewjob?jk=1", blocked, async () => null);
  ok("le lecteur n'obtient rien : même résultat qu'avant (texte vide, pas retirée)", none.text === null && !none.gone);
}

// ---- Câblage
const sync = readFileSync("lib/sync.ts", "utf8");
ok("la synchro automatique garde la lecture directe (pas d'appel en masse au prestataire)", /readOffer\(/.test(sync) && !sync.includes("readOfferWithReader") && !sync.includes("offer-reader"));
for (const f of ["app/api/offers/analyze/route.ts", "app/api/offers/[id]/reanalyze/route.ts", "app/api/recommendations/[id]/diagnostic/route.ts"]) {
  ok(`${f} : analyse demandée par une personne → lecteur de secours`, readFileSync(f, "utf8").includes("readOfferWithReader("));
}
const privacy = readFileSync("app/confidentialite/page.tsx", "utf8");
ok("la page Confidentialité nomme le lecteur quand il est allumé (et ce qu'il reçoit)", privacy.includes("readerEnabled()") && privacy.includes("Jina AI") && privacy.includes("il ne reçoit que l'adresse de l'annonce"));

done();
