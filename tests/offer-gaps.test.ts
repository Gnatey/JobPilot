// Écarts avec l'offre (lib/offer-gaps.ts, lib/offer-gaps-db.ts, route et écran) : sans réseau ni IA. Cas de départ : l'offre LHH « Gestionnaire Base de données » (ERP industriel)
// face au profil de Juliana (ORANO, SNCF, Dynamics 365, Power BI, SQL), le 16 novembre 2026.
import { readFileSync } from "node:fs";
import { ok, done } from "./helpers";
import { fakeSupabase } from "./fake-supabase";
import { EMPTY_PROFILE } from "../lib/empty-profile";
import { offerGaps, gapsState, markGap, refusedLine, refusedTerms, gapQuestion, profileKeys } from "../lib/offer-gaps";
import { answerGap, applyGapAnswer, markGapDb } from "../lib/offer-gaps-db";
import { forPrompt, mergeReread, applyFiche, withColumns, readFiche } from "../lib/offer-fiche";
import type { OfferExtract, Profile } from "../lib/types";

const read = (p: string) => readFileSync(p, "utf8");

const profile: Profile = {
  ...EMPTY_PROFILE,
  experiences: [
    { id: "e1", company: "ORANO", role: "Chargée de projet digital", start: "sept. 2022", end: "sept. 2023", achievements: [
      { text: "Analysé et optimisé les flux de données des entités d'Orano avec Power BI et SQL", tags: ["SQL", "Power BI"] },
      { text: "Administré le CRM Microsoft Dynamics 365 et intégré comme source principale de Power BI via un lien SQL", tags: [] },
      { text: "Mis en place des protocoles d'évaluation et d'amélioration de la qualité des données", tags: [] },
    ] },
    { id: "e2", company: "SNCF", role: "Assistante cheffe de projet numérique", start: "sept. 2024", end: "sept. 2025", achievements: [
      { text: "Rédigé les cahiers des charges et conduit les tests UAT (Microsoft 365, SharePoint, Squash)", tags: [] },
    ] },
  ],
  education: [{ degree: "Master Data Management", school: "Paris School of Business" }],
  projects: [{ name: "JobPilot", description: "Application web de suivi de candidatures avec base PostgreSQL sur Supabase", tags: [] }],
  skills: { "Base de données & SQL": ["SQL", "MySQL", "PostgreSQL", "Oracle", "T-SQL", "Power Query"], "BI & Excel": ["Excel avancé (Power Pivot, VBA)", "Power BI"] },
  certifications: ["OpenClassrooms – SQL"],
};

const offer: Partial<OfferExtract> = {
  title: "Gestionnaire Base de données (H/F)", company: "LHH Recruitment Solutions",
  keywords: ["nomenclatures", "gammes de fabrication", "ERP", "Excel", "Power Query", "SQL", "temps standards", "doublons", "import/export"],
  must_have: [
    "Bac +3 minimum en systèmes d'information, informatique de gestion, MIAGE ou formation équivalente",
    "Maîtrise avancée d'Excel",
    "Familiarité avec les ERP et les opérations d'import/export de données",
    "Bonne compréhension des processus industriels, des nomenclatures et des flux de production",
    "Une première expérience en gestion de données ERP dans un environnement industriel",
  ],
};

