import { numbersIn } from "./profile-fix";
import { profileText } from "./cv-guard";
import type { Profile } from "./types";

/**
 * Garde-fou de la lettre de motivation (sans IA, sans réseau, testé), cousin de `guardCv`.
 *
 * L'IA raconte une réalisation du profil « avec le résultat » : elle ajoute parfois un chiffre que la personne n'a jamais écrit
 * (« 40 % », « trois ans »). Une lettre part sous la signature de la personne : un chiffre qui n'est ni dans son profil ni dans l'annonce est signalé
 * dans « notes_for_candidate » avec la phrase exacte. Rien n'est retiré (une lettre est un texte suivi : couper une phrase la casserait) ;
 * la personne décide, la lettre reste modifiable.
 *
 * Les chiffres de l'annonce comptent comme connus (« 5 ans d'expérience », un code postal, une référence) : la lettre peut les reprendre.
 * Les chiffres du profil sont ceux de ses réalisations, sans identifiants, téléphone, réglages ni tâches (voir `profileText`).
 */

export type LetterGuardReport = { numbers: { sentence: string; numbers: string[] }[] };

/** Phrases d'un paragraphe (coupe après . ! ? …, pas dans « 3,5 » ni « M. Dupont » suivi d'une minuscule). */
const sentencesOf = (p: string): string[] => p.split(/(?<=[.!?…])\s+(?=[A-ZÀ-ÖØ-Þ«"“(\d])/).map((s) => s.trim()).filter(Boolean);

const clip = (s: string, n = 140) => (s.length > n ? `${s.slice(0, n).replace(/\s+\S*$/, "")}…` : s);

/**
 * Signale les chiffres des paragraphes qui ne figurent ni dans le profil ni dans l'annonce.
 * `notes` : les remarques à ajouter (celles déjà écrites par l'IA, `have`, ne sont pas répétées).
 */
export function guardLetter(paragraphs: string[], profile: Profile, offer: unknown, have: string[] = []): { notes: string[]; report: LetterGuardReport } {
  const known = new Set([...numbersIn(profileText(profile)), ...numbersIn(JSON.stringify(offer ?? {}))]);
  const report: LetterGuardReport = { numbers: [] };
  const notes: string[] = [];
  for (const para of paragraphs ?? []) {
    for (const sentence of sentencesOf(para ?? "")) {
      const unknown = [...new Set(numbersIn(sentence))].filter((n) => !known.has(n));
      if (!unknown.length) continue;
      report.numbers.push({ sentence, numbers: unknown });
      const note = `Lettre : ${unknown.length > 1 ? "les chiffres" : "le chiffre"} ${unknown.map((n) => `« ${n} »`).join(", ")} ne figure${unknown.length > 1 ? "nt" : ""} ni dans ton profil ni dans l'annonce (« ${clip(sentence)} »). À vérifier ou à retirer avant d'envoyer.`;
      if (!have.includes(note) && !notes.includes(note)) notes.push(note);
    }
  }
  return { notes, report };
}
