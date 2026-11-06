// Relances : seulement après un entretien ou une épreuve. Parcours À postuler → Postulé → Entretien → Test / Cas → Relancé → Offre (« Relancé » se choisit à la main).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { FOLLOWUP_AFTER_DAYS, FOLLOWUP_REPEAT_DAYS, canDraftFollowup, followupDue, followupOn, isAwaitingAnswer, isFollowupStatus, isUpcoming, nextFollowupAfterDraft } from "../lib/followup";
import { STATUSES, canonicalStatus, statusLabel, isNeverSent } from "../lib/types";
import { ok, done } from "./helpers";

// Entretien le dimanche 1er novembre 2026 à 10 h (Paris) ; relance conseillée le 6
const IV = "2026-11-01T09:00:00Z";
const iv = (extra: Record<string, unknown> = {}) => ({ status: "entretien", interview_at: IV, next_action_at: null, last_email_at: null, ...extra });

// ---------- Le parcours ----------
ok("parcours : À postuler, Postulé, Entretien, Test / Cas, Relancé, Offre, puis les issues",
  STATUSES.map((s) => s.id).join(",") === "a_postuler,postule,entretien,test,relance,offre,refuse,abandonne,expiree" && STATUSES.find((s) => s.id === "relance")?.label === "Relancé");
ok("« Relancé » est une vraie étape : une ligne « relance » garde sa colonne et son libellé (plus d'alias vers Postulé)", canonicalStatus("relance") === "relance" && statusLabel("relance") === "Relancé" && canonicalStatus("entretien") === "entretien" && canonicalStatus("expire") === "expiree");
ok("« Relancé » ne change pas ce qui compte comme jamais envoyé", !isNeverSent({ status: "relance", applied_at: "2026-10-01" }));

// ---------- Aucune relance sans entretien (le bug signalé) ----------
ok("postulé il y a 3 semaines, relance programmée dans le passé : AUCUNE relance", !followupDue({ status: "postule", next_action_at: "2026-10-15", interview_at: null }, "2026-11-06") && followupOn({ status: "postule", next_action_at: "2026-10-15" }) === null);
ok("ligne « Relancé » (la relance est faite), avec ou sans entretien : JobPilot n'en propose pas une autre", !followupDue({ status: "relance", next_action_at: "2026-10-15" }, "2026-11-06") && !followupDue({ status: "relance", interview_at: IV, next_action_at: "2026-11-02" }, "2026-12-31") && followupOn({ status: "relance", interview_at: IV }) === null);
ok("même avec une date d'entretien posée sur une candidature encore « Postulé » : aucune relance", !followupDue({ status: "postule", interview_at: IV }, "2026-11-30") && followupOn({ status: "postule", interview_at: IV }) === null);
ok("à postuler, offre, refusé, abandonné : jamais de relance", ["a_postuler", "offre", "refuse", "abandonne", "expiree"].every((s) => !followupDue({ status: s, interview_at: IV }, "2026-12-31") && followupOn({ status: s, interview_at: IV }) === null));
ok("seuls Entretien et Test / Cas ouvrent une relance (Relancé = déjà faite)", isFollowupStatus("entretien") && isFollowupStatus("test") && !isFollowupStatus("postule") && !isFollowupStatus("relance") && !isFollowupStatus("offre"));

// ---------- Après un entretien : 5 jours sans nouvelles ----------
ok("délai : 5 jours après l'entretien, 7 jours entre deux relances", FOLLOWUP_AFTER_DAYS === 5 && FOLLOWUP_REPEAT_DAYS === 7);
ok("entretien le 1er : relance conseillée le 6", followupOn(iv()) === "2026-11-06");
ok("pas due le 5 (4 jours après), due le 6 et les jours suivants", !followupDue(iv(), "2026-11-05") && followupDue(iv(), "2026-11-06") && followupDue(iv(), "2026-11-20"));
ok("épreuve (Test / Cas) : même règle", followupOn(iv({ status: "test" })) === "2026-11-06" && followupDue(iv({ status: "test" }), "2026-11-06"));
ok("entretien sans date : pas de relance déduite (la fiche invite à ajouter la date)", followupOn(iv({ interview_at: null })) === null && !followupDue(iv({ interview_at: null }), "2027-01-01"));
ok("le jour se lit à l'heure de Paris (entretien le 1er à 23 h 30 UTC = 2 novembre à Paris)", followupOn(iv({ interview_at: "2026-11-01T23:30:00Z" })) === "2026-11-07");