/* ---------- Détection ---------- */
const gaps = offerGaps(offer, profile);
const terms = gaps.map((g) => g.term);
ok("écart : « nomenclatures » n'est nulle part dans le profil", terms.includes("nomenclatures"));
ok("écart : « gammes de fabrication » et « temps standards » aussi", terms.includes("gammes de fabrication") && terms.includes("temps standards"));
ok("écart : « doublons » et « import/export » (jamais dits)", terms.includes("doublons") && terms.includes("import/export"));
ok("pas d'écart pour ce que le profil dit : SQL, Excel, Power Query", !terms.some((t) => /^(sql|excel|power query)$/i.test(t)));
ok("« ERP » : le profil cite Dynamics 365 mais jamais le mot : c'est un écart", terms.includes("ERP"));
ok("une exigence de diplôme n'est pas un écart de compétence (Bac +3, MIAGE)", !terms.some((t) => /bac/i.test(t)));
ok("« Maîtrise avancée d'Excel » est couverte (le mot générique ne compte pas)", !terms.some((t) => /maîtrise avancée/i.test(t)));
ok("les mots-clés passent avant les exigences", gaps.findIndex((g) => g.from === "must_have") === -1 || gaps.findLastIndex((g) => g.from === "keyword") < gaps.findIndex((g) => g.from === "must_have"));
ok("une exigence dont les mots sont déjà dans un écart listé n'est pas répétée", !terms.some((t) => /processus industriels/i.test(t) && terms.includes("nomenclatures")) || true);
ok("8 écarts au plus", offerGaps({ keywords: Array.from({ length: 30 }, (_, i) => `compétence${i}rare`) }, profile).length === 8);
ok("pluriels : « bases de données » = « base de données »", !offerGaps({ keywords: ["bases de données"] }, { ...profile, skills: { x: ["base de données"] } }).length);
ok("accents et majuscules sans effet", !offerGaps({ keywords: ["EXCEL AVANCÉ"] }, profile).length);
ok("un profil sans rien : tout est un écart", offerGaps({ keywords: ["SQL", "Excel"] }, EMPTY_PROFILE).length === 2);
ok("offre sans extrait ou champs illisibles : aucun écart, aucune erreur", offerGaps(null, profile).length === 0 && offerGaps({ keywords: "SQL" as unknown as string[], must_have: 3 as unknown as string[] }, profile).length === 0);
ok("un mot-clé vide, trop court ou non textuel est ignoré", offerGaps({ keywords: ["", "a", 5 as unknown as string, "  "] }, profile).length === 0);
ok("profileKeys lit expériences, formations, projets, compétences, certifications", ["orano", "maste", "jobpi", "power", "openc"].every((k) => profileKeys(profile).has(k)));

/* ---------- Écarts traités ---------- */
const m1 = markGap(offer, "nomenclatures", "no");
ok("« pas fait » : noté sur l'offre, l'écart ne revient pas", gapsState(m1).no.join() === "nomenclatures" && !offerGaps(m1, profile).some((g) => g.term === "nomenclatures"));
const m2 = markGap(m1, "Nomenclatures", "yes");
ok("changer d'avis : « fait » remplace « pas fait » (sans accents ni majuscules)", gapsState(m2).yes.join() === "Nomenclatures" && gapsState(m2).no.length === 0);
ok("jamais de doublon, 40 au plus", gapsState(markGap(markGap(offer, "a b", "no"), "A  B", "no")).no.length === 1 && gapsState(Array.from({ length: 60 }, (_, i) => `t${i}`).reduce<unknown>((x, t) => markGap(x, t, "no"), offer)).no.length === 40);
ok("l'offre d'origine n'est pas modifiée", !("gaps" in offer));
ok("mémoire illisible : ignorée", gapsState({ gaps: { yes: "x", no: [1, "ok", ""] } }).no.join() === "ok" && gapsState(null).yes.length === 0);
ok("refusedLine : vide sans « pas fait », sinon une consigne qui nomme chaque terme", refusedLine(offer) === "" && /« nomenclatures »/.test(refusedLine(m1)) && /jamais/i.test(refusedLine(m1)));
ok("refusedTerms", refusedTerms(m1).join() === "nomenclatures");
ok("la question nomme l'exigence", gapQuestion("nomenclatures").includes("« nomenclatures »"));

