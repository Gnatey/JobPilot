import { addDays, dateOf, today as todayOf } from "./format";
import { canonicalStatus } from "./types";

/**
 * Relances : seulement APRÈS un entretien ou une épreuve (Entretien, Test / Cas).
 * Une candidature « Postulée » sans réponse n'est jamais relancée par JobPilot : le silence se voit dans « sans nouvelles depuis trois semaines »
 * (Suivi), mais aucun rappel ni brouillon de relance ne tombe tant qu'aucun entretien n'a eu lieu.
 *
 * Parcours : À postuler → Postulé → Entretien → Test / Cas → Relancé → Offre (ou Refusé / Abandonné / Offre plus disponible à tout moment).
 * « Relancé » se choisit à la main une fois la relance envoyée : JobPilot ne la pose jamais seul et ne reproposera pas de relance
 * pour une ligne « Relancé » (elle est faite). La règle ne change pas : une relance n'est proposée qu'après un entretien ou une épreuve.
 */

/** Jours sans nouvelles après l'entretien (ou l'épreuve) avant de proposer la relance. */
export const FOLLOWUP_AFTER_DAYS = 5;
/** Après un brouillon de relance : jours avant de proposer la suivante. */
export const FOLLOWUP_REPEAT_DAYS = 7;

/** Étapes où une relance a un sens : l'entretien ou l'épreuve a eu (ou aura eu) lieu. */
export const FOLLOWUP_STATUSES = ["entretien", "test"] as const;

type Fa = { status: string; interview_at?: string | null; next_action_at?: string | null; last_email_at?: string | null };

export const isFollowupStatus = (status: string) => (FOLLOWUP_STATUSES as readonly string[]).includes(canonicalStatus(status));

/**
 * Jour (AAAA-MM-JJ) à partir duquel la relance est proposée, ou null (pas d'entretien daté, ou statut sans relance).
 * Par défaut : l'entretien + 5 jours. Une date « Relance le » saisie à la main (ou laissée par le dernier brouillon) la remplace
 * quand elle tombe APRÈS le jour de l'entretien ; une date antérieure est un reste d'avant l'entretien et n'est pas prise en compte.
 */
export function followupOn(a: Fa): string | null {
  if (!isFollowupStatus(a.status) || !a.interview_at) return null;
  const day = dateOf(a.interview_at);
  const manual = a.next_action_at?.slice(0, 10);
  return manual && manual > day ? manual : addDays(FOLLOWUP_AFTER_DAYS, day);
}

/** Vrai quand la date de relance vient d'être choisie à la main (ou par un brouillon précédent), pas déduite de l'entretien. */
const chosen = (a: Fa) => {
  if (!a.interview_at || !a.next_action_at) return false;
  return a.next_action_at.slice(0, 10) > dateOf(a.interview_at);
};

/**
 * La relance est à faire : l'entretien est passé depuis assez longtemps et l'entreprise n'a pas écrit depuis
 * (un email reçu après l'entretien veut dire qu'elle a répondu, sauf si tu as toi-même fixé la date).
 */
export function followupDue(a: Fa, t: string = todayOf()): boolean {
  const on = followupOn(a);
  if (!on || on > t) return false;
  if (!chosen(a) && a.last_email_at && dateOf(a.last_email_at) > dateOf(a.interview_at!)) return false;
  return true;
}

/** Le brouillon de relance peut se rédiger : l'entretien (ou l'épreuve) a eu lieu, ou sa date n'est pas connue. */
export function canDraftFollowup(a: Fa, t: string = todayOf()): boolean {
  if (!isFollowupStatus(a.status)) return false;
  return !a.interview_at || dateOf(a.interview_at) <= t;
}

/** Entretien ou épreuve encore à venir (aujourd'hui compris), ou sans date : à préparer. Un entretien passé attend une réponse, il n'est plus « à préparer ». */
export const isUpcoming = (a: Fa, t: string = todayOf()) => isFollowupStatus(a.status) && (!a.interview_at || dateOf(a.interview_at) >= t);

/** Entretien ou épreuve passé : la candidature attend la réponse de l'entreprise. */
export const isAwaitingAnswer = (a: Fa, t: string = todayOf()) => isFollowupStatus(a.status) && !!a.interview_at && dateOf(a.interview_at) < t;

/** Date de la prochaine relance après un brouillon, pour ne pas relancer chaque jour. */
export const nextFollowupAfterDraft = (t: string = todayOf()) => addDays(FOLLOWUP_REPEAT_DAYS, t);
