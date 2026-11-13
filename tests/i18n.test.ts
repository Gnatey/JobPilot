import fs from "node:fs";
import { ok, done } from "./helpers";
import { LOCALES, DEFAULT_LOCALE, fromAcceptLanguage, localeOf, pickLocale, isLocale } from "../lib/i18n/locales";
import { makeT, keyOf, fill, tx } from "../lib/i18n/translate";
import { collectKeys, placeholders } from "../lib/i18n/extract";
import { isDeleteWord } from "../lib/delete-word";
import { langDirective } from "../lib/ai-lang";
import en from "../lib/i18n/en";
import tr from "../lib/i18n/tr";

// --- Choix de la langue : navigateur, cookie, profil
ok("tr-TR → tr", localeOf("tr-TR") === "tr");
ok("EN_gb → en", localeOf("EN_gb") === "en");
ok("langue inconnue → null", localeOf("de-DE") === null && localeOf("") === null && localeOf(undefined) === null);
ok("Accept-Language : la première langue gérée", fromAcceptLanguage("de-DE,tr;q=0.8,en;q=0.5") === "tr");
ok("Accept-Language : l'ordre q prime sur l'ordre d'écriture", fromAcceptLanguage("en;q=0.4,tr;q=0.9") === "tr");
ok("Accept-Language : q=0 = refusée", fromAcceptLanguage("tr;q=0,en;q=0.5") === "en");
ok("Accept-Language : aucune langue gérée → null", fromAcceptLanguage("de,ja;q=0.5") === null && fromAcceptLanguage(null) === null);
ok("sans rien : le français", pickLocale({}) === DEFAULT_LOCALE && DEFAULT_LOCALE === "fr");
ok("navigateur turc : turc", pickLocale({ acceptLanguage: "tr-TR,tr;q=0.9,en;q=0.8" }) === "tr");
ok("le choix de la personne passe avant le navigateur", pickLocale({ cookie: "en", acceptLanguage: "tr-TR" }) === "en");
ok("le profil passe avant le navigateur, après le cookie", pickLocale({ profile: "tr", acceptLanguage: "en" }) === "tr" && pickLocale({ cookie: "fr", profile: "tr" }) === "fr");
ok("cookie illisible ignoré", pickLocale({ cookie: "klingon", acceptLanguage: "en" }) === "en");
ok("isLocale", LOCALES.every(isLocale) && !isLocale("de"));

// --- t : traduction, variables, repli
const tEn = makeT(en);
const tFr = makeT(null);
ok("le français reste tel quel", tFr("Réessayer") === "Réessayer");
ok("traduction anglaise", tEn("Réessayer") === "Try again");
ok("texte inconnu : repli en français, jamais une clé vide", tEn("Un texte que personne n'a traduit") === "Un texte que personne n'a traduit");
ok("variables", tEn("Test envoyé à {1}. Regarde ta boîte de réception (et les indésirables).", ["a@b.fr"]) === "Test sent to a@b.fr. Check your inbox (and spam).");
ok("variable absente laissée visible plutôt qu'effacée", fill("a {2} b", ["x"]) === "a {2} b");
ok("valeur nulle passe telle quelle", tEn(null) === null && tEn(undefined) === undefined);
ok("espaces insécables et doubles espaces ne changent pas la clé", keyOf("Mot  de passe ?") === "Mot de passe ?");
ok("tx ne change rien à l'exécution", tx("Réessayer") === "Réessayer");

// --- Couverture : chaque texte du code a sa traduction anglaise ET turque, sans reste
const found = collectKeys(["app", "components", "lib"]);
const keys = [...new Set(found.map((f) => f.key))];
const lacksEn = keys.filter((k) => !(k in en));
const lacksTr = keys.filter((k) => !(k in tr));
ok(`${keys.length} textes relevés dans le code`, keys.length > 300);
ok("aucun texte sans traduction anglaise", lacksEn.length === 0, lacksEn.slice(0, 5).join(" | "));
ok("aucun texte sans traduction turque", lacksTr.length === 0, lacksTr.slice(0, 5).join(" | "));
const known = new Set(keys);
const orphEn = Object.keys(en).filter((k) => !known.has(k));
const orphTr = Object.keys(tr).filter((k) => !known.has(k));
ok("aucune traduction anglaise orpheline (le texte a changé dans le code)", orphEn.length === 0, orphEn.slice(0, 5).join(" | "));
ok("aucune traduction turque orpheline", orphTr.length === 0, orphTr.slice(0, 5).join(" | "));

