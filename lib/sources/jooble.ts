import { HttpError } from "../supabase/server";
import { splitRoles } from "../job-families";
import { deptName } from "../departements";
import { KEYWORD_CONTRACTS, type JobOffer, type SearchCriteria, type SearchOpts, type Source } from "./types";
import { stripTags } from "./adzuna";

/**
 * Jooble : agrégateur d'offres, API gratuite sur demande (formulaire sur jooble.org/api/about).
 * Extraits de description uniquement ; les liens passent par Jooble.
 */

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

async function search(c: SearchCriteria, opts: SearchOpts = {}): Promise<JobOffer[]> {
  const key = process.env.JOOBLE_API_KEY?.trim();
  if (!key) throw new HttpError(501, "Jooble non configuré.");
  const base = process.env.JOOBLE_API_BASE || "https://jooble.org";
  const special = c.contracts.filter((x) => x in KEYWORD_CONTRACTS);
  const plain = c.contracts.some((x) => !(x in KEYWORD_CONTRACTS)) || !special.length;
  const suffixes = [...(plain ? [""] : []), ...special.map((k) => ` ${KEYWORD_CONTRACTS[k]}`)];
  const roles = splitRoles(c.keywords);
  const places = c.cities?.length ? c.cities.slice(0, 5) : c.departments.length ? c.departments.slice(0, 5).map(deptName) : [""];
  const jobs = (roles.length ? roles : [""])
    .flatMap((role) => places.flatMap((where) => suffixes.map((suffix) => ({ role, where, suffix }))))
    .slice(0, opts.maxRequests ?? 12);
  const from = new Date(Date.now() - Number(c.publishedWithin || 14) * 864e5).toISOString().slice(0, 10);

  const fetchOne = async ({ role, where, suffix }: (typeof jobs)[number]) => {
    const res = await fetch(`${base}/api/${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ keywords: `${role}${suffix}`.trim().slice(0, 120), location: where || "France", radius: "25", page: "1", datecreatedfrom: from }),
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 401 || res.status === 403) throw new HttpError(502, "Jooble : clé refusée (à vérifier dans Administration › Sources d'offres).");
    if (res.status === 429) throw new HttpError(502, "Jooble : quota de requêtes atteint pour le moment.");
    if (!res.ok) throw new HttpError(502, `Jooble : recherche refusée (${res.status})`);
    const j = (await res.json()) as { jobs?: Raw[] };
    return j.jobs ?? [];
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
  configured: () => Boolean(process.env.JOOBLE_API_KEY),
  search,
};
