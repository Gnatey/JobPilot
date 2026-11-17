// Diagnostic du CV MAÎTRE (case cochée au dépôt, 17 novembre 2026) : pas de note, pas de « prêt à envoyer », pas de conseil de raccourcir ou de choisir un métier.
// Fetch scripté, aucune vraie IA : on vérifie ce que l'IA reçoit, ce que le code en fait, l'état de la ligne et le câblage des écrans.
import { readFileSync } from "node:fs";
import { ok, done } from "./helpers";

const env = process.env as Record<string, string | undefined>;
const calls: { body: Record<string, unknown>; raw: string }[] = [];
let next: unknown = {};
(globalThis as unknown as { fetch: unknown }).fetch = async (_url: string, init: { body: string }) => {
  calls.push({ body: JSON.parse(init.body), raw: init.body });
  const body = { choices: [{ message: { content: JSON.stringify(next) }, finish_reason: "stop" }] };
  return { ok: true, status: 200, headers: { get: () => null }, json: async () => body, text: async () => JSON.stringify(body) };
};
env.GROQ_API_KEY = "q"; delete env.GEMINI_API_KEY; delete env.MISTRAL_API_KEY; delete env.ANTHROPIC_API_KEY; delete env.AI_PROVIDER;
env.AI_MAIN_CHAIN = "groq"; env.GROQ_API_BASE = "http://groq.test/openai/v1";

const { diagState } = await import("../lib/diagnostic-state");
const { profileCounts } = await import("../lib/master-summary");
const { diagnoseMasterCv, diagnoseCv } = await import("../lib/ai");
const { EMPTY_PROFILE } = await import("../lib/empty-profile");
const src = (p: string) => readFileSync(p, "utf8");

// ---------- 1. État de la ligne « diagnostics » ----------
const now = Date.parse("2026-11-17T10:00:00Z");
const long = "x".repeat(300);
const fresh = "2026-11-17T09:58:00Z";
const old = "2026-11-17T09:00:00Z";

const masterDone = { master: true, overall_score: null, verdict: "ok", strengths: [], issues: [], inconsistencies: [], missing_metrics: [], positioning: { recommended_targets: [], comment: "" }, ats: { ok: [], problems: [] }, search_strategy: "", actions: [] };
let s = diagState(masterDone, fresh, now);
ok("CV maître terminé (sans note, sans « status ») = terminé", s.state === "done" && s.diagnostic.master === true);

s = diagState({ status: "pending", started_at: fresh, text: long, master: true }, fresh, now);
ok("CV maître en cours (master + status) n'est PAS terminé", s.state === "pending" && s.master === true);

s = diagState({ status: "pending", started_at: old, text: long, master: true }, old, now);
ok("CV maître en cours depuis trop longtemps = interrompu, reste « maître » et relançable", s.state === "error" && s.master === true && s.canRetry);

s = diagState({ status: "error", error: "IA saturée", text: long, master: true }, fresh, now);
ok("CV maître échoué (master + status error) n'est PAS terminé", s.state === "error" && s.master === true && s.canRetry && s.message === "IA saturée");

s = diagState({ overall_score: 72, verdict: "v" }, fresh, now);
ok("diagnostic ordinaire noté : terminé, pas « maître »", s.state === "done" && (s.diagnostic as { master?: boolean }).master !== true);

s = diagState({ overall_score: 0, verdict: "v" }, fresh, now);
ok("une note de 0 reste un diagnostic terminé", s.state === "done");

s = diagState({ status: "pending", started_at: fresh, text: long }, fresh, now);
ok("analyse ordinaire en cours : pas « maître »", s.state === "pending" && s.master === false);

s = diagState({ status: "error", error: "x", text: long }, fresh, now);
ok("analyse ordinaire échouée : pas « maître »", s.state === "error" && s.master === false);

