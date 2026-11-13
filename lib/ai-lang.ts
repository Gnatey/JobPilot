import type { Locale } from "./i18n/locales";

const NAME: Record<Locale, string> = { fr: "français", en: "anglais", tr: "turc" };

/**
 * Consigne de langue pour les textes qu'une IA écrit POUR la personne (diagnostic de CV…). Vide en français : les consignes des prompts sont en français
 * et c'est la langue d'origine. Les noms de postes, d'outils et de technologies restent tels qu'ils sont dans le CV ; les valeurs fixes du schéma
 * (« bloquant », « haute »…) ne se traduisent pas : l'écran les traduit lui-même.
 * Ne concerne PAS les CV et les lettres écrits pour une offre : leur langue est celle de l'offre, pas celle de l'écran.
 */
export function langDirective(lang: Locale | undefined | null): string {
  if (!lang || lang === "fr") return "";
  return `\nLANGUE : écris en ${NAME[lang]} TOUS les textes destinés à la personne (verdict, commentaires, points forts, corrections, actions, stratégie, questions). Les intitulés de postes, outils, technologies et noms d'entreprises restent tels qu'ils sont écrits dans le CV. Les valeurs fixes demandées par le schéma (« bloquant », « important », « mineur », « haute », « moyenne », « basse ») restent exactement celles du schéma, en français.`;
}
