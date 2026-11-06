import { checkUrl, safeGet } from "./safe-fetch";

/**
 * Lecteur de pages en SECOURS (Jina Reader, r.jina.ai) pour les annonces que notre lecture directe n'obtient pas
 * (LinkedIn, Indeed, Glassdoor, pages chargées par JavaScript). Logique pure, testée par tests/offer-reader.test.ts avec un faux réseau.
 *
 * Règles :
 *  - jamais en premier : `readOfferWithReader` (lib/fetch-offer.ts) n'appelle le lecteur que si la lecture directe n'a rien donné et que l'annonce n'est pas retirée ;
 *  - jamais dans la synchro automatique (lib/sync.ts garde `readOffer`) : seulement quand une personne analyse une annonce ;
 *  - seule l'adresse de l'annonce part chez le prestataire (jamais le profil ni le texte), et seulement si elle passe `checkUrl` ;
 *  - un mur de connexion, une page d'erreur ou un texte trop court = rien (la personne colle alors l'annonce, comme avant) ;
 *  - `JINA_READER=off` dans Vercel l'éteint ; `JINA_API_KEY` (facultative, gratuite chez Jina) relève ses limites.
 */

export const READER_BASE = "https://r.jina.ai/";
export const readerEnabled = () => (process.env.JINA_READER ?? "").toLowerCase().trim() !== "off";

type Getter = (url: string, opts: { headers: Record<string, string>; timeoutMs: number }) => Promise<{ status: number; body: string }>;

/** Phrases d'un mur de connexion, d'un test anti-robot ou d'une page d'erreur. */
const WALL = /sign in|se connecter|log ?in|captcha|access denied|just a moment|verify you are human|enable javascript|are you a robot|checking your browser/i;
const MIN_LENGTH = 300;
/** Un mur est court : au-delà, une mention « Se connecter » dans le menu d'une vraie annonce ne la fait pas rejeter. */
const WALL_MAX = 1500;

/** Réponse brute du lecteur (« Title: … URL Source: … Markdown Content: … ») → texte d'annonce, ou null si ce n'est pas une annonce lisible. */
export function parseReaderText(raw: string): string | null {
  if (typeof raw !== "string") return null;
  // Le lecteur signale lui-même que le site cible a refusé : ce qui suit est la page d'erreur, pas l'annonce
  if (/^Warning:\s*Target URL returned error/im.test(raw.slice(0, 2000))) return null;
  const marker = "Markdown Content:";
  const at = raw.indexOf(marker);
  const body = at >= 0 ? raw.slice(at + marker.length) : raw;
  const text = body
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // lien → son texte
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (text.length < MIN_LENGTH) return null;
  if (text.length < WALL_MAX && WALL.test(text.slice(0, 800))) return null;
  return text.slice(0, 30000);
}

/** Lit une annonce par le lecteur. Ne lève jamais d'erreur : null = rien de lisible. */
export async function readViaReader(url: string, get: Getter = safeGet): Promise<string | null> {
  if (!readerEnabled()) return null;
  try {
    const target = checkUrl(url); // refuse adresses internes, identifiants dans l'adresse, protocoles étrangers
    const headers: Record<string, string> = { Accept: "text/plain", "User-Agent": "JobPilot/1.0 (suivi de candidatures)" };
    const key = process.env.JINA_API_KEY?.trim();
    if (key) headers.Authorization = `Bearer ${key}`;
    const res = await get(`${READER_BASE}${target.toString()}`, { headers, timeoutMs: 20_000 });
    if (res.status < 200 || res.status >= 300) return null;
    return parseReaderText(res.body);
  } catch {
    return null;
  }
}