s = diagState({}, fresh, now);
ok("ligne vide = illisible, pas terminée", s.state === "error" && !s.canRetry);
s = diagState(null, fresh, now);
ok("contenu absent = illisible, pas terminé", s.state === "error");
s = diagState({ master: false, status: "pending", started_at: fresh }, fresh, now);
ok("« master: false » n'est pas un CV maître", s.state === "pending" && s.master === false);

// ---------- 2. Ce que l'app a lu, compté en code ----------
const profile = {
  ...EMPTY_PROFILE,
  experiences: [
    { id: "a", company: "ORANO", role: "Data", start: "2025", end: "2026", achievements: [{ id: "1", text: "x" }, { id: "2", text: "y" }] },
    { id: "b", company: "SNCF", role: "BI", start: "2024", end: "2025", achievements: [{ id: "3", text: "z" }] },
    { id: "c", company: "Vide", role: "Stage", start: "2023", end: "2023", achievements: [] },
  ],
  education: [{ degree: "Master", school: "Univ" }, { degree: "DUT", school: "IUT" }],
  projects: [{ name: "P", description: "d" }],
  skills: { Outils: ["SQL", "Power BI"], Langages: ["Python"] },
  certifications: [{ name: "c" }],
  languages: [{ name: "Français", level: "maternel" }, { name: "Anglais", level: "B1" }],
} as unknown as Parameters<typeof profileCounts>[0];
const n = profileCounts(profile);
ok("comptes : expériences, réalisations, formations", n.experiences === 3 && n.achievements === 3 && n.education === 2, JSON.stringify(n));
ok("comptes : projets, compétences (toutes catégories), certifications, langues", n.projects === 1 && n.skills === 3 && n.certifications === 1 && n.languages === 2, JSON.stringify(n));
const e = profileCounts(EMPTY_PROFILE);
ok("profil vide : tout à zéro", Object.values(e).every((v) => v === 0), JSON.stringify(e));
ok("compétences absentes : zéro, pas d'erreur", profileCounts({ ...EMPTY_PROFILE, skills: undefined as unknown as Record<string, string[]> }).skills === 0);

// ---------- 3. diagnoseMasterCv : ce que l'IA reçoit et ce que le code en garde ----------
const prompt = (c: { body: Record<string, unknown> }) => JSON.stringify(c.body);
const sysOf = (c: { body: Record<string, unknown> }) => String(((c.body.messages as { role: string; content: string }[]) ?? []).find((m) => m.role === "system")?.content ?? "");
const cvText = "CV MAITRE " + long;

calls.length = 0;
next = { verdict: "Je lis 3 expériences.", strengths: ["Outils nommés"], issues: [{ issue: "SNCF : dates", severity: "important", fix: "Quand as-tu commencé ?" }], inconsistencies: [], missing_metrics: ["Combien de tickets ?"], overall_score: 91, positioning: { recommended_targets: [{ title: "Data", why: "x" }], comment: "choisis un seul métier" }, actions: [{ action: "Raccourcis", why: "x", priority: "haute" }] };
const d = await diagnoseMasterCv(cvText, null, null, "fr");
ok("le code met overall_score à null (jamais une note de l'IA)", d.overall_score === null);
ok("le code met master à true", d.master === true);
ok("le verdict, les points forts, les précisions et les chiffres de l'IA sont gardés", d.verdict === "Je lis 3 expériences." && d.strengths.length === 1 && d.issues.length === 1 && d.issues[0].severity === "important" && d.missing_metrics.length === 1);
ok("positionnement, ATS, stratégie et actions restent vides même si l'IA en renvoie", d.positioning.recommended_targets.length === 0 && d.positioning.comment === "" && d.ats.ok.length === 0 && d.ats.problems.length === 0 && d.search_strategy === "" && d.actions.length === 0);
ok("sans profil précédent, pas de « changes_since_last »", d.changes_since_last === undefined);
ok("un seul appel d'IA", calls.length === 1, String(calls.length));

