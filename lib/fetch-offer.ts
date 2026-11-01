import * as cheerio from "cheerio";
import { safeGet } from "./safe-fetch";

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
 * LinkedIn, Indeed et France Travail bloquent souvent les robots (ou chargent la page par JavaScript) : dans ce cas
 * `text` vaut null et `gone` reste faux (on ne devine pas) ; l'app demande alors de coller le texte de l'offre.
 * La lecture passe par safeGet : jamais d'adresse interne, redirections contrôlées, taille limitée.
 */
export async function readOffer(url: string, get: Getter = safeGet, now = Date.now()): Promise<OfferRead> {
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

export async function fetchOfferText(url: string): Promise<string | null> {
  return (await readOffer(url)).text;
}

/** Message affiché quand on découvre qu'une annonce n'existe plus (`classed` : elle vient d'être rangée dans les Écartées). */
export const goneMessage = (classed: boolean) =>
  `Cette offre n'est plus disponible : l'annonce a été retirée ou a expiré.${classed ? " Je l'ai classée dans les Écartées (« Offre plus disponible »)." : ""} Si elle est en fait toujours en ligne, colle son texte et je l'analyse.`;

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
  if (u.includes("francetravail") || u.includes("pole-emploi")) return "France Travail";
  if (u.includes("welcometothejungle")) return "Welcome to the Jungle";
  if (u.includes("apec")) return "APEC";
  if (u.includes("hellowork")) return "HelloWork";
  return "Site entreprise";
}

/** Adresse canonique d'une annonce (sans paramètres de suivi), pour repérer les doublons. */
export function normalizeJobUrl(url: string) {
  try {
    const u = new URL(url);
    const li = u.pathname.match(/\/jobs\/view\/(\d+)/);
    if (u.hostname.includes("linkedin") && li) return `https://www.linkedin.com/jobs/view/${li[1]}/`;
    const jk = u.searchParams.get("jk");
    if (u.hostname.includes("indeed") && jk) return `https://fr.indeed.com/viewjob?jk=${jk}`;
    ["utm_source", "utm_medium", "utm_campaign", "utm_content", "trackingId", "refId", "trk", "lipi", "midToken", "midSig", "eid"].forEach((k) => u.searchParams.delete(k));
    return u.toString();
  } catch {
    return url;
  }
}
