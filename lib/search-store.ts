import type { Profile } from "./types";
import type { Learning } from "./learning";
import type { JobOffer } from "./sources/types";
import { quickScore } from "./quick-score";
import { fitCheck, roleAffinity } from "./fit";
import { splitRoles } from "./job-families";
import { parsePosted } from "./posted";

/**
 * Ce que « Préparer ma journée » et la recherche du matin rangent parmi les recommandations (logique pure, testée par tests/search-store.test.ts).
 * Séparée de `storeSearchOffers` (lib/sync.ts, qui écrit en base) pour pouvoir la tester et compter chaque écart.
 *
 * 11 novembre (Juliana : « Candidatures par jour : 5 », recherche « consultant SI », aucune offre dans la liste du jour) : une offre n'était rangée que si son
 * pré-score (compétences du profil + titres visés) atteignait 30. Pour un poste que le profil ne vise pas encore (« consultant SI » pour un profil Data / BI),
 * les extraits d'annonce citent peu de compétences du profil : presque tout restait sous 30 et disparaissait sans un mot, alors que la personne avait demandé
 * CE poste. Désormais une offre dont le titre dit le poste demandé (tous ses mots distinctifs) est gardée même sous 30 ; le pré-score ne fait que la classer.
 */
export const MIN_STORE_SCORE = 30;

export type StoreRow = {
  status: "new" | "filtered"; reject_reason: string | null;
  user_id: string; origin: "search"; source: string; dedupe_key: string;
  title: string; company: string; location: string; url: string;
  snippet: string; quick_score: number; matched: string[]; senior: boolean; received_at: string; posted_at?: string;
};

export type StorePlan = {
  rows: StoreRow[];
  /** Offres lues. */
  read: number;
  /** Rangées en « Masquées » : métier éloigné des postes visés, stage ou alternance non demandés. */
  far: number;
  /** Écartées : pré-score sous le seuil et titre qui ne dit pas le poste demandé. */
  low: number;
  /** Gardées malgré un pré-score sous le seuil parce que leur titre dit le poste demandé. */
  asked: number;
  /** Au-delà de la limite d'expérience de la personne, rangées « À trier » ou écartées : jamais choisies pour la liste du jour. */
  senior: number;
};

/** Ce que `storeSearchOffers` rend en plus du nombre d'offres : le détail de chaque écart, pour expliquer une liste du jour vide. */
export type StoreStats = Pick<StorePlan, "read" | "far" | "low" | "asked" | "senior"> & {
  /** Déjà connues (vues, décidées ou masquées avant) : elles ne sont pas rangées une deuxième fois. */
  known: number;
  /** Nouvelles offres visibles dans « À trier ». */
  fresh: number;
  /** Leurs identifiants : « Préparer ma journée » retire celles qui n'entrent pas dans la liste du jour (voir `leftovers`). */
  ids?: string[];
};

/**
 * Offres rangées par UNE recherche de « Préparer ma journée » qui n'ont pas été prises dans la liste du jour.
 * 13 novembre, Juliana : « j'ai demandé 4 offres dans Recherche, mais dans Recommandées j'en ai eu 13 » : la recherche rangeait TOUT ce qui convenait dans
 * « À trier » et la liste du jour n'en prenait que 4. Elles sont retirées (jamais vues ni décidées : rien d'apprenable) ; si elles sont toujours en ligne,
 * la recherche suivante les ramène.
 */
export const leftovers = (stored: string[] | undefined, taken: string[]): string[] => {
  const keep = new Set(taken);
  return [...new Set(stored ?? [])].filter((id) => !keep.has(id));
};

type In = {
  userId: string;
  profile: Profile;
  learning: Learning | null;
  offers: JobOffer[];
  /** Mots-clés de la recherche (« consultant SI, data analyst »). */
  keywords: string;
  contracts: string[];
  /** Postes de la recherche validée : le filtre « éloigné » ne masque pas ce qui leur ressemble. */
  criteriaRoles: string[];
  /** La base a la colonne `posted_at` (mise à jour 7). */
  withPosted: boolean;
};

/** Le titre dit-il un des postes demandés ? Tous les mots distinctifs du poste y sont (« consultant SI » : « SI » ; « Data Analyst » : « data » ET « analyst »). */
export const titleSaysRole = (title: string, roles: string[]) => roles.length > 0 && roleAffinity(title, roles) >= 1;

export function planStore(i: In): StorePlan {
  const searched = splitRoles(i.keywords);
  const plan: StorePlan = { rows: [], read: i.offers.length, far: 0, low: 0, asked: 0, senior: 0 };
  for (const o of i.offers) {
    const posted = parsePosted(o.date); // date de la source (Adzuna : création, Jooble : mise à jour), jamais une date inventée ni illisible
    const q = quickScore(i.profile, o.title, `${o.experience} ${o.description}`, i.learning, o.company);
    const fit = fitCheck(i.profile, { title: o.title, text: `${o.experience} ${o.description}` }, { roles: [...searched, ...i.criteriaRoles], contracts: i.contracts });
    const wanted = titleSaysRole(o.title, searched);
    if (q.score < MIN_STORE_SCORE) {
      // Au-dessus de la limite d'expérience de la personne : jamais « demandée », quel que soit le titre (c'est sa règle)
      if (q.senior) { plan.senior++; continue; }
      if (!(wanted && fit.ok)) { plan.low++; continue; }
      plan.asked++;
    }
    if (!fit.ok) plan.far++;
    else if (q.senior) plan.senior++;
    plan.rows.push({
      status: fit.ok ? "new" : "filtered", reject_reason: fit.ok ? null : fit.reason,
      user_id: i.userId, origin: "search", source: o.source, dedupe_key: o.key,
      title: o.title, company: o.company, location: o.location, url: o.url,
      snippet: o.description.slice(0, 4000), quick_score: q.score, matched: q.matched, senior: q.senior, received_at: posted ?? new Date().toISOString(),
      ...(i.withPosted && posted ? { posted_at: posted } : {}),
    });
  }
  return plan;
}
