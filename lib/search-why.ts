import type { Dropped } from "./sources";

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
function droppedPhrases(d: Dropped, maxYears?: number | null): string[] {
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
