/**
 * Les écarts de l'analyse (« Écarts et comment les traiter ») : ce que l'annonce DEMANDE et que le profil n'a pas. Logique pure, testée par
 * tests/analysis-gaps.test.ts.
 *
 * Cas du 17 novembre 2026 (offre SPIE, capture de Juliana) : l'IA listait « Offre non détaillée (absence de missions et compétences requises précises) »
 * comme écart, avec le conseil « mettre en avant l'adaptabilité ». Ce n'est pas un écart du profil : c'est le manque de détail de l'annonce, et la règle
 * « ce que l'annonce ne dit pas n'est jamais un point négatif » existait pour le score mais pas pour cette liste. La consigne (`lib/ai.ts`) le dit
 * maintenant ; ce filtre l'applique quand même, parce qu'une consigne n'est qu'une demande faite à l'IA.
 */

/** Le sujet est l'annonce elle-même… */
const ABOUT_OFFER = /\b(offre|annonce|description|fiche de poste)\b/i;
/** …dite d'entrée : « Offre non détaillée », « Absence de détails dans l'annonce » (une phrase sur le profil qui cite l'offre plus loin n'en est pas une). */
const SUBJECT_WITHIN = 45;
/** …et le reproche est son manque de détail (« non renseigné » et « non documenté » n'y sont pas : ils décrivent aussi bien le profil). */
const VAGUE = /\b(peu|pas assez|non|manque d[e'’]|manquant|absence d[e'’]|pauvre|insuffisamment)\s+(d[ée]tail|pr[ée]cis)|\b(vague|floue?|succincte?|incompl[eè]te?|impr[ée]cise?|sommaire|laconique|lacunaire)/i;

export type Gap = { gap: string; how_to_address?: string };

/** Vrai quand l'écart reproche à l'ANNONCE son manque de détail (et non au profil un savoir-faire absent). */
export function isVagueOfferGap(g: Pick<Gap, "gap">): boolean {
  const t = String(g?.gap ?? "");
  return ABOUT_OFFER.test(t.slice(0, SUBJECT_WITHIN)) && VAGUE.test(t);
}

/** Les écarts sans ceux qui reprochent à l'annonce d'être vague ; tout le reste est rendu tel quel. */
export function dropVagueOfferGaps<T extends Pick<Gap, "gap">>(gaps: T[] | undefined | null): T[] {
  return Array.isArray(gaps) ? gaps.filter((g) => g && typeof g.gap === "string" && !isVagueOfferGap(g)) : [];
}
