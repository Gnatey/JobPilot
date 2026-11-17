/**
 * Coller l'annonce entière sur une offre DÉJÀ analysée (17 novembre 2026, paquet 24 ; Juliana : « mieux vaut modifier l'affichage "Modifier la fiche" pour
 * mettre à la place l'affichage où on part pour coller toute l'offre… là au moins on colle toute l'offre »). Logique pure, lisible par l'écran, testée par
 * tests/offer-text.test.ts ; la route est POST /api/offers/:id/reanalyze (`text`).
 *
 * Pourquoi : une offre lue d'après un simple extrait donne une fiche pauvre, donc une analyse pauvre (« Offre non détaillée » en guise d'écart). Corriger
 * 15 champs à la main refait à la main le travail de l'IA ; coller l'annonce entière en règle la cause.
 */
import { cleanExtractedText } from "./clean-text";

/** Même seuil que l'analyse d'une annonce collée (`app/api/offers/analyze`). */
export const MIN_PASTED = 150;
/** Même plafond que le texte gardé sur une offre (`raw_text`). */
export const MAX_PASTED = 30000;
/**
 * En dessous, le texte gardé est probablement un extrait et non l'annonce entière : l'écran le dit. Seuil de jugement (une annonce complète fait en
 * général plusieurs milliers de signes), pas une mesure.
 */
export const SHORT_TEXT = 800;

export type Pasted = { ok: true; text: string } | { ok: false; error: string };

/** Le texte collé, nettoyé (caractères de contrôle, ligatures, NUL que PostgreSQL refuse), ou la raison pour laquelle il ne sert pas. */
export function readPastedText(v: unknown): Pasted {
  if (typeof v !== "string" || !v.trim()) return { ok: false, error: "Colle le texte de l'annonce." };
  const text = cleanExtractedText(v).trim().slice(0, MAX_PASTED);
  if (text.length < MIN_PASTED) return { ok: false, error: `Le texte est trop court (${text.length} signes sur ${MIN_PASTED} au moins) : colle l'annonce complète.` };
  return { ok: true, text };
}

/** La phrase d'aide sous la zone de texte, d'après sa longueur. Vide quand le texte paraît complet. */
export function textHint(n: number): string {
  if (n < MIN_PASTED) return `Trop court pour analyser (${MIN_PASTED} signes au moins).`;
  if (n < SHORT_TEXT) return `Texte court (${n} signes) : l'analyse part de peu. Colle l'annonce entière si tu l'as.`;
  return "";
}
