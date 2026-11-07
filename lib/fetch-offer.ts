import * as cheerio from "cheerio";
import { safeGet } from "./safe-fetch";
import { readViaReader } from "./offer-reader";

/** Phrases qu'un site affiche quand une annonce est retirée, pourvue ou expirée. */
const GONE_RE = new RegExp(
  [
    "n['’]est plus (?:disponible|en ligne|active|publi[ée]e|visible|accessible|valable|d['’]actualit[ée])",
    "(?:offre|annonce|poste)[^.\\n]{0,30}(?:expir[ée]e?|cl[oô]tur[ée]e?|pourvue?|archiv[ée]e?|supprim[ée]e?|retir[ée]e?)",
    "(?:offre|annonce|page|poste)[^.\\n]{0,20}n['’]existe plus",
    "(?:offre|annonce) introuvable",
    "no longer (?:available|accepting applications|open)",
    "(?:job|position|posting|listing|offer)[^.\\n]{0,30}(?:has )?(?:expired|been (?:filled|removed|closed|deleted))",
    "this (?:job|position) is (?:closed|unavailable)",
  ].join("|"),
  "i"
);

/** Le texte lu annonce-t-il que l'offre n'existe plus ? On ne regarde que le début de la page : un pied de page ne compte pas. */
export function looksGone(text: string): boolean {
  return GONE_RE.test(text.slice(0, 1000));
}

export type OfferRead = {
  /** Texte de l'annonce, ou null si la page n'a pas pu être lue. */
  text: string | null;
  /** L'annonce n'existe plus (page supprimée, ou le site le dit). Faux = en ligne OU impossible à savoir. */
  gone: boolean;
};

type Getter = (url: string, opts: { headers: Record<string, string>; timeoutMs: number }) => Promise<{ status: number; body: string }>;

/**
 * Récupère le texte d'une offre depuis son URL, et repère les annonces retirées.
 * Marche bien sur les sites d'entreprise, Welcome to the Jungle, APEC, HelloWork.
 * LinkedIn, Indeed, Glassdoor et France Travail bloquent souvent les robots (ou chargent la page par JavaScript) : dans ce cas
 * `text` vaut null et `gone` reste faux (on ne devine pas) ; l'app demande alors de coller le texte de l'offre.
 * La lecture passe par safeGet : jamais d'adresse interne, redirections contrôlées, taille limitée.
 */
export async function readOffer(url: string, get: Getter = safeGet, now = Date.now()): Promise<OfferRead> {
  // Un lien de connexion automatique n'est jamais ouvert par l'app : ce serait se connecter au compte de la personne (et brûler le jeton)
  if (isSignInLink(url)) return { text: null, gone: false };
  try {
    const res = await get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; JobPilot/1.0; suivi de candidatures)",
        "Accept-Language": "fr-FR,fr;q=0.9",
      },
      timeoutMs: 12_000,
    });
    // 404 / 410 : la page n'existe plus. Les autres refus (403, 429, 999…) sont des blocages de robot : on ne conclut rien.
    if (res.status === 404 || res.status === 410) return { text: null, gone: true };
    if (res.status < 200 || res.status >= 300) return { text: null, gone: false };
    const html = res.body;
    const $ = cheerio.load(html);

    // Données structurées JobPosting (schema.org) si présentes : la source la plus propre
    let ld = "";
    let expired = false;
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const json = JSON.parse($(el).text());
        const items = Array.isArray(json) ? json : json["@graph"] ?? [json];
        for (const it of items) {
          if (it?.["@type"] === "JobPosting") {
            const until = Date.parse(String(it.validThrough ?? ""));
            if (!Number.isNaN(until) && until < now - 864e5) expired = true; // date limite dépassée de plus d'un jour
            const desc = cheerio.load(String(it.description ?? "")).text();
            ld += `${it.title ?? ""}\nEntreprise : ${it.hiringOrganization?.name ?? ""}\nLieu : ${
              it.jobLocation?.address?.addressLocality ?? it.jobLocation?.[0]?.address?.addressLocality ?? ""
            }\nContrat : ${it.employmentType ?? ""}\n\n${desc}`;
          }
        }
      } catch {}
    });

    $("script, style, noscript, nav, footer, header, svg, iframe, form").remove();
    const main = $("main").text() || $("article").text() || $("body").text();
    const text = main.replace(/\s+\n/g, "\n").replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();

    // Une page « offre expirée » est courte : on la reconnaît avant de la jeter comme illisible
    const gone = expired || looksGone(`${$("title").text()}\n${text}`);
    if (gone) return { text: null, gone: true };

    if (ld.trim().length > 200) return { text: ld, gone: false };
    if (text.length < 300 || /sign in|se connecter|captcha|access denied/i.test(text.slice(0, 400))) return { text: null, gone: false };
    return { text, gone: false };
  } catch {
    return { text: null, gone: false };
  }
}

