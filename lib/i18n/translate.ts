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

/** Une valeur absente (null, undefined) passe telle quelle : on peut envelopper sans crainte ce qui s'affiche. */
export type TFn = <T extends string | null | undefined>(text: T, vars?: Vars) => T extends string ? string : T;

export const translate: (dict: Dict | null | undefined, text: string | null | undefined, vars?: Vars) => string | null | undefined = (dict, text, vars) => {
  if (typeof text !== "string") return text;
  const hit = dict && (dict[text] ?? dict[keyOf(text)]);
  return fill(hit ?? text, vars);
};

/** Fabrique le `t` d'une langue. */
export const makeT = (dict: Dict | null | undefined): TFn => ((text: string | null | undefined, vars?: Vars) => translate(dict, text, vars)) as unknown as TFn;

/**
 * Marque un texte français écrit hors d'un composant (liste de libellés, message d'une fonction) pour qu'il soit traduit : `tx` ne change rien à l'exécution
 * (le texte reste français), mais il est compté parmi les textes à traduire (tests/i18n.test.ts) ; l'endroit où il s'AFFICHE le traduit avec `t(...)`.
 */
export const tx = <S extends string>(text: S): S => text;
