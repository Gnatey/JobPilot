import { HttpError } from "../supabase/server";
import { splitRoles } from "../job-families";
import { deptName } from "../departements";
import { KEYWORD_CONTRACTS, type JobOffer, type SearchCriteria, type SearchOpts, type Source } from "./types";
import { stripTags } from "./adzuna";

/**
 * Jooble : agrégateur d'offres, API gratuite sur demande (formulaire sur jooble.org/api/about).
 * Extraits de description uniquement ; les liens passent par Jooble.
 * Chaque pays a son site Jooble et sa propre clé (la documentation de Jooble le dit) : une clé demandée pour la France
 * est refusée par jooble.org. Sans JOOBLE_API_BASE, on essaie donc fr.jooble.org puis jooble.org, et on retient celui qui répond.
 */

export const JOOBLE_HOSTS = ["https://fr.jooble.org", "https://jooble.org"];

type Raw = { id?: string | number; title?: string; location?: string; snippet?: string; salary?: string; source?: string; type?: string; link?: string; company?: string; updated?: string };

const contractOf = (t: string) => {
  const x = t.toLowerCase();
  if (/cdi|permanent|ind[ée]termin/.test(x)) return "CDI";
  if (/cdd|temporary|d[ée]termin|fixed/.test(x)) return "CDD";
  if (/alternan|apprenti|professionnalisation/.test(x)) return "Alternance";
  if (/stage|intern/.test(x)) return "Stage";
  if (/int[ée]rim/.test(x)) return "Intérim";
  if (/freelance|contract|ind[ée]pendant/.test(x)) return "Freelance / mission";
  return t;
};

/**
 * La clé telle qu'elle a été collée dans Vercel, nettoyée : espaces et retours à la ligne, guillemets autour,
 * « JOOBLE_API_KEY=… » recopié en entier, ou adresse complète (« https://jooble.org/api/<clé> ») au lieu de la clé seule.
 * Une clé collée avec un guillemet ou un espace est refusée comme une fausse clé : mieux vaut la nettoyer que la faire redemander.
 */
