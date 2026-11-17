// Coller l'annonce entière sur une offre déjà analysée (lib/offer-text.ts, route reanalyze, panneau offer-fiche) : sans réseau ni IA.
import { readFileSync } from "node:fs";
import { ok, done } from "./helpers";
import { readPastedText, textHint, MIN_PASTED, MAX_PASTED, SHORT_TEXT } from "../lib/offer-text";

const read = (p: string) => readFileSync(p, "utf8"); // les tests tournent depuis la racine du dépôt
const long = "Data analyst confirmé, vous analysez les ventes et construisez des tableaux de bord Power BI. ".repeat(12);

/* ---------- Le texte collé ---------- */
const r = readPastedText(long);
ok("texte collé : un texte assez long est accepté", r.ok && r.text.length >= MIN_PASTED);
ok("texte collé : espaces autour retirés", readPastedText(`  \n${long}\n  `).ok && (readPastedText(`  \n${long}\n  `) as { text: string }).text === long.trim());
ok("texte collé : rien ou pas du texte = « Colle le texte »", ["", "   ", undefined, null, 12, {}, []].every((v) => { const x = readPastedText(v); return !x.ok && /Colle le texte/.test(x.error); }));
const short = readPastedText("Poste de data analyst à Lyon.");
ok("texte collé : trop court, la phrase dit combien", !short.ok && /trop court \(29 signes sur 150/.test(short.error));
ok("texte collé : 149 signes refusés, 150 acceptés", !readPastedText("a".repeat(149)).ok && readPastedText("a".repeat(150)).ok);
const big = readPastedText("mot ".repeat(20000));
ok("texte collé : coupé à 30 000 signes", big.ok && big.text.length <= MAX_PASTED);
const dirty = readPastedText(`Analyste BI chez ${"\u0000"}nance ${"ﬁ".repeat(2)} ${long}`);
ok("texte collé : le NUL que PostgreSQL refuse et les ligatures sont nettoyés", dirty.ok && !dirty.text.includes("\u0000") && !dirty.text.includes("ﬁ"));
ok("texte collé : les espaces insécables et les contrôles ne comptent pas comme du texte", !readPastedText(`${"\u0000".repeat(300)}`).ok && !readPastedText(" ".repeat(400)).ok);

/* ---------- La phrase d'aide ---------- */
ok("aide : sous 150 signes, trop court", /Trop court pour analyser/.test(textHint(0)) && /Trop court/.test(textHint(MIN_PASTED - 1)));
ok("aide : entre 150 et 800, texte court avec le nombre de signes", /Texte court \(300 signes\)/.test(textHint(300)) && /Texte court/.test(textHint(SHORT_TEXT - 1)));
ok("aide : à partir de 800, rien à dire", textHint(SHORT_TEXT) === "" && textHint(12000) === "");
ok("seuils : 150 comme l'analyse d'une annonce collée, 800 comme repère", MIN_PASTED === 150 && SHORT_TEXT === 800 && MAX_PASTED === 30000);

/* ---------- La route ---------- */
const rea = read("app/api/offers/[id]/reanalyze/route.ts");
ok("route : lit `text` et le contrôle avec readPastedText", /readPastedText\(body\.text\)/.test(rea) && /status: 400|HttpError\(400/.test(rea));
ok("route : `source: fiche` l'emporte, le texte n'est pas lu alors", /hasText = body\.text !== undefined && !fromFiche/.test(rea));
ok("route : le texte collé est rangé sur l'offre AVANT l'appel d'IA", /must\(await supabase\.from\("offers"\)\.update\(\{ raw_text: text \}\)/.test(rea) && rea.indexOf("raw_text: text }") < rea.lastIndexOf("spendAi("));
ok("route : l'annonce n'est PAS relue sur le site quand la personne la colle", /!pasted && text\.length < 300/.test(rea));
ok("route : si l'analyse échoue, le texte est dit gardé", /Le texte que tu as collé est gardé sur l'offre/.test(rea) && /Refaire l'analyse/.test(rea));
ok("route : une analyse du quota, comme avant", /spendAi\(supabase, user, AI_COST\.offer\)/.test(rea));
ok("route : la fiche remplie à la main reste protégée", /mergeReread\(/.test(rea));

/* ---------- L'écran ---------- */
const ui = read("components/offer-fiche.tsx");
ok("écran : le bouton s'appelle « Coller l'annonce »", /Coller l'annonce/.test(ui) && !/> Modifier la fiche</.test(ui));
ok("écran : zone de texte pré-remplie avec le texte gardé", /useState\(rawText\)/.test(ui) && /setText\(rawText\)/.test(ui) && /value=\{text\}/.test(ui));
ok("écran : bouton principal « Relire et refaire l'analyse » qui envoie le texte", /Relire et refaire l'analyse/.test(ui) && /body: \{ text \}/.test(ui));
ok("écran : l'aide de longueur vient de textHint et le bouton suit MIN_PASTED", /textHint\(/.test(ui) && /MIN_PASTED/.test(ui));
ok("écran : la fiche à la main reste là, repliée, avec ses deux boutons", /<details/.test(ui) && /Corriger la fiche à la main/.test(ui) && /Enregistrer la fiche/.test(ui) && /Enregistrer et refaire l'analyse/.test(ui) && /source: "fiche"/.test(ui));
const act = read("components/offer-actions.tsx");
const page = read("app/offres/[id]/page.tsx");
ok("page : le texte gardé arrive jusqu'au panneau", /rawText=\{/.test(act) && /rawText=\{/.test(page) && /raw_text/.test(page));

done();
