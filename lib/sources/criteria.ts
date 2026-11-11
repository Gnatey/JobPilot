import { MAX_PAGE, type SearchCriteria } from "./types";

const CONTRACTS = ["CDI", "CDD", "MIS", "LIB", "ALT", "STG"];
const SINCE = ["0", "1", "3", "7", "14", "31"];

/** Critères reçus du navigateur : on ne garde que des valeurs connues, de longueur raisonnable. */
export function sanitizeCriteria(raw: unknown): SearchCriteria {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const strs = (v: unknown, n: number, len: number) => (Array.isArray(v) ? v : []).map((x) => String(x).trim().slice(0, len)).filter(Boolean).slice(0, n);
  const years = typeof r.maxYears === "number" && Number.isFinite(r.maxYears) ? Math.max(0, Math.min(40, Math.round(r.maxYears))) : null;
  return {
    keywords: String(r.keywords ?? "").slice(0, 300),
    departments: strs(r.departments, 5, 4).filter((d) => /^(\d{2,3}|2[AB])$/.test(d)),
    cities: strs(r.cities, 5, 80),
    contracts: strs(r.contracts, 6, 4).filter((c) => CONTRACTS.includes(c)),
    experience: (["1", "2", "3"].includes(String(r.experience)) ? String(r.experience) : "") as SearchCriteria["experience"],
    publishedWithin: (SINCE.includes(String(r.publishedWithin)) ? String(r.publishedWithin) : "14") as SearchCriteria["publishedWithin"],
    remoteOnly: r.remoteOnly === true,
    exclude: String(r.exclude ?? "").slice(0, 200),
    maxYears: years,
    page: typeof r.page === "number" && Number.isFinite(r.page) ? Math.max(1, Math.min(MAX_PAGE, Math.round(r.page))) : 1,
  };
}
