import { norm } from "./offers-filter";
import type { Profile } from "./types";

/**
 * Garde-fou du RÉSUMÉ du CV (11 novembre, retour de Juliana : « j'ai bien fait du NLP, LLM, machine learning, supervisé et non supervisé, mais juste à l'école »).
 * Le résumé disait « expertise Python, SQL et machine learning… maîtrise… du traitement du langage naturel » : des compétences VRAIES, mais acquises en formation,
 * présentées comme une expertise de métier (facile à démonter en entretien). Le garde-fou des chiffres (lib/cv-guard.ts) ne lit pas ces mots-là.
 *
 * Logique pure (testée par tests/summary-guard.test.ts). Une compétence de la liste `FIELDS` écrite dans le résumé est :
 * - « ok » si une EXPÉRIENCE du profil la cite (réalisation, étiquette, poste, secteur) ;
 * - « school » si elle ne figure qu'en formation, en projet, en compétences ou en certification : le résumé ne doit pas la présenter comme un acquis de métier ;
 * - « absent » si le profil ne la dit nulle part.
 * Rien n'est retiré du texte (couper une phrase la casserait) : c'est une note dans `notes_for_candidate`, et une ligne « À relire » dans « Contrôler mes CV ».
 * Limite : la liste est courte et fixe (apprentissage automatique, langage naturel, grands modèles de langage, réseaux de neurones, IA) ; une autre compétence de formation passe.
 */
type Field = { label: string; re: RegExp };
const W = (s: string) => new RegExp(`(?<![a-z0-9])(?:${s})(?![a-z0-9])`);
export const FIELDS: Field[] = [
  { label: "machine learning", re: W("machine learning|apprentissage (?:automatique|supervise|non supervise|statistique)|supervised|unsupervised|scikit-?learn") },
  { label: "traitement du langage naturel (NLP)", re: W("nlp|tal|traitement (?:automatique )?du langage(?: naturel)?|langage naturel|text mining|fouille de textes?") },
  { label: "LLM", re: W("llms?|grands? modeles? de langage|large language models?|ia generative|genai|rag") },
  { label: "deep learning", re: W("deep learning|apprentissage profond|reseaux? de neurones|tensorflow|pytorch|keras") },
  { label: "intelligence artificielle", re: W("intelligence artificielle") },
];

export type SummaryReport = {
  /** Dans le résumé, absentes de toute expérience, présentes ailleurs dans le profil (formation, projet, compétences). */
  school: string[];
  /** Dans le résumé, absentes du profil. */
  absent: string[];
};

/** Texte des expériences (ce que la personne a fait en poste) et texte du reste du profil (ce qu'elle a appris ou construit hors poste). */
function profileParts(profile: Profile): { work: string; other: string } {
  const work = (profile.experiences ?? [])
    .map((e) => [e.role, e.sector, ...(e.achievements ?? []).flatMap((a) => [a?.text, ...(a?.tags ?? [])])].filter(Boolean).join(" "))
    .join(" ");
  const skills = Object.entries(profile.skills ?? {}).flatMap(([k, v]) => [k, ...(Array.isArray(v) ? v : [])]);
  const edu = (profile.education ?? []).flatMap((d) => [d?.degree, d?.school, ...(d?.details ?? [])]);
  const proj = (profile.projects ?? []).flatMap((p) => [p?.name, p?.description, ...(p?.tags ?? [])]);
  const other = [...skills, ...edu, ...proj, ...(profile.certifications ?? [])].filter(Boolean).join(" ");
  return { work: norm(work), other: norm(other) };
}

export function checkSummary(summary: string | null | undefined, profile: Profile): SummaryReport {
  const text = norm(String(summary ?? ""));
  const report: SummaryReport = { school: [], absent: [] };
  if (!text.trim()) return report;
  const { work, other } = profileParts(profile);
  for (const f of FIELDS) {
    if (!f.re.test(text)) continue;
    if (f.re.test(work)) continue;
    (f.re.test(other) ? report.school : report.absent).push(f.label);
  }
  return report;
}

const list = (l: string[]) => l.map((x) => `« ${x} »`).join(", ");

/** Les phrases à destination de la personne (la note du CV généré). Vide si le résumé n'a rien à signaler. */
export function summaryNotes(r: SummaryReport): string[] {
  const out: string[] = [];
  if (r.school.length) out.push(`Résumé : ${list(r.school)} ne figure${r.school.length > 1 ? "nt" : ""} dans aucune de tes expériences (formation, projet ou compétences seulement). Écrit comme une expertise, ça se démonte vite en entretien : reformule (« formée à… en Master ») ou retire.`);
  if (r.absent.length) out.push(`Résumé : ${list(r.absent)} ne figure${r.absent.length > 1 ? "nt" : ""} pas dans ton profil. À retirer, ou à ajouter au profil si c'est vrai.`);
  return out;
}
