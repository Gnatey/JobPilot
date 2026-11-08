import { HttpError } from "../supabase/server";
import { splitRoles } from "../job-families";
import { deptName } from "../departements";
import { httpUrlOrNull } from "../fetch-offer";
import { KEYWORD_CONTRACTS, STANDARD_CONTRACTS, type JobOffer, type SearchCriteria, type SearchOpts, type Source } from "./types";

/**
 * Adzuna : agrégateur d'offres avec une API gratuite (clé sur developer.adzuna.com).
 * Il reprend des offres de nombreux sites d'emploi ; les descriptions sont des extraits.
 */

type Raw = {
  id?: string | number;
  title?: string;
  description?: string;
  created?: string;
  redirect_url?: string;
  company?: { display_name?: string };
  location?: { display_name?: string };
  salary_min?: number;
  salary_max?: number;
  salary_is_predicted?: string | number;
  contract_type?: string;
  contract_time?: string;
};

export const stripTags = (s: string) => s.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
const eur = (n: number) => `${Math.round(n / 100) * 100}`.replace(/\B(?=(\d{3})+(?!\d))/g, " ");

async function search(c: SearchCriteria, opts: SearchOpts = {}): Promise<JobOffer[]> {
  const id = process.env.ADZUNA_APP_ID?.trim();
  const key = process.env.ADZUNA_APP_KEY?.trim();
  if (!id || !key) throw new HttpError(501, "Adzuna non configuré.");
  const base = process.env.ADZUNA_API_BASE || "https://api.adzuna.com";

  const standard = c.contracts.filter((x) => STANDARD_CONTRACTS.includes(x));
  const special = c.contracts.filter((x) => x in KEYWORD_CONTRACTS);
  // Filtre officiel d'Adzuna : seulement quand le choix est sans ambiguïté (sinon on trie après coup)
  const onlyCdi = standard.length > 0 && standard.every((x) => x === "CDI");
  const noCdi = standard.length > 0 && !standard.includes("CDI");
  const variants: { suffix: string; filter?: Record<string, string> }[] = [];
  if (standard.length || !special.length) variants.push({ suffix: "", filter: onlyCdi ? { permanent: "1" } : noCdi ? { contract: "1" } : undefined });
  for (const k of special) variants.push({ suffix: ` ${KEYWORD_CONTRACTS[k]}` });

  const roles = splitRoles(c.keywords);
  const places = c.cities?.length ? c.cities.slice(0, 5) : c.departments.length ? c.departments.slice(0, 5).map(deptName) : [""];
  const jobs = (roles.length ? roles : [""])
    .flatMap((role) => places.flatMap((where) => variants.map((v) => ({ role, where, ...v }))))
    .slice(0, opts.maxRequests ?? 12);

  const fetchOne = async ({ role, where, suffix, filter }: (typeof jobs)[number]) => {
    const params = new URLSearchParams({ app_id: id, app_key: key, results_per_page: "50", sort_by: "date", "content-type": "application/json", max_days_old: c.publishedWithin || "14" });
    const what = `${role}${suffix}`.trim();
    if (what) params.set("what", what.slice(0, 120));
    if (where) params.set("where", where);
    for (const [k, v] of Object.entries(filter ?? {})) params.set(k, v);
    const res = await fetch(`${base}/v1/api/jobs/fr/search/1?${params}`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
    if (res.status === 401 || res.status === 403) throw new HttpError(502, "Adzuna : clé refusée (à vérifier dans Administration › Sources d'offres).");
    if (res.status === 429) throw new HttpError(502, "Adzuna : quota de requêtes atteint pour le moment.");
    if (!res.ok) throw new HttpError(502, `Adzuna : recherche refusée (${res.status})`);
    const j = (await res.json()) as { results?: Raw[] };
    return j.results ?? [];
  };

  const settled: PromiseSettledResult<Raw[]>[] = [];
  for (let i = 0; i < jobs.length; i += 4) settled.push(...(await Promise.allSettled(jobs.slice(i, i + 4).map(fetchOne))));
  const failed = settled.find((r): r is PromiseRejectedResult => r.status === "rejected");
  if (failed && settled.every((r) => r.status === "rejected")) throw failed.reason;

  const seen = new Set<string>();
  return settled
    .map((r) => (r.status === "fulfilled" ? r.value : []))
    .flat()
    .filter((o) => o.id != null && httpUrlOrNull(o.redirect_url) && o.title) // le lien vient d'un tiers et finit dans un href : http(s) seulement (jamais javascript:)
    .filter((o) => (seen.has(String(o.id)) ? false : (seen.add(String(o.id)), true)))
    .map((o): JobOffer => {
      const predicted = String(o.salary_is_predicted ?? "0") === "1";
      const salary = !predicted && o.salary_min ? (o.salary_max && o.salary_max !== o.salary_min ? `${eur(o.salary_min)} à ${eur(o.salary_max)} € par an` : `${eur(o.salary_min)} € par an`) : "";
      const rid = String(o.id).replace(/[^A-Za-z0-9_.-]/g, "_");
      return {
        key: `az:${rid}`,
        source: "Adzuna",
        id: rid,
        title: stripTags(o.title ?? ""),
        company: stripTags(o.company?.display_name ?? "") || "Entreprise non communiquée",
        location: stripTags(o.location?.display_name ?? ""),
        contract: o.contract_type === "permanent" ? "CDI" : o.contract_type === "contract" ? "CDD, mission ou freelance" : "",
        salary,
        experience: "",
        years: null,
        date: o.created ?? "",
        url: httpUrlOrNull(o.redirect_url)!,
        description: stripTags(o.description ?? ""),
      };
    });
}

export const adzuna: Source = {
  id: "adzuna",
  label: "Adzuna",
  configured: () => Boolean(process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY),
  search,
};