/**
 * `readOffer`, puis le lecteur de pages en secours si la lecture directe n'a rien donné (et que l'annonce n'est pas retirée).
 * Pour les analyses demandées par une personne ; la synchro automatique garde `readOffer` (pas d'appel en masse à un prestataire).
 */
export async function readOfferWithReader(url: string, get?: Getter, reader: (url: string) => Promise<string | null> = readViaReader): Promise<OfferRead> {
  const direct = await readOffer(url, get);
  if (direct.text || direct.gone) return direct;
  if (isSignInLink(url)) return direct; // jamais envoyé à un prestataire : l'adresse porte un jeton de connexion
  const text = await reader(url);
  return text ? { text, gone: false } : direct;
}

export async function fetchOfferText(url: string): Promise<string | null> {
  return (await readOffer(url)).text;
}

/** Message affiché quand on découvre qu'une annonce n'existe plus (`classed` : elle vient d'être rangée dans les Écartées). */
export const goneMessage = (classed: boolean) =>
  `Cette offre n'est plus disponible : l'annonce a été retirée ou a expiré.${classed ? " Je l'ai classée dans les Écartées (« Offre plus disponible »)." : ""} Si elle est en fait toujours en ligne, colle son texte et je l'analyse.`;

/** Sites qui refusent la lecture automatique de leurs annonces : on le dit par leur nom plutôt que par un message générique. */
export const BLOCKING_SITES = ["LinkedIn", "Indeed", "Glassdoor"];

/** Message quand une page n'a pas pu être lue (le site est nommé s'il est connu pour bloquer les robots). */
export function unreadableMessage(url?: string | null): string {
  const site = detectSource(url);
  const who = BLOCKING_SITES.includes(site) ? `${site} bloque la lecture automatique des annonces` : "Impossible de lire cette page (certains sites bloquent la lecture automatique)";
  return `${who}. Colle le texte de l'offre, ou utilise le favori « Envoyer à JobPilot » depuis la page de l'annonce.`;
}

/** Adresse web http(s) valide, sinon null (refuse javascript:, data:, etc.). */
export function httpUrlOrNull(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  try {
    const u = new URL(raw.trim());
    return ["http:", "https:"].includes(u.protocol) ? u.toString().slice(0, 2000) : null;
  } catch {
    return null;
  }
}

export function detectSource(url?: string | null) {
  if (!url) return "texte";
  const u = url.toLowerCase();
  if (u.includes("linkedin")) return "LinkedIn";
  if (u.includes("indeed")) return "Indeed";
  if (u.includes("glassdoor")) return "Glassdoor";
  if (u.includes("francetravail") || u.includes("pole-emploi")) return "France Travail";
  if (u.includes("welcometothejungle")) return "Welcome to the Jungle";
  if (u.includes("apec")) return "APEC";
  if (u.includes("hellowork")) return "HelloWork";
  return "Site entreprise";
}

/**
 * Lien de suivi d'un e-mail HelloWork (emails.hellowork.com/clic/…/<jeton>) : le dernier morceau est un jeton base64 qui contient l'adresse réelle
 * de l'annonce. On ne garde QUE cette adresse (jamais le reste du jeton, qui contient l'adresse e-mail de la personne), et seulement si elle
 * pointe vers hellowork.com. Sans cela, ces liens ne se lisent pas et chaque e-mail donne une adresse différente pour la même offre (doublons).
 */
