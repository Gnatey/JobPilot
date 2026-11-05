// Contraste des couleurs du thème (clair et sombre) : les paires texte / fond utilisées par l'application respectent WCAG AA (4,5 pour du texte).
// Lit les vraies valeurs de app/globals.css : changer une couleur sans vérifier le contraste fait échouer ce test.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { ok, done } from "./helpers";

const css = readFileSync("app/globals.css", "utf8");
const block = (start: string) => {
  const i = css.indexOf(start);
  if (i < 0) throw new Error("bloc introuvable : " + start);
  const open = css.indexOf("{", i);
  let depth = 0, j = open;
  for (; j < css.length; j++) { if (css[j] === "{") depth++; if (css[j] === "}" && --depth === 0) break; }
  return css.slice(open + 1, j);
};
const tokens = (b: string) => Object.fromEntries([...b.matchAll(/--color-([\w-]+):\s*(#[0-9a-fA-F]{6})\b/g)].map((m) => [m[1], m[2]]));

const light = tokens(block("@theme"));
const darkAuto = tokens(block(':root:not([data-theme="light"])'));
const darkForced = tokens(block(':root[data-theme="dark"]'));
const dark = { ...light, ...darkForced };

const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

ok("le thème sombre automatique et le thème sombre forcé ont exactement les mêmes couleurs", JSON.stringify(darkAuto) === JSON.stringify(darkForced) && Object.keys(darkForced).length >= 10, `${Object.keys(darkAuto).length} / ${Object.keys(darkForced).length}`);
ok("chaque couleur du thème sombre existe aussi en clair (pas de couleur orpheline)", Object.keys(darkForced).every((k) => k in light));

// [texte, fond, usage]
const PAIRS: [string, string, string][] = [
  ["ink", "paper", "texte courant sur la page"],
  ["ink", "surface", "texte courant sur une carte"],
  ["muted", "paper", "texte secondaire sur la page"],
  ["muted", "surface", "texte secondaire sur une carte"],
  ["marigold-deep", "surface", "texte jaune foncé (alertes, étiquettes)"],
  ["good", "surface", "texte vert (succès)"],
  ["bad", "surface", "texte rouge (erreur)"],
  ["sky", "surface", "texte bleu (liens, relances)"],
  ["on-solid", "bad", "chiffre blanc/encre sur pastille ou bouton rouge"],
  ["on-solid", "good", "coche sur pastille verte"],
  ["chrome-ink", "chrome", "menu latéral"],
  ["chrome", "marigold", "chiffre sur pastille jaune"],
];
for (const [name, theme] of [["clair", light], ["sombre", dark]] as const) {
  for (const [fg, bg, usage] of PAIRS) {
    const r = ratio(theme[fg], theme[bg]);
    ok(`${name} : ${usage} (${fg} sur ${bg})`, r >= 4.5, `${r.toFixed(2)} (${theme[fg]} sur ${theme[bg]})`);
  }
}
ok("bouton principal : encre foncée sur jaune", ratio("#151c38", light.marigold) >= 4.5 && /\.btn-primary \{[^}]*color: #151c38/.test(css));

// Garde-fou : aucun texte blanc posé sur un fond plein rouge ou vert (illisible en sombre) ; utiliser `text-on-solid`
function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx$/.test(f)) out.push(p);
  }
  return out;
}
const bad = ["app", "components"].flatMap((d) => walk(d)).flatMap((f) =>
  readFileSync(f, "utf8").split("\n").map((l, i) => ({ f, i: i + 1, l })).filter(({ l }) => /\bbg-(bad|good)(?![/\w-])/.test(l) && /\btext-white\b/.test(l)).map(({ f, i }) => `${f}:${i}`));
ok("aucun `text-white` sur un fond `bg-bad` ou `bg-good` (utiliser `text-on-solid`)", bad.length === 0, bad.join(" | "));
done();
