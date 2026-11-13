/**
 * `t` : traduit un texte écrit en français (sa propre clé). Logique pure, testée par tests/i18n.test.ts.
 * Variables : `{1}`, `{2}`… remplacées par les valeurs données dans l'ordre (`t("{1} offres à trancher", [n])`) ; les mêmes numéros servent dans toutes les langues,
 * ce qui permet de changer l'ordre des mots (« {2} {1} »).
 */
export type Dict = Record<string, string>;
export type Vars = ReadonlyArray<string | number>;

export function fill(text: string, vars?: Vars): string {
  if (!vars || !vars.length) return text;
  return text.replace(/\{(\d+)\}/g, (m, n: string) => { const v = vars[Number(n) - 1]; return v === undefined ? m : String(v); });
}

/** Une clé normalisée : espaces insécables et espaces multiples ne changent pas la correspondance. */
export const keyOf = (s: string) => s.replace(/[  ]/g, " ").replace(/\s+/g, " ").trim();

export function translate(dict: Dict | null | undefined, text: string, vars?: Vars): string {
  const hit = dict && (dict[text] ?? dict[keyOf(text)]);
  return fill(hit ?? text, vars);
}
