// Fiche d'une offre modifiée à la main (lib/offer-fiche.ts, lib/offer-fiche-db.ts) : sans réseau ni IA.
import { readFileSync } from "node:fs";
import { ok, done } from "./helpers";
import { fakeSupabase } from "./fake-supabase";
import { cleanText, cleanList, readFiche, ficheOf, applyFiche, mergeReread, forPrompt, withColumns, linePatch, handKeys, columnsOf, FICHE_KEYS } from "../lib/offer-fiche";
import { saveFiche } from "../lib/offer-fiche-db";
import type { OfferExtract } from "../lib/types";

const read = (p: string) => readFileSync(p, "utf8"); // les tests tournent depuis la racine du dépôt

/* ---------- Nettoyage ---------- */
ok("texte : espaces repliés, coupé à sa taille", cleanText("  Technicien   Support\n N2  ", "title") === "Technicien Support N2" && cleanText("x".repeat(500), "title").length === 120);
ok("texte : un non-texte donne vide", cleanText(42, "title") === "" && cleanText(null, "company") === "");
ok("texte : les retours à la ligne du contexte sont gardés", cleanText("a\n\n\n\nb", "company_context") === "a\n\nb");
ok("liste : un élément par ligne, puces retirées, doublons et vides écartés", JSON.stringify(cleanList("- SQL\n• Power BI\n\n sql \n* Python")) === JSON.stringify(["SQL", "Power BI", "Python"]));
ok("liste : tableau accepté, non-textes ignorés, 30 au plus", cleanList(["a", 3, "b"]).length === 2 && cleanList(Array.from({ length: 60 }, (_, i) => `mot${i}`)).length === 30);
ok("liste : n'importe quoi donne vide", cleanList(undefined).length === 0 && cleanList({}).length === 0);

/* ---------- Lecture de la requête ---------- */
const patch = readFiche({ title: " Technicien Support N2 Base de Données & Applicatifs ", keywords: "SQL\nOracle", evil: "x", hand: ["title"], __proto__: { a: 1 } });
ok("requête : seuls les champs connus sont lus", Object.keys(patch).sort().join() === "keywords,title");
ok("requête : un champ absent n'est pas touché", !("company" in patch));
ok("requête : un corps illisible ne donne rien", Object.keys(readFiche(null)).length === 0 && Object.keys(readFiche("x")).length === 0);

/* ---------- La fiche pour l'écran ---------- */
const spie: Partial<OfferExtract> = { title: "", company: "SPIE", location: "Lyon", contract: "CDI", missions: ["Support N2"], keywords: ["SQL"] };
const f0 = ficheOf(spie, { title: "", company: "SPIE" });
ok("fiche : tous les champs présents, vides par défaut", FICHE_KEYS.every((k) => k in f0) && f0.title === "" && f0.remote === "" && f0.must_have.length === 0);
ok("fiche : la colonne complète un champ vide", ficheOf({ title: "" }, { title: "Analyste BI" }).title === "Analyste BI");
ok("fiche : rien de l'IA n'est cru sur parole (types faux)", ficheOf({ title: 12, missions: "x", keywords: [1, "SQL"] }).keywords.join() === "SQL" && ficheOf({ missions: "x" }).missions.join() === "x");
ok("fiche : une offre sans extrait ne casse rien", ficheOf(null).title === "" && ficheOf(undefined).missions.length === 0);

/* ---------- Appliquer les corrections ---------- */
const a1 = applyFiche(spie, readFiche({ title: "Technicien Support N2 Base de Données & Applicatifs", company: "SPIE" }), { title: "", company: "SPIE" });
ok("appliquer : le poste est écrit dans l'extrait", a1.extracted.title === "Technicien Support N2 Base de Données & Applicatifs");
ok("appliquer : seul ce qui a changé est noté (l'entreprise, identique, non)", a1.changed.join() === "title" && handKeys(a1.extracted).join() === "title");
ok("appliquer : les champs non envoyés restent", a1.extracted.location === "Lyon" && a1.extracted.missions.join() === "Support N2");
const a2 = applyFiche(a1.extracted, readFiche({ location: "Paris", keywords: "SQL\nOracle" }));
ok("appliquer : la mémoire de ce qui est rempli s'additionne", handKeys(a2.extracted).sort().join() === "keywords,location,title");
ok("appliquer : vider un champ est un choix de la personne (noté)", applyFiche(spie, readFiche({ location: "" })).changed.join() === "location");
ok("appliquer : sans changement, pas de `hand`", !("hand" in applyFiche(spie, readFiche({ company: "SPIE" })).extracted));
ok("colonnes : le poste, l'entreprise, le lieu, le contrat", JSON.stringify(columnsOf(a2.extracted)) === JSON.stringify({ title: a1.extracted.title, company: "SPIE", location: "Paris", contract: "CDI" }));

