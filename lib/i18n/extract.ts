/**
 * Relève les textes à traduire dans le code : les appels `t("…")` et `tx("…")` (le texte français en littéral, ou en modèle avec `${…}` devenu `{1}`, `{2}`…).
 * Sert aux tests (tests/i18n.test.ts : aucun texte sans traduction). Jamais importé par l'appli.
 */
import ts from "typescript";
import fs from "node:fs";
import path from "node:path";
import { keyOf } from "./translate";

export type Found = { key: string; file: string };

const SKIP = new Set(["node_modules", ".next", ".git", "i18n"]);
function walk(dir: string, out: string[]) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.d\.ts$/.test(e.name)) out.push(p);
  }
}

/** Les textes littéraux d'un argument : `t("a")`, `t(cond ? "a" : "b")`, `t(x || "a")`. Une variable n'est pas un texte (rien à relever). */
function literalsOf(a: ts.Expression): string[] {
  if (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a)) return [a.text];
  if (ts.isParenthesizedExpression(a)) return literalsOf(a.expression);
  if (ts.isConditionalExpression(a)) return [...literalsOf(a.whenTrue), ...literalsOf(a.whenFalse)];
  if (ts.isBinaryExpression(a) && (a.operatorToken.kind === ts.SyntaxKind.BarBarToken || a.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)) return [...literalsOf(a.left), ...literalsOf(a.right)];
  return [];
}

export function collectKeys(roots: string[]): Found[] {
  const files: string[] = [];
  for (const r of roots) walk(r, files);
  const found: Found[] = [];
  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    if (!/\bt\(|\btx\(/.test(text)) continue;
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const visit = (n: ts.Node) => {
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && (n.expression.text === "t" || n.expression.text === "tx") && n.arguments.length) {
        for (const text of literalsOf(n.arguments[0])) found.push({ key: keyOf(text), file });
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return found;
}

/** Les numéros de variables d'un texte : « {1} offres, {2} » → [1, 2]. */
export const placeholders = (s: string): number[] => [...s.matchAll(/\{(\d+)\}/g)].map((m) => Number(m[1])).sort((a, b) => a - b);