// ---------- Date choisie à la main, ou laissée par le dernier brouillon ----------
ok("date « Relance le » APRÈS l'entretien : elle remplace le délai", followupOn(iv({ next_action_at: "2026-11-10" })) === "2026-11-10" && !followupDue(iv({ next_action_at: "2026-11-10" }), "2026-11-09") && followupDue(iv({ next_action_at: "2026-11-10" }), "2026-11-10"));
ok("date d'AVANT l'entretien (reste de la candidature) : ignorée", followupOn(iv({ next_action_at: "2026-10-30" })) === "2026-11-06" && followupOn(iv({ next_action_at: "2026-11-01" })) === "2026-11-06");
ok("après un brouillon (aujourd'hui + 7) : la suivante n'est proposée que dans 7 jours", nextFollowupAfterDraft("2026-11-06") === "2026-11-13" && !followupDue(iv({ next_action_at: nextFollowupAfterDraft("2026-11-06") }), "2026-11-12") && followupDue(iv({ next_action_at: nextFollowupAfterDraft("2026-11-06") }), "2026-11-13"));

// ---------- L'entreprise a répondu ----------
ok("email de l'entreprise reçu APRÈS l'entretien : pas de relance automatique", !followupDue(iv({ last_email_at: "2026-11-03T08:00:00Z" }), "2026-11-10"));
ok("email reçu AVANT l'entretien (l'invitation) : la relance reste due", followupDue(iv({ last_email_at: "2026-10-28T08:00:00Z" }), "2026-11-06"));
ok("email le jour même de l'entretien : ne compte pas comme une réponse", followupDue(iv({ last_email_at: "2026-11-01T15:00:00Z" }), "2026-11-06"));
ok("date fixée à la main : elle l'emporte sur l'email reçu", followupDue(iv({ last_email_at: "2026-11-03T08:00:00Z", next_action_at: "2026-11-08" }), "2026-11-08"));

// ---------- Rédiger, préparer ----------
ok("brouillon possible : entretien passé ou sans date, jamais avant l'entretien, jamais pour un simple Postulé",
  canDraftFollowup(iv(), "2026-11-02") && canDraftFollowup(iv({ interview_at: null }), "2026-11-02") && !canDraftFollowup(iv(), "2026-10-30") && !canDraftFollowup({ status: "postule" }, "2026-11-30") && !canDraftFollowup({ status: "relance" }, "2026-11-30"));
ok("entretien à venir (ou aujourd'hui, ou sans date) : à préparer ; passé : on attend la réponse", isUpcoming(iv(), "2026-10-31") && isUpcoming(iv(), "2026-11-01") && isUpcoming(iv({ interview_at: null }), "2026-12-01") && !isUpcoming(iv(), "2026-11-02") && !isUpcoming({ status: "postule", interview_at: IV }, "2026-10-31"));
ok("entretien passé : en attente de réponse", isAwaitingAnswer(iv(), "2026-11-02") && !isAwaitingAnswer(iv(), "2026-11-01") && !isAwaitingAnswer(iv({ interview_at: null }), "2026-11-02") && !isAwaitingAnswer({ status: "postule", interview_at: IV }, "2026-11-02"));

