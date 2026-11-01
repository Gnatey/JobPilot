/**
 * Texte d'une offre recommandée que l'on peut donner à l'IA : l'annonce complète si on l'a lue
 * (recherche automatique, ou page lue par le favori), jamais une simple phrase d'extrait.
 */
export function recoText(r: { origin?: string | null; snippet?: string | null }): string {
  const s = r.snippet ?? "";
  return r.origin === "search" || s.length >= 300 ? s : ""; // les extraits de listes ou d'alertes sont coupés à 280 caractères
}

/** Vrai si le texte ressemble à une vraie annonce (et pas à une page « êtes-vous un robot ? »). */
export function usableJobText(t: string): boolean {
  if (t.length < 300) return false;
  return !(t.length < 2500 && /captcha|just a moment|verify you are (a )?human|are you a robot|access denied|acc[èe]s refus[ée]|v[ée]rification de s[ée]curit[ée]|enable javascript|activez javascript/i.test(t));
}

/** Nettoie un texte reçu du navigateur avant de le ranger en base. */
export function tidyText(t: string): string {
  return t.replace(/\u0000/g, "").replace(/[ \t ]+/g, " ").replace(/ ?\n ?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
