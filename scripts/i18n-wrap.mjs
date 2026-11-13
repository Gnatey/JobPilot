// Enveloppe les textes affichés d'un composant dans t("…") (voir lib/i18n/locales.ts) : texte JSX, attributs placeholder / title / aria-label / alt,
// expressions de type chaîne affichées dans le JSX, arguments de toast / setErr / setMsg… Usage : node scripts/i18n-wrap.mjs fichier.tsx …
// Ne touche qu'aux fichiers donnés ; rejouable (ce qui est déjà dans t(...) n'est pas ré-enveloppé). À relire avant de livrer.
import ts from "typescript";
import fs from "node:fs";
import path from "node:path";

const files = process.argv.slice(2).map((f) => path.resolve(f));
const cfgPath = ts.findConfigFile(process.cwd(), ts.sys.fileExists, "tsconfig.json");
const cfg = ts.readConfigFile(cfgPath, ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, process.cwd());
const program = ts.createProgram(parsed.fileNames, parsed.options);
const checker = program.getTypeChecker();

const ATTRS = new Set(["placeholder", "title", "aria-label", "alt", "aria-description", "label"]);
const CALLS = new Set(["toast", "setErr", "setError", "setNotice", "setMsg", "setMessage", "setInfo", "setFeedback", "setStatusMsg", "confirm", "alert"]);
const PROPS = new Set(["text", "message", "title", "label", "detail", "msg", "description"]);
const TXPROPS = new Set([...(process.env.EXTRA_PROPS ?? "").split(",").filter(Boolean),"text", "label", "title", "desc", "description", "hint", "sub", "help", "cta", "tip", "empty", "placeholder", "heading", "message"]);
const sentence = (s) => /\p{L}/u.test(s) && (/\s/.test(s.trim()) || /[^\u0000-\u007F]/.test(s) || /^[A-ZÀ-Ý]/.test(s));
const hasLetters = (s) => /\p{L}/u.test(s);
const ENT = { "&nbsp;": " ", "&apos;": "'", "&#39;": "'", "&quot;": '"', "&amp;": "&", "&lt;": "<", "&gt;": ">", "&laquo;": "«", "&raquo;": "»", "&hellip;": "…", "&rsquo;": "’", "&eacute;": "é" };
const decode = (s) => s.replace(/&[#\w]+;/g, (m) => ENT[m] ?? m);
const norm = (s) => s.replace(/\s+/g, " ").trim();
const q = (s) => JSON.stringify(s);

const report = [];
for (const file of files) {
  const sf = program.getSourceFile(file);
  if (!sf) { report.push(`${file}: introuvable dans le projet`); continue; }
  const text = sf.getFullText();
  const client = /^\s*(["'])use client\1/.test(text);
  const edits = [];
  const needs = new Set(); // fonctions-composants qui utilisent t
  const manual = [];

  // `t` déjà déclaré dans le fichier ?
  let clash = false;
  const scan = (n) => {
    if ((ts.isVariableDeclaration(n) || ts.isParameter(n) || ts.isBindingElement(n)) && ts.isIdentifier(n.name) && n.name.text === "t") clash = true;
    ts.forEachChild(n, scan);
  };
  scan(sf);
  if (clash) { report.push(`${path.relative(process.cwd(), file)}: une variable « t » existe déjà : à faire à la main`); continue; }

  const isFn = (n) => ts.isFunctionDeclaration(n) || ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isMethodDeclaration(n);
  const fnName = (n) => {
    if ((ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n)) && n.name) return n.name.text;
    let p = n.parent;
    while (p && (ts.isParenthesizedExpression(p) || ts.isCallExpression(p) || ts.isAsExpression(p))) p = p.parent;
    if (p && ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) return p.name.text;
    return null;
  };
  const isDefaultExport = (n) => ts.isFunctionDeclaration(n) && (ts.getCombinedModifierFlags(n) & ts.ModifierFlags.ExportDefault) !== 0;
  const componentOf = (node) => {
    for (let n = node.parent; n; n = n.parent) {
      if (!isFn(n)) continue;
      const name = fnName(n);
      if ((name && /^[A-Z]/.test(name)) || (name && /^use[A-Z]/.test(name)) || isDefaultExport(n)) return n;
    }
    return null;
  };
  const use = (node) => { const c = componentOf(node); if (!c) return false; needs.add(c); return true; };

  const wrapLiteral = (node, str) => {
    if (!hasLetters(str)) return;
    if (!use(node)) { manual.push(`hors composant : ${q(norm(str)).slice(0, 70)}`); return; }
    edits.push({ start: node.getStart(), end: node.getEnd(), text: `t(${q(norm(str))})` });
  };
  const wrapTemplate = (node) => {
    // `a ${x} b ${y}` → t("a {1} b {2}", [x, y])
    let key = node.head.text; const vars = [];
    node.templateSpans.forEach((sp, i) => { key += `{${i + 1}}` + sp.literal.text; vars.push(sp.expression.getText()); });
    if (!hasLetters(key.replace(/\{\d+\}/g, ""))) return;
    if (!use(node)) { manual.push(`hors composant : ${q(norm(key)).slice(0, 70)}`); return; }
    edits.push({ start: node.getStart(), end: node.getEnd(), text: `t(${q(norm(key))}, [${vars.join(", ")}])` });
  };
  const isStringish = (type) => {
    const parts = type.isUnion() ? type.types : [type];
    const strs = parts.filter((p) => p.flags & ts.TypeFlags.StringLike);
    const rest = parts.filter((p) => !(p.flags & ts.TypeFlags.StringLike) && !(p.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.BooleanLike | ts.TypeFlags.Void)));
    return strs.length > 0 && rest.length === 0;
  };
  const alreadyT = (e) => ts.isCallExpression(e) && ts.isIdentifier(e.expression) && e.expression.text === "t";
  /** Un texte affiché : on envoie littéraux, modèles, branches de ternaire et expressions de type chaîne vers t(). */
  const display = (e) => {
    if (ts.isParenthesizedExpression(e)) return display(e.expression);
    if (alreadyT(e)) return;
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return wrapLiteral(e, e.text);
    if (ts.isTemplateExpression(e)) return wrapTemplate(e);
    if (ts.isConditionalExpression(e)) { display(e.whenTrue); display(e.whenFalse); return; }
    if (ts.isBinaryExpression(e) && [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(e.operatorToken.kind)) {
      if (e.operatorToken.kind !== ts.SyntaxKind.AmpersandAmpersandToken) display(e.left);
      display(e.right); return;
    }
    if (ts.isJsxElement(e) || ts.isJsxSelfClosingElement(e) || ts.isJsxFragment(e)) return;
    if (ts.isNumericLiteral(e)) return;
    if (isStringish(checker.getTypeAtLocation(e))) {
      if (!use(e)) { manual.push(`hors composant : ${e.getText().slice(0, 70)}`); return; }
      edits.push({ start: e.getStart(), end: e.getEnd(), text: `t(${e.getText()})` });
    }
  };

  let needTx = false;
  const inCall = (n) => { for (let p = n.parent; p; p = p.parent) if (ts.isCallExpression(p) && ts.isIdentifier(p.expression) && (p.expression.text === "t" || p.expression.text === "tx")) return true; return false; };
  const markTx = (lit) => {
    if (!(ts.isStringLiteral(lit) || ts.isNoSubstitutionTemplateLiteral(lit))) return;
    if (!sentence(lit.text) || inCall(lit)) return;
    needTx = true;
    edits.push({ start: lit.getStart(), end: lit.getEnd(), text: `tx(${q(norm(lit.text))})` });
  };
  const returnsOf = (e) => {
    if (ts.isParenthesizedExpression(e)) return returnsOf(e.expression);
    if (ts.isConditionalExpression(e)) { returnsOf(e.whenTrue); returnsOf(e.whenFalse); return; }
    markTx(e);
  };
  const visit = (n) => {
    // Libellés rangés dans des listes ou des objets (« { label: "Mon CV" } ») : marqués pour la traduction, traduits à l'endroit où ils s'affichent
    if (ts.isPropertyAssignment(n) && TXPROPS.has(n.name.getText()) && ts.isObjectLiteralExpression(n.parent)) {
      const call = n.parent.parent;
      const inDisplayCall = ts.isCallExpression(call) && ts.isIdentifier(call.expression) && CALLS.has(call.expression.text);
      if (!inDisplayCall) returnsOf(n.initializer);
    }
    // Messages renvoyés par une fonction qui n'est pas un composant (« friendly(message) ») : même marque
    if (ts.isReturnStatement(n) && n.expression) {
      const f = (() => { for (let p = n.parent; p; p = p.parent) if (isFn(p)) return p; return null; })();
      if (f && !componentOf(n) && !(fnName(f) && /^[A-Z]/.test(fnName(f)))) returnsOf(n.expression);
    }
    if (ts.isJsxText(n)) {
      const raw = n.getText();
      const core = decode(raw);
      if (hasLetters(core)) {
        const lead = raw.match(/^\s*/)[0], trail = raw.match(/\s*$/)[0];
        if (use(n)) edits.push({ start: n.getStart(), end: n.getEnd(), text: `${lead}{t(${q(norm(core))})}${trail}` });
        else manual.push(`hors composant : ${q(norm(core)).slice(0, 70)}`);
      }
    } else if (ts.isJsxAttribute(n) && n.initializer && ATTRS.has(n.name.getText())) {
      const init = n.initializer;
      if (ts.isStringLiteral(init)) {
        const raw = decode(init.getText().slice(1, -1));
        if (hasLetters(raw) && use(n)) edits.push({ start: init.getStart(), end: init.getEnd(), text: `{t(${q(norm(raw))})}` });
      } else if (ts.isJsxExpression(init) && init.expression) display(init.expression);
    } else if (ts.isJsxExpression(n) && n.expression && (ts.isJsxElement(n.parent) || ts.isJsxFragment(n.parent))) {
      display(n.expression);
    } else if (ts.isCallExpression(n)) {
      const callee = ts.isIdentifier(n.expression) ? n.expression.text : ts.isPropertyAccessExpression(n.expression) ? n.expression.name.text : "";
      if (CALLS.has(callee)) {
        for (const a of n.arguments) {
          if (ts.isObjectLiteralExpression(a)) {
            for (const p of a.properties) if (ts.isPropertyAssignment(p) && PROPS.has(p.name.getText())) display(p.initializer);
          } else if (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a) || ts.isTemplateExpression(a) || ts.isConditionalExpression(a) || ts.isIdentifier(a) || ts.isCallExpression(a) || ts.isPropertyAccessExpression(a)) display(a);
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);

  // `t` dans chaque composant concerné
  for (const fn of needs) {
    const fnText = fn.getText();
    if (/const t = (useT\(\)|await getT\(\))/.test(fnText)) continue;
    const decl = client ? "const t = useT();" : "const t = await getT();";
    if (!client && !(ts.getCombinedModifierFlags(fn) & ts.ModifierFlags.Async) && !(fn.modifiers ?? []).some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)) {
      if (ts.isArrowFunction(fn)) edits.push({ start: fn.getStart(), end: fn.getStart(), text: "async " });
      else { const i = fn.getText().indexOf("function"); edits.push({ start: fn.getStart() + i, end: fn.getStart() + i, text: "async " }); }
    }
    if (ts.isBlock(fn.body)) edits.push({ start: fn.body.getStart() + 1, end: fn.body.getStart() + 1, text: `\n  ${decl}` });
    else { edits.push({ start: fn.body.getStart(), end: fn.body.getStart(), text: `{ ${decl} return ` }); edits.push({ start: fn.body.getEnd(), end: fn.body.getEnd(), text: "; }" }); }
  }

  if (!edits.length) { report.push(`${path.relative(process.cwd(), file)}: rien à faire`); continue; }
  let out = text;
  // Fin de fichier d'abord ; à position égale, une insertion de fin passe avant celle de début
  edits.sort((a, b) => b.start - a.start || b.end - a.end);
  for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  // Importer ce qu'il faut
  const imps = [];
  if (needs.size) imps.push(client ? 'import { useT } from "@/components/i18n";' : 'import { getT } from "@/lib/i18n/server";');
  if (needTx) imps.push('import { tx } from "@/lib/i18n/translate";');
  for (const imp of imps) {
    if (out.includes(imp)) continue;
    const re = /^(import[\s\S]*?from\s+["'][^"']+["'];?[ \t]*\n|import\s+["'][^"']+["'];?[ \t]*\n)/gm;
    let last = 0, m; while ((m = re.exec(out))) last = m.index + m[0].length;
    out = out.slice(0, last) + imp + "\n" + out.slice(last);
  }
  fs.writeFileSync(file, out);
  report.push(`${path.relative(process.cwd(), file)}: ${edits.length} modifications${manual.length ? `, ${manual.length} à faire à la main` : ""}`);
  for (const m of manual) report.push(`   - ${m}`);
}
console.log(report.join("\n"));
