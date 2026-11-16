/**
 * Écarts avec l'offre, côté base (testé avec la fausse base de tests/fake-supabase.ts). Aucun appel d'IA ici : la lecture de la réponse
 * de la personne est faite par la route (`answerGap`, avec le quota), l'écriture par `applyGapAnswer` et `markGapDb`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { HttpError } from "./supabase/server";
import { getProfile } from "./profile";
import { applyOps, previewOps, vetOps, type AnswerOp, type AnswerRaw, type AnswerResult } from "./profile-fix";
import { finishAnswer } from "./answer-reply";
import { gapQuestion, markGap, type GapKind } from "./offer-gaps";
import type { Profile } from "./types";

const cleanTerm = (v: unknown): string => {
  const t = typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
  if (t.length < 2) throw new HttpError(400, "Écart manquant.");
  return t.slice(0, 90);
};

/** Note un écart comme traité sur l'offre (« yes » : une ligne a été ajoutée au profil ; « no » : pas fait). */
export async function markGapDb(supabase: SupabaseClient, offerId: string, term: unknown, kind: GapKind): Promise<{ yes: string[]; no: string[] }> {
  const t = cleanTerm(term);
  const { data: offer } = await supabase.from("offers").select("id, extracted").eq("id", offerId).maybeSingle();
  if (!offer) throw new HttpError(404, "Offre introuvable");
  if (!offer.extracted) throw new HttpError(422, "Cette offre n'a pas encore de fiche : lance d'abord l'analyse.");
  const extracted = markGap(offer.extracted, t, kind);
  const { error } = await supabase.from("offers").update({ extracted }).eq("id", offerId);
  if (error) throw error;
  return { yes: extracted.gaps?.yes ?? [], no: extracted.gaps?.no ?? [] };
}

export type GapAnswer = AnswerResult & { preview: { where: string; before: string; after: string }[] };

/**
 * Lit la réponse de la personne à un écart : même lecture et mêmes garde-fous que « À compléter » (aucun chiffre que l'IA n'a pas lu).
 * `ask` est l'appel d'IA (injecté pour les tests). Rien n'est enregistré : la personne valide l'avant / après.
 */
export async function answerGap(
  profile: Profile, term: unknown, answer: unknown, today: string,
  ask: (question: string, answer: string, retry?: boolean) => Promise<AnswerRaw>,
  worth: (answer: string) => boolean,
): Promise<GapAnswer> {
  const t = cleanTerm(term);
  const a = typeof answer === "string" ? answer.trim().slice(0, 1500) : "";
  if (a.length < 2) throw new HttpError(400, "Écris ta réponse d'abord.");
  const question = gapQuestion(t);
  let result = finishAnswer(profile, await ask(question, a), question, a, today);
  // Réponse riche mais rien d'utilisable (le modèle s'arrête parfois à un « je ne sais pas » en début de phrase) : une seconde lecture
  if (!result.ops.length && !result.reply && worth(a)) result = finishAnswer(profile, await ask(question, a, true), question, a, today);
  return { ...result, preview: previewOps(profile, result.ops) };
}

/**
 * Enregistre dans le profil les lignes que la personne a validées. Les opérations sont revérifiées sur le profil d'AUJOURD'HUI
 * (il a pu bouger, et une requête peut être modifiée) : chiffres couverts par sa réponse, expérience ou projet existant.
 * Puis l'écart est noté « fait » sur l'offre : il ne revient pas.
 */
export async function applyGapAnswer(
  supabase: SupabaseClient, user: { id: string; email?: string | null }, offerId: string, term: unknown, answer: unknown, ops: unknown,
): Promise<{ applied: number }> {
  const t = cleanTerm(term);
  const a = typeof answer === "string" ? answer.trim().slice(0, 1500) : "";
  const proposed = Array.isArray(ops) ? (ops as AnswerOp[]).slice(0, 5) : [];
  const { data: offer } = await supabase.from("offers").select("id, extracted").eq("id", offerId).maybeSingle();
  if (!offer) throw new HttpError(404, "Offre introuvable");
  if (!offer.extracted) throw new HttpError(422, "Cette offre n'a pas encore de fiche : lance d'abord l'analyse."); // avant d'écrire quoi que ce soit dans le profil
  const profile = await getProfile(supabase, user);
  const vetted = vetOps(profile, proposed, a);
  if (!vetted.length) throw new HttpError(409, "Ce changement ne s'applique plus : ton profil a bougé entre-temps. Renvoie ta réponse.");
  const { error } = await supabase.from("profiles").upsert({ user_id: user.id, data: applyOps(profile, vetted), updated_at: new Date().toISOString() });
  if (error) throw error;
  await markGapDb(supabase, offerId, t, "yes");
  return { applied: vetted.length };
}