export function untrackUrl(raw: string): string {
  try {
    const u = new URL(raw);
    if (u.hostname !== "emails.hellowork.com" || !u.pathname.startsWith("/clic/")) return raw;
    const token = u.pathname.split("/").filter(Boolean).pop() ?? "";
    const m = Buffer.from(token, "base64url").toString("utf8").match(/https:\/\/(?:www\.)?hellowork\.com\/[^\s\u0000-\u001f"'<>]+/);
    return m ? m[0] : raw;
  } catch {
    return raw;
  }
}

/** Paramètres d'adresse qui sont des jetons de connexion (lien « magic link » d'un e-mail) : jamais gardés, jamais envoyés ailleurs. */
const NESTED_SECRET = /(?:magic|login|auth|access|one[-_]?time)[-_]?token=|[?&]otp=/i;
const SECRET_PARAMS = /^(magic[-_]?token|login[-_]?token|auth[-_]?token|access[-_]?token|one[-_]?time[-_]?token|otp)$/i;

/**
 * Lien de connexion automatique d'un e-mail (ex. mon-consultant-independant.com/magic-authentication?magic-token=…&next-page=…) :
 * l'ouvrir depuis le serveur reviendrait à se connecter au compte de la personne et userait le jeton ; l'envoyer au lecteur de secours le donnerait
 * à un tiers. On ne le lit donc jamais. (Les jetons de suivi LinkedIn, `midToken`, ne sont PAS des connexions : ils ne comptent pas ici.)
 */
export function isSignInLink(raw: string | null | undefined): boolean {
  if (!raw) return false;
  try {
    const u = new URL(raw);
    if (/\/magic[-_]?(?:auth|link|login)/i.test(u.pathname)) return true;
    for (const k of u.searchParams.keys()) if (SECRET_PARAMS.test(k)) return true;
    return false;
  } catch {
    return false;
  }
}

/**
 * Un lien de connexion d'e-mail passe par une page de connexion avant l'annonce (`/magic-authentication?magic-token=…&next-page=/annonce?id=…`).
 * Une fois le jeton retiré, il ne mène plus à l'annonce : on garde la destination (`next-page`), à condition que ce soit un chemin du MÊME site
 * (jamais une autre adresse : pas de redirection ouverte). Sans destination valable, on renvoie null et l'adresse garde sa page de connexion, sans jeton.
 */
function signInDestination(u: URL): string | null {
  if (!isSignInLink(u.href)) return null;
  const next = u.searchParams.get("next-page") ?? u.searchParams.get("next") ?? u.searchParams.get("redirect");
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return null;
  try {
    const target = new URL(next, u.origin);
    return target.origin === u.origin && !isSignInLink(target.href) ? target.href : null;
  } catch {
    return null;
  }
}

/** Adresse canonique d'une annonce (sans paramètres de suivi), pour repérer les doublons. */
export function normalizeJobUrl(url: string) {
  try {
    let u = new URL(untrackUrl(url));
    const dest = signInDestination(u);
    if (dest) u = new URL(dest); // lien de connexion : on garde l'annonce visée, jamais la page de connexion ni son jeton
    for (const [k, v] of [...u.searchParams.entries()]) if (SECRET_PARAMS.test(k) || NESTED_SECRET.test(v)) u.searchParams.delete(k); // jamais de jeton de connexion rangé en base (même caché dans la valeur d'un autre paramètre)
    const li = u.pathname.match(/\/jobs\/view\/(\d+)/);
    if (u.hostname.includes("linkedin") && li) return `https://www.linkedin.com/jobs/view/${li[1]}/`;
    const jk = u.searchParams.get("jk");
    if (u.hostname.includes("indeed") && jk) return `https://fr.indeed.com/viewjob?jk=${jk}`;
    if ((u.hostname === "hellowork.com" || u.hostname.endsWith(".hellowork.com")) && /\/emplois\/\d+\.html$/.test(u.pathname)) return `https://www.hellowork.com${u.pathname}`;
    ["utm_source", "utm_medium", "utm_campaign", "utm_content", "trackingId", "refId", "trk", "lipi", "midToken", "midSig", "eid"].forEach((k) => u.searchParams.delete(k));
    return u.toString();
  } catch {
    return url;
  }
}
