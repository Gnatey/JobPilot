import { profileText } from "./cv-guard";
import { numbersCovered, vetOps, type AnswerRaw, type AnswerResult } from "./profile-fix";
import type { Profile } from "./types";

/**
 * Réponse de l'IA à la préoccupation d'une question « À compléter » (logique pure, testée par tests/answer-reply.test.ts).
 * Même règle que partout : aucun chiffre que l'IA n'a pas lu. Les chiffres connus sont ceux de la question, de la réponse de la personne,
 * de ses réalisations (`profileText` : sans identifiants, téléphone ni réglages) et de la date du jour.
 * Une phrase qui contient un chiffre inconnu est retirée ; le reste de la réponse est gardé.
 */

const REPLY_MAX = 450;

export function vetReply(reply: unknown, known: string): string {
  if (typeof reply !== "string") return "";
  const text = reply.replace(/[*_`#>]+/g, "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  const sentences = text.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g) ?? [text];
  let out = "";
  for (const s of sentences) {
    const sentence = s.trim();
    if (!sentence || !numbersCovered(sentence, known)) continue;
    const next = out ? `${out} ${sentence}` : sentence;
    if (next.length > REPLY_MAX) break;
    out = next;
  }
  return out;
}

/** Sortie brute de l'IA → ce que la route renvoie : réécritures vérifiées, réponse vérifiée, « réglé » seulement s'il y a une réponse à lire. */
export function finishAnswer(profile: Profile, raw: AnswerRaw | null | undefined, question: string, answer: string, dateLine: string): AnswerResult {
  const proposedOps = Array.isArray(raw?.ops) ? raw.ops : [];
  const ops = vetOps(profile, proposedOps, answer);
  const reply = vetReply(raw?.reply, [question, answer, profileText(profile), dateLine].join("\n"));
  return { ops, reply, settled: !!reply && raw?.settled === true, proposed: proposedOps.length };
}