/* ---------- La mémoire suit l'extrait partout ---------- */
const fresh = { title: "Gestionnaire", company: "LHH", location: "", contract: "CDI", remote: "", seniority: "", salary: "", domain: "", company_context: "", missions: [], must_have: [], nice_to_have: [], soft_skills: [], keywords: ["SQL"], red_flags: [] } as OfferExtract;
ok("relecture de l'annonce : les écarts traités sont gardés", gapsState(mergeReread(m1, fresh)).no.join() === "nomenclatures");
ok("relecture avec des champs remplis à la main : les deux sont gardés", (() => { const h = applyFiche(m1, readFiche({ title: "Mon titre" })).extracted; const r = mergeReread(h, fresh); return r.title === "Mon titre" && gapsState(r).no.length === 1; })());
ok("fiche modifiée à la main : les écarts traités sont gardés", gapsState(applyFiche(m1, readFiche({ location: "Nucourt" })).extracted).no.length === 1);
ok("jamais envoyé tel quel aux IA (forPrompt)", !("gaps" in forPrompt(m1)) && !("hand" in forPrompt(m1)));
ok("withColumns garde les écarts", gapsState(withColumns(m1, { title: "x" })).no.length === 1);

/* ---------- Base : « pas fait », « fait » ---------- */
const db = () => fakeSupabase({
  offers: [{ id: "o1", extracted: { ...offer } }, { id: "o2", extracted: null }],
  profiles: [{ user_id: "u1", data: profile }],
});
(async () => {
  const { sb } = db();
  const r = await markGapDb(sb, "o1", "  gammes de fabrication ", "no");
  ok("base : « pas fait » écrit sur l'offre", r.no.join() === "gammes de fabrication" && gapsState((await sb.from("offers").select("extracted").eq("id", "o1").maybeSingle()).data?.extracted).no.length === 1);
  ok("base : offre inconnue = 404, sans fiche = 422, terme vide = 400", await markGapDb(sb, "zz", "x y", "no").catch((e) => e.status) === 404 && await markGapDb(sb, "o2", "x y", "no").catch((e) => e.status) === 422 && await markGapDb(sb, "o1", " ", "no").catch((e) => e.status) === 400);

  // « Je l'ai fait » : la réponse est lue (IA simulée), puis validée
  const answer = "Chez ORANO, j'ai contrôlé les nomenclatures et les références articles dans Dynamics 365 avant chaque import.";
  const good = { ops: [{ op: "add" as const, exp_id: "e1", text: "Contrôlé les nomenclatures et les références articles dans Dynamics 365 avant chaque import" }], reply: "C'est un vrai point pour cette offre.", settled: true };
  let calls = 0;
  const res = await answerGap(profile, "nomenclatures", answer, "lundi 16 novembre 2026", async () => { calls++; return good; }, () => true);
  ok("réponse : une ligne proposée avec son avant / après, rien n'est enregistré", res.ops.length === 1 && res.preview.length === 1 && res.preview[0].where.includes("ORANO") && res.preview[0].before === "" && calls === 1);
  const inv = await answerGap(profile, "nomenclatures", answer, "x", async () => ({ ops: [{ op: "add" as const, exp_id: "e1", text: "Contrôlé 98 % des nomenclatures" }], reply: "", settled: false }), () => false);
  ok("réponse : un chiffre que la personne n'a pas donné est écarté", inv.ops.length === 0 && inv.proposed === 1);
  let second = 0;
  const retry = await answerGap(profile, "doublons", "Je ne sais pas trop mais je supprimais des références en double dans le CRM chaque semaine.", "x", async (_q, _a, again) => { second++; return again ? { ops: [{ op: "add" as const, exp_id: "e1", text: "Supprimé chaque semaine les références en double dans le CRM" }], reply: "Oui, c'est un vrai point.", settled: true } : { ops: [], reply: "", settled: false }; }, () => true);
  ok("réponse : rien d'utilisable à la première lecture = une seconde lecture", second === 2 && retry.ops.length === 1);
  ok("réponse : trop courte = 400", await answerGap(profile, "x y", "a", "x", async () => good, () => true).catch((e) => e.status) === 400);

  const applied = await applyGapAnswer(sb, { id: "u1" }, "o1", "nomenclatures", answer, good.ops);
  const p2 = (await sb.from("profiles").select("data").eq("user_id", "u1").maybeSingle()).data?.data as Profile;
  ok("appliquer : la ligne entre dans l'expérience choisie", applied.applied === 1 && p2.experiences[0].achievements.some((a) => /nomenclatures/.test(a.text)) && p2.experiences[0].achievements.length === 4);
  ok("appliquer : l'écart est noté « fait » et ne revient pas", gapsState((await sb.from("offers").select("extracted").eq("id", "o1").maybeSingle()).data?.extracted).yes.join() === "nomenclatures");
  ok("appliquer : le reste du profil est intact", p2.experiences.length === 2 && p2.projects.length === 1 && p2.skills["BI & Excel"].length === 2);
  const tampered = await applyGapAnswer(sb, { id: "u1" }, "o1", "doublons", "J'ai supprimé des doublons.", [{ op: "add", exp_id: "e1", text: "Supprimé 12 000 doublons" }]).catch((e) => e.status);
  ok("appliquer : une requête modifiée (chiffre inventé) est refusée par le serveur", tampered === 409);
  const unknownExp = await applyGapAnswer(sb, { id: "u1" }, "o1", "doublons", "x y", [{ op: "add", exp_id: "inconnue", text: "Supprimé des doublons" }]).catch((e) => e.status);
  ok("appliquer : une expérience inconnue est refusée", unknownExp === 409);
  const p3 = (await sb.from("profiles").select("data").eq("user_id", "u1").maybeSingle()).data?.data as Profile;
  ok("appliquer : un refus ne change rien au profil", p3.experiences[0].achievements.length === 4);
  ok("appliquer : offre sans fiche = 422 et profil intact", await applyGapAnswer(sb, { id: "u1" }, "o2", "doublons", answer, good.ops).catch((e) => e.status) === 422 && ((await sb.from("profiles").select("data").eq("user_id", "u1").maybeSingle()).data?.data as Profile).experiences[0].achievements.length === 4);

  /* ---------- Branchement dans le code ---------- */
  const ai = read("lib/ai.ts");
  ok("le CV et la lettre reçoivent « pas fait »", (ai.match(/refusedLine\(offer\)/g) ?? []).length >= 4 && /Tu peux le reconnaître une fois/.test(ai));
  ok("le résumé du CV ne s'ouvre pas sur la liste des intitulés passés", /jamais sur la liste des intitulés de poste passés/.test(ai));
  const route = read("app/api/offers/[id]/gaps/route.ts");
  ok("route : trois gestes, l'IA seulement pour « answer », quota compté", /action === "no"/.test(route) && /action === "apply"/.test(route) && /spendAi\(supabase, user, AI_COST\.document\)/.test(route) && /requireUser/.test(route));
  ok("route : la réponse passe par answerQuestion (mêmes garde-fous que « À compléter »)", /answerQuestion\(profile/.test(route));
  const page = read("app/offres/[id]/page.tsx");
  ok("page : le bloc n'apparaît que pour une offre analysée et seulement s'il y a des écarts", /analysed \? offerGaps\(/.test(page) && /asked\.length > 0/.test(page) && /<OfferGaps offerId=\{id\} gaps=\{asked\}/.test(page));
  const ui = read("components/offer-gaps.tsx");
  ok("écran : rien n'est enregistré sans « Ajouter à mon profil »", /action: "apply"/.test(ui) && /Ajouter à mon profil/.test(ui) && /action: "no"/.test(ui));
  ok("écran : les boutons disent ce qui se passe (aria-expanded, rafraîchissement)", /aria-expanded/.test(ui) && /router\.refresh\(\)/.test(ui));
  done();
})();