// ---------- Branchement : plus aucune relance hors entretien dans le code ----------
const walk = (dir: string, out: string[] = []): string[] => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(f)) out.push(p);
  }
  return out;
};
const read = (f: string) => readFileSync(f, "utf8");
const files = ["app", "lib", "components"].flatMap((d) => walk(d));
// Une liste [Postulé, Relancé] est légitime pour « envoyée, sans réponse » (sans nouvelles, Pas retenu) ; ce qui est interdit, c'est qu'elle pilote une date de relance
const oldRule = files.filter((f) => read(f).split("\n").some((l) => /\[\s*"postule"\s*,\s*"relance"\s*\]/.test(l) && /next_action_at/.test(l)));
ok("aucune liste [\"postule\", \"relance\"] ne pilote une date de relance : la relance ne dépend plus du statut Postulé", oldRule.length === 0, oldRule.join(" | "));
const scheduled = ["components/app-actions.tsx", "lib/offer-ops.ts", "components/suivi-board.tsx", "lib/sync.ts"].filter((f) => /addDays\(7\)|next_action_at\s*=\s*today\(\)/.test(read(f)));
ok("l'envoi d'une candidature, le glisser-déposer, la fiche et la synchro Gmail ne programment plus de relance", scheduled.length === 0, scheduled.join(" | "));
for (const [f, what] of [
  ["app/page.tsx", "followupDue(a, t)"],
  ["components/nav.tsx", "followupDue(a)"],
  ["components/suivi-board.tsx", "followupDue(a)"],
  ["components/suivi-calendar.tsx", "followupOn(a)"],
  ["app/api/calendar/[token]/route.ts", "followupOn(a)"],
  ["lib/recap.ts", "followupDue(a, t)"],
] as [string, string][]) ok(`${f} : relances par followup.ts`, read(f).includes(what), what);
ok("accueil : un entretien passé n'est plus « à préparer » (il attend une réponse, puis la relance)", read("app/page.tsx").includes("isUpcoming(a, t)") && read("app/page.tsx").includes("upcoming.map"));
ok("le brouillon de relance est refusé hors Entretien / Test, et repousse la suivante de 7 jours", read("app/api/applications/[id]/followup/route.ts").includes("!isFollowupStatus(app.status)") && read("app/api/applications/[id]/followup/route.ts").includes("nextFollowupAfterDraft()"));
ok("le brouillon est écrit pour l'après-entretien (remercier, demander où en est le processus, ne rien inventer)", /APRÈS \$\{test \?/.test(read("lib/ai.ts")) && read("lib/ai.ts").includes("n'invente aucun sujet abordé"));
ok("lecture des candidatures : les anciennes saisies (« expire ») gardent leur colonne", read("lib/applications.ts").includes("canonicalStatus(a.status)"));
ok("statistiques : « Relancé » a sa part dans la répartition, sans réponse après 3 semaines elle compte comme « sans nouvelles »", read("lib/stats.ts").includes("canonicalStatus(a.status)") && read("lib/stats.ts").includes('(a.status === "postule" || a.status === "relance")'));
ok("graphique des statuts : « Relancé » a sa couleur", /relance: "#[0-9a-f]{6}"/i.test(read("components/stats-charts.tsx")));
ok("accueil : le pipeline compte les « Relancées » ; Suivi : colonne « Relancé » en cours, « sans nouvelles » et « Pas retenu » la couvrent, l'annulation rend à chaque ligne son étape",
  read("app/page.tsx").includes('a.status === "relance"') && !/const DONE = \[[^\]]*relance/.test(read("components/suivi-board.tsx"))
  && read("components/suivi-board.tsx").includes('(a.status === "postule" || a.status === "relance")') && read("components/suivi-board.tsx").includes('["postule", "entretien", "test", "relance"].includes(app.status)') && read("components/suivi-board.tsx").includes('idsOf("relance")'));
// « Relancé » se choisit à la main : aucun code ne pose ce statut tout seul
const setsRelance = files.filter((f) => /status\s*[:=]\s*["']relance["']|target\s*=\s*["']relance["']/.test(read(f)));
ok("« Relancé » n'est posé automatiquement par aucune synchro, aucun brouillon ni aucun e-mail (TARGET ne le vise pas)", setsRelance.length === 0 && !/relance/.test((read("lib/email-match.ts").match(/const TARGET[^\n]*/) ?? [""])[0]), setsRelance.join(" | "));
ok("Suivi : passer à Entretien ou Test efface l'ancienne date de relance", /\["refuse", "abandonne", "expiree", "offre", "entretien", "test"\]\.includes\(status\)\) patch\.next_action_at = null/.test(read("components/suivi-board.tsx")));
ok("synchro Gmail : une invitation à un entretien n'ajoute plus de relance du jour", /\["refuse", "offre", "entretien", "test"\]\.includes\(target\)\) patch\.next_action_at = null/.test(read("lib/sync.ts")));

done();
