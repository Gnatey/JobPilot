/**
 * Nettoyage du texte lu dans un PDF, un Word ou collé (logique pure, tests/clean-text.test.ts).
 *
 * Cause du « l'appli n'a pas pu lire le CV » d'un ami en Turquie (13 novembre) : son PDF, exporté par Chrome, remplace chaque ligature « fi » par le caractère
 * nul (U+0000) à la lecture (« Con?dence », « adambagrila?a@gmail.com », « pro?cient »). PostgreSQL refuse ce caractère dans une colonne JSON
 * (« unsupported Unicode escape sequence », vérifié sur une vraie base locale) : le CV était lu, puis l'enregistrement plantait. La langue n'y était pour rien.
 */

/** Ligatures typographiques écrites comme de vrais caractères : on remet les lettres (les logiciels de tri ne lisent pas « ﬁ »). */
const LIGATURES: Record<string, string> = { "ﬀ": "ff", "ﬁ": "fi", "ﬂ": "fl", "ﬃ": "ffi", "ﬄ": "ffl", "ﬅ": "st", "ﬆ": "st" };

const letter = (c: string | undefined) => !!c && /\p{L}/u.test(c);
const lower = (c: string | undefined) => !!c && c !== c.toUpperCase() && c === c.toLowerCase();

/**
 * Un caractère nul est, dans ces PDF, soit une ligature « fi » dont la lecture a perdu la correspondance (le cas de loin le plus fréquent), soit un emoji.
 * Entre deux lettres (« Con?dence ») ou devant une minuscule (« ?les ») : « fi ». Après une lettre, en fin de mot (« sta? ») : « ff ». Ailleurs (emoji seul,
 * début ou fin de texte) : rien. C'est une DEVINETTE : « ﬂ » (flow) et « ﬃ » (office) lus ainsi deviennent « fi » ; le mot reste lisible pour l'IA mais l'adresse e-mail
 * d'un tel CV est à relire dans le profil.
 */
export function cleanExtractedText(text: string): string {
  let t = String(text ?? "");
  t = t.replace(/[ﬀ-ﬆ]/g, (c) => LIGATURES[c] ?? c);
  t = t.replace(/\u0000+/g, (m, offset: number, all: string) => {
    const prev = [...all.slice(Math.max(0, offset - 2), offset)].pop();
    const next = all[offset + m.length];
    if (letter(prev) && letter(next)) return "fi";
    if (letter(prev)) return "ff";
    if (letter(next) && lower(next)) return "fi";
    return "";
  });
  // Autres caractères de contrôle (sauf tabulation, retour à la ligne) : jamais du texte
  t = t.replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ");
  // Un demi-caractère orphelin (emoji coupé) ferait échouer l'enregistrement : on le retire
  const well = (t as unknown as { toWellFormed?: () => string }).toWellFormed;
  if (typeof well === "function") t = well.call(t);
  return t;
}