const sys = sysOf(calls[0]);
ok("la consigne parle du CV MAÎTRE, pas d'un CV à envoyer", /CV MAÎTRE/.test(sys) && /PAS un CV à envoyer/.test(sys));
ok("la consigne interdit de juger longueur, mise en page, ATS, positionnement, « prêt à envoyer »", /Tu ne juges JAMAIS/.test(sys) && /la longueur/.test(sys) && /ATS/.test(sys) && /le positionnement/.test(sys) && /prêt à envoyer/.test(sys));
ok("la consigne interdit de conseiller de raccourcir ou de choisir une casquette", /ne conseilles jamais de choisir une seule casquette/.test(sys) && /raccourcir/.test(sys));
ok("la consigne ne demande aucune note (pas de barème « 85+ »)", !/overall_score\s*:\s*85/.test(sys) && !/85\+/.test(sys) && !/<\s*60/.test(sys));
ok("la consigne n'invente pas de chiffre (« [chiffre] »)", /\[chiffre\]/.test(sys));
ok("la consigne donne la date du jour (pas de fausses dates « futures »)", /17 novembre 2026|2026/.test(sys) && /PASSÉE/.test(sys));
ok("le schéma envoyé ne demande pas de note, de positionnement, d'ATS ni d'actions", !/"overall_score"/.test(prompt(calls[0])) && !/"positioning"/.test(prompt(calls[0])) && !/"ats"/.test(prompt(calls[0])) && !/"search_strategy"/.test(prompt(calls[0])) && !/"actions"/.test(prompt(calls[0])));
ok("le CV est envoyé tel quel, étiqueté « CV MAÎTRE »", prompt(calls[0]).includes("CV MAITRE") && prompt(calls[0]).includes("CV MAÎTRE"));

// Profil connu : comparaison demandée, mémoire des questions réglées transmise
calls.length = 0;
next = { verdict: "v", strengths: [], issues: [], inconsistencies: [], missing_metrics: [], changes_since_last: ["Nouvelle expérience : SNCF"] };
const known = { ...profile, settled: [{ q: "Période des 200 tickets ?", a: "sur 2025" }] } as unknown as Parameters<typeof diagnoseMasterCv>[2];
const d2 = await diagnoseMasterCv(cvText, null, known, "fr");
ok("profil connu : « changes_since_last » est gardé", d2.changes_since_last?.[0] === "Nouvelle expérience : SNCF");
ok("profil connu : la consigne demande la comparaison et ne rouvre pas ce qui est réglé", /changes_since_last/.test(sysOf(calls[0])) && /DÉJÀ TRANCHÉ PAR LA PERSONNE/.test(sysOf(calls[0])) && /DÉJÀ TRANCHÉ PAR LA PERSONNE/.test(prompt(calls[0])));
ok("profil connu : le profil actuel est envoyé", /PROFIL ACTUEL/.test(prompt(calls[0])) && prompt(calls[0]).includes("ORANO"));

// Réponse bancale : jamais d'erreur, des listes vides
calls.length = 0;
next = { verdict: "v", strengths: "oups", issues: "non", inconsistencies: {}, missing_metrics: 3 };
const d3 = await diagnoseMasterCv(cvText, null, null, "fr");
ok("réponse bancale (mauvais types) : listes vides, pas d'erreur", d3.verdict === "v" && d3.strengths.length === 0 && d3.issues.length === 0 && d3.inconsistencies.length === 0 && d3.missing_metrics.length === 0 && d3.master === true && d3.overall_score === null);

// Une réponse sans verdict est refusée par la chaîne d'IA (« réponse incomplète ») : l'analyse échoue et se relance, elle ne s'enregistre jamais vide
calls.length = 0;
next = { strengths: [], issues: [], inconsistencies: [], missing_metrics: [] };
let missing = "";
try { await diagnoseMasterCv(cvText, null, null, "fr"); } catch (err) { missing = (err as Error).message; }
ok("réponse sans verdict : erreur (jamais un diagnostic vide enregistré)", /verdict/.test(missing), missing);