// --- Qualité des dictionnaires
for (const [name, dict] of [["en", en], ["tr", tr]] as const) {
  const empty = Object.entries(dict).filter(([, v]) => !v.trim());
  ok(`${name} : aucune traduction vide`, empty.length === 0, empty.slice(0, 3).map(([k]) => k).join(" | "));
  const badVars = Object.entries(dict).filter(([k, v]) => placeholders(v).some((n) => !placeholders(k).includes(n)));
  ok(`${name} : aucune variable inventée (« {n} » absent du texte français)`, badVars.length === 0, badVars.slice(0, 3).map(([k]) => k).join(" | "));
  // Une variable du texte français peut manquer au turc (« expérience{2} » : le pluriel n'existe pas), jamais la première (la valeur affichée).
  const noFirst = Object.entries(dict).filter(([k, v]) => placeholders(k).includes(1) && !placeholders(v).includes(1) && !/\{2\}/.test(k));
  ok(`${name} : la valeur {1} n'est jamais perdue`, noFirst.length === 0, noFirst.slice(0, 3).map(([k]) => k).join(" | "));
  const frenchLeft = Object.entries(dict).filter(([k, v]) => v === k && /[éèêàùçôîû]/.test(k) && k.length > 25);
  ok(`${name} : aucune longue phrase française laissée telle quelle`, frenchLeft.length === 0, frenchLeft.slice(0, 3).map(([k]) => k).join(" | "));
}

// --- Les phrases à lien ne sont plus coupées en morceaux
const src = (p: string) => fs.readFileSync(p, "utf8");
ok("inscription : la phrase de consentement est entière (liens par rich)", /rich\(t\("En créant un compte[^"]*\{1\}[^"]*\{2\}\."\)/.test(src("components/login-form.tsx")));
ok("diagnostic : la phrase « chercher des offres » est entière", /rich\(t\("Tes réponses au questionnaire[^"]*\{1\}/.test(src("app/diagnostic/[id]/page.tsx")));
ok("récap : l'adresse est une variable de la phrase", /t\("Chaque matin vers 7 h[^"]*\{1\}[^"]*", \[email\]\)/.test(src("components/settings-controls.tsx")));

// --- Mot de confirmation de la suppression du compte : celui qu'on voit à l'écran, dans chaque langue
ok("SUPPRIMER accepté", isDeleteWord("SUPPRIMER") && isDeleteWord("  supprimer "));
ok("DELETE accepté", isDeleteWord("DELETE") && isDeleteWord("delete"));
ok("SİL accepté (avec ou sans point sur le i)", isDeleteWord("SİL") && isDeleteWord("SIL") && isDeleteWord("sil"));
ok("autre chose refusé", !isDeleteWord("") && !isDeleteWord("oui") && !isDeleteWord("supprimer tout") && !isDeleteWord(undefined) && !isDeleteWord(42));
ok("le mot affiché est celui que le serveur accepte, dans chaque langue", isDeleteWord(tFr("SUPPRIMER")) && isDeleteWord(tEn("SUPPRIMER")) && isDeleteWord(makeT(tr)("SUPPRIMER")));

// --- Textes écrits par l'IA pour la personne : la langue de l'écran, lue AVANT after() (plus de cookies ensuite)
ok("français : aucune consigne de plus", langDirective("fr") === "" && langDirective(undefined) === "");
ok("anglais : la consigne nomme la langue et garde les valeurs du schéma", /en anglais/.test(langDirective("en")) && /bloquant/.test(langDirective("en")));
ok("turc : la consigne nomme la langue", /en turc/.test(langDirective("tr")));
ok("le diagnostic reçoit la consigne", /langDirective\(lang\)/.test(src("lib/ai.ts")) && /diagnoseCv\(text, answers, empty \? null : current, lang\)/.test(src("lib/cv-job.ts")));
ok("les routes lisent la langue avant after()", ["app/api/cv/diagnose/route.ts", "app/api/cv/retry/route.ts"].every((p) => /const lang = await getLocale\(\);[^\n]*\n\s*after\(\(\) => runCvAnalysis\([^)]*lang/.test(src(p))));
ok("les CV et les lettres ne reçoivent PAS la langue de l'écran (celle de l'offre compte)", !/langDirective/.test(src("lib/letter.ts")));

done();
