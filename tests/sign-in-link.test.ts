// Liens de connexion automatique (« magic link » des e-mails) : jamais lus par le serveur, jamais envoyés au lecteur de secours, jamais gardés en base.
// Les jetons ci-dessous sont des FAUX, écrits pour ce test. Aucun réseau.
import { isSignInLink, normalizeJobUrl, readOffer, readOfferWithReader, untrackUrl } from "../lib/fetch-offer";
import { checkable, checkTarget } from "../lib/offer-check-read";
import { NEUTRAL_REASONS } from "../lib/types";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ok, done } from "./helpers";

const src = (f: string) => readFileSync(join(process.cwd(), f), "utf8");
const magic = "https://www.exemple-freelance.fr/magic-authentication?magic-token=FAUX_JETON_DE_TEST_0123456789&next-page=%2Fdetail-annonce%3FrecordId%3DrecFAUX";

// ---------- Reconnaître un lien de connexion ----------
ok("une adresse /magic-authentication est un lien de connexion", isSignInLink(magic));
ok("un paramètre magic-token suffit", isSignInLink("https://exemple.fr/offre/1?magic-token=FAUX"));
ok("auth_token, login-token, access_token, otp aussi", ["auth_token", "login-token", "access_token", "otp", "one-time-token"].every((k) => isSignInLink(`https://exemple.fr/o?${k}=FAUX`)));
ok("une annonce ordinaire n'en est pas un", !isSignInLink("https://www.hellowork.com/fr-fr/emplois/12345.html") && !isSignInLink("https://careers.exemple.fr/jobs?page=2"));
ok("les jetons de SUIVI LinkedIn (midToken, trackingId) ne sont PAS des connexions", !isSignInLink("https://www.linkedin.com/comm/jobs/view/123?midToken=AAA&trackingId=BBB&midSig=CCC"));
ok("vide, absent ou illisible : non", !isSignInLink(null) && !isSignInLink("") && !isSignInLink("pas une adresse"));

// ---------- Jamais lu ----------
{
  let calls = 0;
  const get = async () => { calls++; return { status: 200, body: "<html><body><main>" + "Une vraie annonce. ".repeat(40) + "</main></body></html>" }; };
  const r = await readOffer(magic, get);
  ok("readOffer ne fait AUCUNE requête vers un lien de connexion", calls === 0 && r.text === null && r.gone === false);
  const r2 = await readOffer("https://exemple.fr/o/1", get);
  ok("une adresse ordinaire se lit toujours", calls === 1 && !!r2.text);
}
{
  let reader = 0;
  const get = async () => ({ status: 200, body: "<html><body>connexion</body></html>" });
  const r = await readOfferWithReader(magic, get, async () => { reader++; return "texte du lecteur ".repeat(40); });
  ok("le lecteur de secours ne reçoit JAMAIS un lien de connexion (l'adresse irait chez un tiers)", reader === 0 && r.text === null);
  const r2 = await readOfferWithReader("https://exemple.fr/o/2", get, async () => { reader++; return "texte du lecteur ".repeat(40); });
  ok("pour une adresse ordinaire, le lecteur de secours sert toujours", reader === 1 && !!r2.text);
}

// ---------- Jamais gardé ----------
{
  const n = normalizeJobUrl(magic);
  ok("le jeton est retiré de l'adresse enregistrée", !n.includes("FAUX_JETON") && !/magic-token/i.test(n));
  ok("l'adresse enregistrée est celle de l'ANNONCE (next-page), pas la page de connexion : le bouton « Annonce » et le favori y mènent", n === "https://www.exemple-freelance.fr/detail-annonce?recordId=recFAUX", n);
  ok("…et ce n'est plus un lien de connexion (aucun jeton, rien d'ouvert par erreur)", !isSignInLink(n) && checkable(n));
  ok("deux e-mails pour la même annonce donnent la même adresse (plus de doublon par jeton)", normalizeJobUrl(magic) === normalizeJobUrl(magic.replace("FAUX_JETON_DE_TEST_0123456789", "AUTRE_FAUX_JETON_9876543210")));
  const evil = (next: string) => `https://www.exemple-freelance.fr/magic-authentication?magic-token=FAUX&next-page=${encodeURIComponent(next)}`;
  ok("une destination vers un AUTRE site n'est jamais suivie (pas de redirection ouverte) : on garde la page de connexion, sans jeton",
    ["https://evil.example/x", "//evil.example/x", "\\\\evil.example", "javascript:alert(1)"].every((d) => { const r = normalizeJobUrl(evil(d)); return new URL(r).hostname === "www.exemple-freelance.fr" && !/magic-token/i.test(r) && !/\/magic-authentication/.test(new URL(r).pathname.replace("/magic-authentication", "")); }));
  ok("sans destination : la page de connexion reste, sans jeton", normalizeJobUrl("https://www.exemple-freelance.fr/magic-authentication?magic-token=FAUX") === "https://www.exemple-freelance.fr/magic-authentication");
  ok("une destination qui est elle-même un lien de connexion n'est pas suivie", !normalizeJobUrl(evil("/magic-authentication?magic-token=AUTRE")).includes("AUTRE"));
  ok("une adresse ordinaire reste telle quelle", normalizeJobUrl("https://exemple.fr/o/1?utm_source=x") === "https://exemple.fr/o/1");
}

// ---------- « Vérifier les annonces » ----------
ok("un lien de connexion n'est pas vérifiable (jamais ouvert)", !checkable(magic));
{
  const tracked = "https://emails.hellowork.com/clic/abc/" + Buffer.from("https://www.hellowork.com/fr-fr/emplois/777.html?utm=1").toString("base64url");
  ok("un lien de suivi HelloWork est ramené à l'adresse réelle de l'annonce, sans paramètres de suivi", checkTarget(tracked) === "https://www.hellowork.com/fr-fr/emplois/777.html" && untrackUrl(tracked).startsWith("https://www.hellowork.com/fr-fr/emplois/777.html"));
  ok("…et reste vérifiable", checkable(tracked));
  // Un lien de suivi qui ne mène pas à une annonce (désinscription, liste d'offres) : un « introuvable » n'y prouverait rien, on ne le lit pas
  const other = "https://emails.hellowork.com/clic/abc/" + Buffer.from("https://www.hellowork.com/fr-fr/candidat/alertes/desinscription?id=1").toString("base64url");
  ok("un lien de suivi qui ne mène pas à une annonce n'est pas vérifiable", !checkable(other));
  ok("une adresse ordinaire n'est pas modifiée", checkTarget("https://exemple.fr/o/1") === "https://exemple.fr/o/1");
}
for (const f of ["app/api/offers/check/route.ts", "app/api/recommendations/check/route.ts"]) {
  const c = src(f);
  ok(`${f} lit l'adresse décodée (checkTarget) et non le lien de suivi`, /const target = checkTarget\(url\)/.test(c) && /readOffer\(target\)/.test(c));
}

// ---------- « Déjà vue » ne dit rien des goûts ----------
ok("la raison « doublon » est neutre pour l'apprentissage", NEUTRAL_REASONS.includes("doublon") && NEUTRAL_REASONS.includes("ancienne"));
done();