// Langue demandée : la consigne l'ajoute
calls.length = 0;
next = { verdict: "v", strengths: [], issues: [], inconsistencies: [], missing_metrics: [] };
await diagnoseMasterCv(cvText, null, null, "en");
const sysEn = sysOf(calls[0]);
calls.length = 0;
await diagnoseMasterCv(cvText, null, null, "fr");
ok("la langue de l'écran change la consigne (anglais ≠ français)", sysEn !== sysOf(calls[0]) && sysEn.length > sysOf(calls[0]).length);

// Le diagnostic ordinaire, lui, garde son barème (rien n'a changé pour ceux qui ne cochent pas la case)
calls.length = 0;
next = { overall_score: 70, verdict: "v", positioning: { recommended_targets: [], comment: "" }, strengths: [], issues: [], inconsistencies: [], missing_metrics: [], ats: { ok: [], problems: [] }, search_strategy: "", actions: [] };
const o = await diagnoseCv(cvText, null, null, "fr");
ok("diagnostic ordinaire inchangé : une note, pas de « maître »", o.overall_score === 70 && o.master !== true && /overall_score : 85\+ = prêt à envoyer/.test(sysOf(calls[0])));

// ---------- 4. Câblage ----------
const job = src("lib/cv-job.ts");
ok("cv-job : appelle diagnoseMasterCv quand `master`, diagnoseCv sinon", /master \? diagnoseMasterCv\(text, answers, empty \? null : current, lang\) : diagnoseCv\(text, answers, empty \? null : current, lang\)/.test(job));
ok("cv-job : une analyse échouée garde `master` (la relance reste celle d'un CV maître)", /\.\.\.\(master \? \{ master: true \} : \{\}\)/.test(job));
const diag = src("app/api/cv/diagnose/route.ts");
ok("route diagnose : lit la case et la range dans la ligne en cours", /form\.get\("master"\) === "1"/.test(diag) && /status: "pending", started_at: startedAt, text, \.\.\.\(master \? \{ master: true \} : \{\}\)/.test(diag) && /runCvAnalysis\(supabase, \{[^}]*master \}\)/.test(diag));
const retry = src("app/api/cv/retry/route.ts");
ok("route retry : relit `master` dans la ligne, le garde et le transmet", /content as \{ master\?: boolean \}\)\.master === true/.test(retry) && /text, \.\.\.\(master \? \{ master: true \} : \{\}\)/.test(retry) && /lang, master \}/.test(retry));
const up = src("components/cv-upload.tsx");
ok("dépôt : la case envoie `master` = 1 seulement quand elle est cochée", /if \(master\) fd\.set\("master", "1"\)/.test(up) && /type="checkbox"/.test(up) && /C'est mon CV maître/.test(up));
const page = src("app/diagnostic/[id]/page.tsx");
const masterBranch = page.slice(page.indexOf("if (c.master)"), page.indexOf("<Gauge"));
ok("page du diagnostic : la branche « maître » est avant la jauge et n'affiche aucune note", page.indexOf("if (c.master)") > 0 && masterBranch.length > 200 && !/<Gauge|overall_score|ScorePill/.test(masterBranch));
ok("page du diagnostic : la branche « maître » ne parle ni de « prêt à envoyer » ni de positionnement", !/prêt à envoyer|recommended_targets|search_strategy|\.ats\b/.test(masterBranch));
const mon = src("app/mon-cv/page.tsx");
ok("Mon CV : la note n'est pas lue pour un CV maître (pas de « null → 80 »)", /typeof d\.st\.diagnostic\.overall_score === "number"/.test(mon) && /d\.st\.diagnostic\.master \? <span className="tag">/.test(mon));
const types = src("lib/types.ts");
ok("types : `overall_score` peut être null et `master` existe", /overall_score: number \| null/.test(types) && /master\?: boolean/.test(types));

done();
