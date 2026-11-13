// CV d'un ami en Turquie (13 novembre) : PDF exporté par Chrome, ligatures « fi » lues comme le caractère nul, que PostgreSQL refuse dans du JSON.
// Les vrais contextes viennent de ce PDF (extraits avec le lecteur de l'appli). Sans réseau.
import { readFileSync } from "node:fs";
import { ok, done } from "./helpers";
import { cleanExtractedText } from "../lib/clean-text";

const lire = (s: string) => cleanExtractedText(s);

ok("« Con\\0dence » : ligature fi rendue", lire("Investor Con\u0000dence") === "Investor Confidence");
ok("« \\0les » en début de mot, « pro\\0cient », « \\0xes »", lire("project \u0000les for") === "project files for" && lire("pro\u0000cient yet") === "proficient yet" && lire("and \u0000xes on") === "and fixes on");
ok("l'adresse e-mail du CV est rendue entière", lire("adambagrila\u0000a@gmail.com") === "adambagrilafia@gmail.com");
ok("un emoji lu comme un nul (seul, ou en tête du texte) disparaît sans coller de lettres", lire("\u0000 I’m a student") === " I’m a student" && lire("Bariba \u0000\nDendi \u0000") === "Bariba \nDendi ");
ok("un nul collé à une majuscule après une espace est un emoji, pas une ligature", lire("Contact \u0000My Instagram") === "Contact My Instagram");
ok("fin de mot après une lettre : « ff » (staff)", lire("the sta\u0000 and") === "the staff and");
ok("plus aucun caractère nul ni de contrôle (sauf saut de ligne et tabulation)", !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(lire("a\u0000b\u0001c\u0007d\te\nf\u000Bg")) && lire("e\tf\ng") === "e\tf\ng");
ok("vraies ligatures typographiques (ﬁ ﬂ ﬃ) remises en lettres", lire("oﬃce, ﬁle, ﬂow") === "office, file, flow");
ok("un texte ordinaire (accents, turc, emoji complet) ne change pas", lire("Ürün yöneticisi İstanbul ğ ş 👋🏿 Éléonore") === "Ürün yöneticisi İstanbul ğ ş 👋🏿 Éléonore");
ok("un demi-emoji orphelin est retiré (sinon l'enregistrement échoue)", !/[\uD800-\uDFFF]/.test(lire("abc\uD83D")));

// Le texte nettoyé passe en JSON dans une colonne jsonb (ce qui plantait)
ok("le texte nettoyé ne contient plus rien que le JSON de la base refuserait", !JSON.stringify({ t: lire("x\u0000y \u0000 z\u0000") }).includes("\\u0000"));

// Branchements : le lecteur de fichiers et le texte collé passent par le nettoyage
const cvText = readFileSync("lib/cv-text.ts", "utf8");
const route = readFileSync("app/api/cv/diagnose/route.ts", "utf8");
ok("fileToText nettoie le texte des PDF, des Word et des .txt", (cvText.match(/cleanExtractedText\(/g) ?? []).length >= 3 && /import \{ cleanExtractedText \}/.test(cvText));
ok("le CV collé est nettoyé comme les fichiers", /cleanExtractedText\(pasted\)|stripPageMarks\(cleanExtractedText\(String\(form\.get\("text"/.test(route) || /const pasted = cleanExtractedText\(/.test(route));

done();
