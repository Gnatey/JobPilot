import type { Dropped } from "./sources";
import type { StoreStats } from "./search-store";

/**
 * « Pourquoi si peu d'offres ? » (11 novembre, Juliana : « j'ai cherché consultant SI et rien n'est sorti, même sous 1 mois, pour juste 5 offres »).
 * La page Recherche ne disait pas ce qui s'était passé entre les sites et la liste : offres lues, offres écartées d'office, offres masquées comme
 * « éloignées de mes postes », et réglages qui restreignent déjà la recherche côté sources. Cette fonction pure (testée par tests/search-why.test.ts)
 * en fait quelques phrases pour l'encadré de la page ; rien n'est deviné : seuls les comptes réels et les réglages posés sont cités.
 */
export type WhyInput = {
  sources: { label: string; ok: boolean; count: number }[];
  /** Offres lues, doublons entre sources retirés, avant les filtres communs. */
  read: number;
  dropped: Dropped;
  /** Offres masquées parce que éloignées des postes visés (case « Afficher aussi… »). */
  far: number;
  /** Offres affichées maintenant. */
  shown: number;
  criteria: { contracts: string[]; maxYears?: number | null; exclude?: string; remoteOnly?: boolean; departments?: string[]; cities?: string[] };
  /** Nom de la zone choisie (« Seine-Saint-Denis », « Paris »…), vide pour toute la France. */
  zone: string;
  /** Pages lues par source (« Voir la suite »). */
  pages: number;
};

const n = (count: number, one: string, many: string) => `${count} ${count > 1 ? many : one}`;

/** Ce que chaque cause d'écart d'office veut dire, dans les mots de la personne. */
export function droppedPhrases(d: Dropped, maxYears?: number | null): string[] {
  const out: string[] = [];
  if (d.years) out.push(`${d.years} ${d.years > 1 ? "demandent" : "demande"} plus de ${maxYears ?? "?"} an${(maxYears ?? 0) > 1 ? "s" : ""} d'expérience`);
  if (d.contract) out.push(`${n(d.contract, "est une alternance ou un stage", "sont des alternances ou des stages")} (contrat non coché)`);
  if (d.exclude) out.push(`${n(d.exclude, "contient", "contiennent")} un de tes mots exclus`);
  if (d.remote) out.push(`${n(d.remote, "ne parle pas", "ne parlent pas")} de télétravail`);
  if (d.old) out.push(`${n(d.old, "est trop ancienne", "sont trop anciennes")} pour la période choisie`);
  return out;
}

/** Les phrases de l'encadré, dans l'ordre : ce qui a été lu, ce qui a été écarté, ce qui est masqué, ce qui restreint la recherche. Liste vide s'il n'y a rien à dire. */
export function explainSearch(i: WhyInput): string[] {
  const lines: string[] = [];
  const ok = i.sources.filter((s) => s.ok);
  if (ok.length) {
    const per = ok.map((s) => `${s.label} : ${n(s.count, "offre lue", "offres lues")}`).join(" ; ");
    lines.push(`${per}${i.pages > 1 ? ` (${i.pages} pages)` : ""}.`);
  }
  const dropped = droppedPhrases(i.dropped, i.criteria.maxYears);
  const droppedTotal = Object.values(i.dropped).reduce((a, b) => a + b, 0);
  if (droppedTotal) lines.push(`Écartées d'office : ${droppedTotal} (${dropped.join(", ")}).`);
  if (i.far) lines.push(`${n(i.far, "offre est masquée", "offres sont masquées")} parce qu'elle${i.far > 1 ? "s sont" : " est"} éloignée${i.far > 1 ? "s" : ""} de tes postes : la case « Afficher aussi… » les montre.`);

  // Réglages qui restreignent déjà la recherche (côté sources ou après coup)
  const rules: string[] = [];
  if (i.zone) rules.push(`zone « ${i.zone} » seulement (les sources ne cherchent que là)`);
  const standard = i.criteria.contracts.filter((c) => ["CDI", "CDD", "MIS", "LIB"].includes(c));
  if (standard.length === 1 && standard[0] === "CDI") rules.push("contrat CDI seul coché (côté Adzuna, ce choix n'envoie que les offres marquées CDI)");
  if (i.criteria.maxYears != null) rules.push(`expérience demandée : ${i.criteria.maxYears} an${i.criteria.maxYears > 1 ? "s" : ""} au plus`);
  if ((i.criteria.exclude ?? "").trim()) rules.push(`mots exclus : ${i.criteria.exclude!.trim()}`);
  if (i.criteria.remoteOnly) rules.push("télétravail seulement");
  if (rules.length) lines.push(`Réglages qui réduisent la recherche : ${rules.join(" ; ")}.`);
  return lines;
}