/* ---------- Relecture de l'annonce par l'IA ---------- */
const fresh: OfferExtract = { title: "", company: "SPIE Industrie", location: "Lyon 3e", contract: "CDI", remote: "", seniority: "Non précisé", salary: "", domain: "", company_context: "", missions: ["Autre mission"], must_have: [], nice_to_have: [], soft_skills: [], keywords: ["Linux"], red_flags: [] };
const merged = mergeReread(a2.extracted, fresh);
ok("relecture : le poste rempli à la main n'est pas écrasé par un poste vide", merged.title === "Technicien Support N2 Base de Données & Applicatifs");
ok("relecture : un champ rempli à la main garde sa valeur (lieu, mots-clés)", merged.location === "Paris" && merged.keywords.join() === "SQL,Oracle");
ok("relecture : les autres champs prennent la nouvelle lecture", merged.company === "SPIE Industrie" && merged.missions.join() === "Autre mission");
ok("relecture : la mémoire est conservée", handKeys(merged).sort().join() === "keywords,location,title");
ok("relecture : sans rien rempli à la main, c'est la lecture de l'IA telle quelle", mergeReread(spie, fresh) === fresh);

/* ---------- Ce qu'on envoie aux IA ---------- */
ok("IA : la mémoire `hand` n'est jamais envoyée", !("hand" in forPrompt(a2.extracted)) && "title" in forPrompt(a2.extracted));
ok("CV : un poste seulement dans la colonne passe dans l'extrait", withColumns({ title: "", company: "SPIE" }, { title: "Technicien N2" }).title === "Technicien N2");
ok("CV : un extrait absent ne casse rien", withColumns(null, { title: "Technicien N2" }).keywords.length === 0);

/* ---------- La ligne de Suivi ---------- */
const before = { title: "", company: "SPIE", location: "Lyon", contract: "CDI" };
const after = { title: "Technicien Support N2", company: "SPIE", location: "Lyon", contract: "CDI" };
ok("Suivi : « Poste ? » devient le vrai poste", linePatch(before, after, { title: "Poste ?", company: "SPIE", location: "Lyon", contract: "CDI" }).title === "Technicien Support N2");
ok("Suivi : une ligne vide est complétée", linePatch(before, after, { title: "", company: "SPIE" }).title === "Technicien Support N2");
ok("Suivi : ce que la personne a écrit sur la ligne reste", !("title" in linePatch({ ...before, title: "Data analyst" }, { ...after, title: "Technicien" }, { title: "Mon titre à moi", company: "SPIE", location: "Lyon", contract: "CDI" })));
ok("Suivi : une ligne qui reprenait l'ancien poste suit", linePatch({ ...before, title: "Data analyst" }, { ...after, title: "Technicien" }, { title: "Data analyst", company: "SPIE" }).title === "Technicien");
ok("Suivi : un champ rendu vide ne vide pas la ligne", !("location" in linePatch(before, { ...after, location: "" }, { title: "x", location: "Lyon" })));

