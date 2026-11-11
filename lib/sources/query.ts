import { GENERIC, STOP } from "../fit";

/**
 * Ce qu'on envoie aux sources pour un poste (11 novembre, Juliana : « gestionnaire de base de données » ne trouvait aucune offre, même sur 1 mois, alors que les
 * mêmes mots sur les gros sites d'emploi en donnent). Logique pure, testée par tests/search-query.test.ts.
 *
 * Hypothèse, NON VÉRIFIÉE (le réseau est fermé depuis l'atelier, aucune réponse réelle d'Adzuna ni de Jooble n'a été lue) : ces sources cherchent TOUS les mots dans le titre
 * et l'annonce. « gestionnaire de base de données » exige alors « gestionnaire », mot qu'une annonce d'« Administrateur de bases de données » ne contient pas. Deux remèdes :
 *  1. la requête « utile » : les mots qui disent le métier (« base données »), sans « gestionnaire », « chargé », « de », « du »… ;
 *  2. des intitulés voisins connus (une petite liste fixe, centrée sur les métiers de la donnée).
 * Ces variantes ne partent qu'APRÈS les mots saisis et seulement si les mots saisis ont rendu peu d'offres (`FEW`) : le quota gratuit des sources est limité,
 * et la requête telle qu'écrite par la personne reste toujours la première.
 */

/** Sous ce nombre d'offres lues (avant filtres), les mots saisis sont jugés trop étroits et les variantes partent aussi. */
export const FEW = 25;
/** Variantes au plus pour toute la recherche. */
export const MAX_VARIANTS = 6;

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const words = (s: string) => s.replace(/\(?\b[hf]\s*\/\s*[fh]\b\)?/gi, " ").split(/[^\p{L}\p{N}+#]+/u).filter(Boolean);

/** Les mots qui disent le métier, tels qu'écrits (accents gardés). Null si la requête utile se réduirait à moins de deux mots ou ne différerait pas de la saisie. */
export function coreQuery(role: string): string | null {
  const all = words(role);
  const keep = all.filter((w) => { const n = norm(w); return n.length >= 3 && !STOP.has(n) && !GENERIC.has(n); });
  if (keep.length < 2) return null; // « consultant SI » : « si » seul serait le mot français « si », trouvé dans toutes les annonces
  const core = keep.join(" ");
  const typed = all.filter((w) => !STOP.has(norm(w))).join(" ");
  return norm(core) === norm(typed) ? null : core;
}

/** Intitulés voisins : un motif sur le poste (sans accents ni majuscules) et les intitulés qu'on lui associe. Liste volontairement courte, à compléter avec des cas réels. */
const SYNONYMS: { when: RegExp; alt: string[] }[] = [
  { when: /\b(dba|(administrat(eur|rice)|gestionnaire|responsable|technicien(ne)?|ingenieur(e)?) (de )?bases? (de )?donnees|database administrator)\b/, alt: ["administrateur base de données", "DBA", "database administrator"] },
  { when: /\b(data analyst|data analyste|analyste (de )?donnees|analyste data)\b/, alt: ["data analyst", "analyste de données", "analyste data"] },
  { when: /\b(business intelligence|(consultant(e)?|developpeur|developpeuse|ingenieur(e)?|analyste|chef de projet) (bi|decisionnel))\b/, alt: ["consultant BI", "business intelligence", "développeur BI"] },
  { when: /\b(consultant(e)? si|consultant(e)? systemes? d.?informations?)\b/, alt: ["consultant système d'information", "consultant SI"] },
  { when: /\b(data engineer|ingenieur(e)? (de )?donnees|ingenieur(e)? data)\b/, alt: ["data engineer", "ingénieur data", "ingénieur de données"] },
];

export const synonymsOf = (role: string): string[] => {
  const n = norm(role);
  return SYNONYMS.filter((s) => s.when.test(n)).flatMap((s) => s.alt);
};

/** Les requêtes de base (les postes saisis) et les variantes à essayer ensuite, sans doublon, réparties entre les postes. */
export function planQueries(roles: string[]): { base: string[]; more: string[] } {
  const base = roles.length ? roles : [""];
  const seen = new Set(base.map(norm));
  const perRole = roles.map((r) => [coreQuery(r), ...synonymsOf(r)].filter((q): q is string => !!q));
  const more: string[] = [];
  for (let i = 0; more.length < MAX_VARIANTS && perRole.some((l) => i < l.length); i++) {
    for (const l of perRole) {
      const q = l[i];
      if (!q || seen.has(norm(q)) || more.length >= MAX_VARIANTS) continue;
      seen.add(norm(q));
      more.push(q);
    }
  }
  return { base, more };
}

type Phased<J, R> = {
  roles: string[];
  /** Requêtes autorisées au total (zones et contrats compris). */
  max: number;
  /** Les requêtes à envoyer pour ces intitulés (un par zone et par contrat). */
  jobsFor: (queries: string[]) => J[];
  run: (jobs: J[]) => Promise<PromiseSettledResult<R[]>[]>;
  tried?: string[];
};

/**
 * Les requêtes de base d'abord ; puis, si elles ont rendu moins de `FEW` offres (et pas toutes échoué), les variantes avec le budget qui reste.
 * Rend tous les résultats ; chaque variante réellement envoyée est notée dans `tried`.
 */
export async function runPhased<J extends { role: string }, R>(p: Phased<J, R>): Promise<PromiseSettledResult<R[]>[]> {
  const { base, more } = planQueries(p.roles);
  const first = p.jobsFor(base).slice(0, p.max);
  const settled = await p.run(first);
  const got = settled.reduce((n, r) => n + (r.status === "fulfilled" ? r.value.length : 0), 0);
  const allFailed = settled.length > 0 && settled.every((r) => r.status === "rejected");
  const room = p.max - first.length;
  if (got >= FEW || allFailed || !more.length || room <= 0) return settled;
  const second = p.jobsFor(more).slice(0, room);
  if (!second.length) return settled;
  p.tried?.push(...new Set(second.map((j) => j.role)));
  return [...settled, ...(await p.run(second))];
}