/**
 * Pourquoi la liste du jour est vide ou incomplète (« Préparer ma journée », lib/day.ts). Avant : « Aucune nouvelle offre ne correspond… Élargis la période, la zone
 * ou les postes », même quand la période était déjà au maximum (1 mois) et sans dire QUEL filtre avait tout retiré (11 novembre, Juliana : « Candidatures par jour : 5 »,
 * recherche « consultant SI » : rien). Les comptes viennent de la recherche web faite pendant l'appel (`found.read`, `found.dropped`, `StoreStats`).
 */
export type DayWhy = {
  sourcesOn: boolean;
  web: { searched: boolean; error?: string };
  /** Période choisie en jours (« 31 » = le maximum proposé). */
  period: string;
  maxYears?: number | null;
  /** Lues par les sources avant les filtres communs, et écartées d'office. */
  read: number;
  dropped: Dropped;
  stats: StoreStats | null;
};

export function explainDay(i: DayWhy): string {
  if (!i.sourcesOn) return " Aucune source de recherche automatique n'est branchée : les nouvelles offres viennent de tes alertes Gmail.";
  if (i.web.error) return ` La recherche web a échoué (${i.web.error}).`;
  // La période maximale proposée est 1 mois : ne pas la conseiller quand elle est déjà choisie
  const tail = i.period === "31"
    ? " Retire un réglage (zone, contrat, années max) ou ajoute un poste voisin, puis réessaie."
    : " Élargis la période (jusqu'à 1 mois), retire un réglage (zone, contrat, années max) ou ajoute un poste voisin, puis réessaie.";
  if (!i.web.searched || !i.stats) return tail;
  if (i.read === 0) return ` Les sources n'ont renvoyé aucune offre pour ces mots-clés dans cette zone et cette période.${tail}`;
  const d = Object.values(i.dropped).reduce((a, b) => a + b, 0);
  const parts: string[] = [];
  if (d) parts.push(`${d} écartée${d > 1 ? "s" : ""} d'office (${droppedPhrases(i.dropped, i.maxYears).join(", ")})`);
  if (i.stats.far) parts.push(`${i.stats.far} éloignée${i.stats.far > 1 ? "s" : ""} de tes postes (rangée${i.stats.far > 1 ? "s" : ""} dans Masquées)`);
  if (i.stats.low) parts.push(`${i.stats.low} peu compatible${i.stats.low > 1 ? "s" : ""} avec ton profil (pré-score sous 30)`);
  if (i.stats.senior) parts.push(`${i.stats.senior} au-dessus de ta limite d'expérience`);
  if (i.stats.known) parts.push(`${i.stats.known} déjà connue${i.stats.known > 1 ? "s" : ""} (vue${i.stats.known > 1 ? "s" : ""}, décidée${i.stats.known > 1 ? "s" : ""} ou masquée${i.stats.known > 1 ? "s" : ""} avant)`);
  if (i.stats.fresh) parts.push(`${i.stats.fresh} nouvelle${i.stats.fresh > 1 ? "s" : ""} gardée${i.stats.fresh > 1 ? "s" : ""}`);
  return ` Les sources ont renvoyé ${i.read} offre${i.read > 1 ? "s" : ""}${parts.length ? ` : ${parts.join(" ; ")}` : ""}.${tail}`;
}