/* ---------- Base (fausse base) ---------- */
const seed = () => ({
  offers: [{ id: "o1", user_id: "u", title: "", company: "SPIE", location: "Lyon", contract: "CDI", extracted: { ...spie } }],
  applications: [
    { id: "a1", offer_id: "o1", title: "Poste ?", company: "SPIE", location: "Lyon", contract: "CDI" },
    { id: "a2", offer_id: "o1", title: "Ma façon de l'appeler", company: "SPIE", location: null, contract: null },
    { id: "a3", offer_id: "autre", title: "Poste ?", company: "SPIE" },
  ],
});
{
  const { sb, tables } = fakeSupabase(seed());
  const r = await saveFiche(sb, "o1", readFiche({ title: "Technicien Support N2 Base de Données & Applicatifs", keywords: "SQL\nOracle" }));
  const o = tables.offers[0] as { title: string; extracted: OfferExtract };
  ok("base : le poste est écrit dans la colonne ET dans l'extrait", o.title === "Technicien Support N2 Base de Données & Applicatifs" && o.extracted.title === o.title);
  ok("base : les mots-clés et la mémoire sont dans l'extrait", o.extracted.keywords.join() === "SQL,Oracle" && handKeys(o.extracted).sort().join() === "keywords,title");
  ok("base : la ligne « Poste ? » de cette offre est mise à jour", tables.applications[0].title === o.title && r.lines >= 1);
  ok("base : la ligne que la personne a nommée n'est pas touchée", tables.applications[1].title === "Ma façon de l'appeler");
  ok("base : la ligne d'une autre offre n'est pas touchée", tables.applications[2].title === "Poste ?");
  ok("base : la réponse donne la fiche enregistrée", r.fiche.title === o.title && r.changed.sort().join() === "keywords,title");
}
{
  const { sb } = fakeSupabase(seed());
  let code = 0;
  try { await saveFiche(sb, "inconnue", readFiche({ title: "x" })); } catch (e) { code = (e as { status?: number }).status ?? -1; }
  ok("base : une offre inconnue répond 404", code === 404);
  code = 0;
  try { await saveFiche(sb, "o1", {}); } catch (e) { code = (e as { status?: number }).status ?? -1; }
  ok("base : une requête vide répond 400", code === 400);
}

/* ---------- Câblage (lecture du source) ---------- */
const ai = read("lib/ai.ts");
ok("IA : aucune offre n'est envoyée sans passer par forPrompt", !/JSON\.stringify\(offer\)/.test(ai) && (ai.match(/JSON\.stringify\(forPrompt\(offer\)\)/g) ?? []).length === 4);
const gen = read("app/api/offers/[id]/generate/route.ts");
ok("génération : CV, lettre et préparation lisent la fiche complétée", /withColumns\(offer\.extracted, offer\)/.test(gen) && !/offer\.extracted[,)]/.test(gen.replace(/withColumns\(offer\.extracted, offer\)/, "")));
const rea = read("app/api/offers/[id]/reanalyze/route.ts");
ok("réanalyse : source « fiche » sans relecture, et relecture qui garde la main de la personne", /source === "fiche"/.test(rea) && /mergeReread\(offer\.extracted, read, offer\)/.test(rea));
const ana = read("app/api/offers/analyze/route.ts");
ok("analyse (passage d'estimé à complet) : la fiche remplie à la main est gardée", /mergeReread\(/.test(ana));
const route = read("app/api/offers/[id]/route.ts");
ok("route : PATCH existe et passe par saveFiche", /export async function PATCH/.test(route) && /saveFiche\(supabase, id, readFiche\(body\)\)/.test(route));
const page = read("app/offres/[id]/page.tsx");
ok("page : le poste manquant est dit, avec un lien pour le renseigner", /Poste non précisé/.test(page) && /\?fiche=1/.test(page) && /fiche=\{analysed \? fiche : undefined\}/.test(page));
const act = read("components/offer-actions.tsx");
ok("actions : « Modifier la fiche » est à côté de « Refaire l'analyse »", /<OfferFiche /.test(act));
const ui = read("components/offer-fiche.tsx");
ok("écran : deux boutons, enregistrer seul et enregistrer + analyse depuis la fiche", /Enregistrer et refaire l'analyse/.test(ui) && /source: "fiche"/.test(ui) && /method: "PATCH"/.test(ui));
ok("écran : tous les champs de la fiche sont proposés", /TEXT_FIELDS/.test(ui) && /LIST_FIELDS/.test(ui));

done();