export function cleanKey(raw: string | undefined | null): string {
  let k = (raw ?? "").trim();
  k = k.replace(/^JOOBLE_API_KEY\s*=\s*/i, "").trim();
  k = k.replace(/^["'`“”‘’]+|["'`“”‘’]+$/g, "").trim();
  const inUrl = k.match(/\/api\/([^/?#\s]+)\/?$/i);
  return inUrl ? inUrl[1] : k;
}

const hostsToTry = () => {
  const forced = process.env.JOOBLE_API_BASE?.trim().replace(/\/+$/, "");
  return forced ? [forced] : JOOBLE_HOSTS;
};
/** Le site qui a répondu la dernière fois : on commence par lui, pour ne pas payer un refus à chaque requête. */
let lastGoodHost: string | null = null;
export const forgetJoobleHost = () => { lastGoodHost = null; };

const hostName = (h: string) => { try { return new URL(h).host; } catch { return h; } };
/** Une page de protection (Cloudflare…) n'est pas une clé refusée : on le distingue pour ne pas faire redemander une clé valable. */
const looksBlocked = (body: string) => /<html|<!doctype|cloudflare|just a moment|attention required|captcha/i.test(body.slice(0, 600));

async function search(c: SearchCriteria, opts: SearchOpts = {}): Promise<JobOffer[]> {
  const key = cleanKey(process.env.JOOBLE_API_KEY);
  if (!key) throw new HttpError(501, "Jooble non configuré.");
  const special = c.contracts.filter((x) => x in KEYWORD_CONTRACTS);
  const plain = c.contracts.some((x) => !(x in KEYWORD_CONTRACTS)) || !special.length;
  const suffixes = [...(plain ? [""] : []), ...special.map((k) => ` ${KEYWORD_CONTRACTS[k]}`)];
  const roles = splitRoles(c.keywords);
  const places = c.cities?.length ? c.cities.slice(0, 5) : c.departments.length ? c.departments.slice(0, 5).map(deptName) : [""];
  const jobs = (roles.length ? roles : [""])
    .flatMap((role) => places.flatMap((where) => suffixes.map((suffix) => ({ role, where, suffix }))))
    .slice(0, opts.maxRequests ?? 12);
  const from = new Date(Date.now() - Number(c.publishedWithin || 14) * 864e5).toISOString().slice(0, 10);

  const post = (host: string, { role, where, suffix }: (typeof jobs)[number]) =>
    fetch(`${host}/api/${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": "JobPilot" },
      body: JSON.stringify({ keywords: `${role}${suffix}`.trim().slice(0, 120), location: where || "France", radius: "26", page: "1", datecreatedfrom: from }),
      signal: AbortSignal.timeout(15_000),
    });

  const fetchOne = async (job: (typeof jobs)[number]) => {
    const all = hostsToTry();
    const order = lastGoodHost && all.includes(lastGoodHost) ? [lastGoodHost, ...all.filter((h) => h !== lastGoodHost)] : all;
    const refused: { host: string; status: number; blocked: boolean }[] = [];
    for (const host of order) {
      const res = await post(host, job);
      // Refus (clé inconnue de ce site) ou adresse sans réponse : on essaie le site suivant ; les autres erreurs ne dépendent pas du site
      if (res.status === 401 || res.status === 403 || res.status === 404) {
        const body = await res.text().catch(() => "");
        refused.push({ host, status: res.status, blocked: looksBlocked(body) });
        continue;
      }
      if (res.status === 429) throw new HttpError(502, "Jooble : quota de requêtes atteint pour le moment.");
      if (!res.ok) throw new HttpError(502, `Jooble : recherche refusée (${res.status})`);
      lastGoodHost = host;
      const j = (await res.json()) as { jobs?: Raw[] };
      return j.jobs ?? [];
    }
    // Jamais la clé dans le message : elle fait partie de l'adresse appelée
    const detail = refused.map((r) => `${r.status} sur ${hostName(r.host)}`).join(", ");
    if (refused.every((r) => r.blocked)) throw new HttpError(502, `Jooble : accès bloqué par une page de protection du site (${detail}). Ce n'est pas forcément la clé : réessaie plus tard.`);
    if (refused.some((r) => r.status === 401 || r.status === 403)) {
      throw new HttpError(502, `Jooble : clé refusée (${detail}). Chaque pays a sa propre clé : celle de la France se demande depuis fr.jooble.org ; vérifie aussi qu'elle est collée seule, sans guillemets (Administration › Sources d'offres).`);
    }
    throw new HttpError(502, `Jooble : adresse introuvable (${detail}).`);
  };

  const settled: PromiseSettledResult<Raw[]>[] = [];
  for (let i = 0; i < jobs.length; i += 4) settled.push(...(await Promise.allSettled(jobs.slice(i, i + 4).map(fetchOne))));
  const failed = settled.find((r): r is PromiseRejectedResult => r.status === "rejected");
  if (failed && settled.every((r) => r.status === "rejected")) throw failed.reason;

  const seen = new Set<string>();
  return settled
    .map((r) => (r.status === "fulfilled" ? r.value : []))
    .flat()
    .filter((o) => o.id != null && o.link && o.title)
    .filter((o) => (seen.has(String(o.id)) ? false : (seen.add(String(o.id)), true)))
    .map((o): JobOffer => {
      const rid = String(o.id).replace(/[^A-Za-z0-9_.-]/g, "_");
      return {
        key: `jb:${rid}`,
        source: "Jooble",
        id: rid,
        title: stripTags(o.title ?? ""),
        company: stripTags(o.company ?? "") || "Entreprise non communiquée",
        location: stripTags(o.location ?? ""),
        contract: contractOf(o.type ?? ""),
        salary: stripTags(o.salary ?? ""),
        experience: "",
        years: null,
        date: o.updated ?? "",
        url: o.link!,
        description: stripTags(o.snippet ?? ""),
      };
    });
}

export const jooble: Source = {
  id: "jooble",
  label: "Jooble",
  configured: () => Boolean(cleanKey(process.env.JOOBLE_API_KEY)),
  search,
};
