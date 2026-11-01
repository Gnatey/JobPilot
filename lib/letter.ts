import type { LetterDoc, Profile } from "./types";
import { contactItems, linkItems, type Item } from "./cv-format";

/* Lettre de motivation : modèles disponibles, découpage d'une lettre en parties, mise en forme commune. Aucune dépendance à React. */

export const LETTER_TEMPLATES = [
  { id: "classique", label: "Classique", for: "Banque, assurance, secteur public, grands groupes : lettre à la française, en serif" },
  { id: "moderne", label: "Moderne", for: "Startups, tech, marketing, médias : en-tête net, trait de couleur" },
  { id: "elegant", label: "Élégant", for: "Luxe, mode, culture, communication, cabinets : nom centré, filets dorés" },
  { id: "bandeau", label: "Bandeau couleur", for: "E-commerce, design, médias : en-tête coloré, même allure que le CV Bandeau" },
  { id: "sobre", label: "Sobre", for: "ESN, conseil, grosses plateformes RH : classique et lisible, sans fioriture" },
  { id: "colonne", label: "Colonne", for: "PME, industrie, commerce : tes coordonnées en marge, la lettre à droite" },
] as const;
export type LetterTemplateId = (typeof LETTER_TEMPLATES)[number]["id"];
export const isLetterTemplate = (id?: string | null): id is LetterTemplateId => LETTER_TEMPLATES.some((t) => t.id === id);

/** Le modèle de lettre qui va avec un modèle de CV : les deux documents forment un ensemble quand ils partent ensemble. */
const MATCH: Record<string, LetterTemplateId> = {
  classique: "classique", moderne: "moderne", elegant: "elegant", bandeau: "bandeau",
  esn: "sobre", compact: "sobre", colonnes: "colonne", timeline: "colonne",
};
export const letterTemplateFor = (cvTemplate?: string | null): LetterTemplateId => (isLetterTemplate(cvTemplate) ? cvTemplate : MATCH[cvTemplate ?? ""] ?? "classique");

/* ---------- Parties de la lettre ---------- */

export type LetterParts = { subject: string; recipient: string; date: string; greeting: string; paragraphs: string[]; signoff: string; headline: string };

export const DEFAULT_GREETING = "Madame, Monsieur,";
export const DEFAULT_SIGNOFF = "Cordialement,";

const GREETING = /^(madame|monsieur|mesdames|messieurs|bonjour|cher|chère|chers|chères|à l['’]attention)/i;
const SIGNOFF = /^(cordialement|bien cordialement|bien à vous|bien sincèrement|sincères salutations|respectueusement|salutations|je vous prie d['’]agréer|veuillez agréer|dans l['’]attente)/i;

/** Découpe un texte libre en paragraphes (lignes vides) et en reconnaît la salutation et la formule finale quand elles y sont. */
function split(body: string, name: string) {
  const blocks = String(body ?? "").replace(/\r/g, "").split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  let greeting = "", signoff = "";
  if (blocks.length > 1 && blocks[0].length <= 70 && GREETING.test(blocks[0])) greeting = blocks.shift()!;
  if (blocks.length > 1) {
    const last = blocks[blocks.length - 1];
    const lines = last.split("\n").map((l) => l.trim()).filter(Boolean);
    const rest = lines.slice(1).join(" ").toLowerCase().replace(/[^a-zà-ÿ]/g, "");
    const isName = !rest || name.toLowerCase().replace(/[^a-zà-ÿ]/g, "").includes(rest) || rest.includes(name.toLowerCase().replace(/[^a-zà-ÿ]/g, ""));
    if (lines.length <= 3 && lines[0].length <= 120 && SIGNOFF.test(lines[0]) && isName) { signoff = lines[0]; blocks.pop(); }
  }
  return { greeting, paragraphs: blocks, signoff };
}

/**
 * Parties d'une lettre, quelle que soit sa forme : lettre récente (découpée) ou ancienne (texte libre).
 * `date` (AAAA-MM-JJ) sert quand la lettre n'en a pas : la date de création du document, pour qu'elle ne change pas à chaque ouverture.
 */
export function letterParts(l: LetterDoc, ctx: { company?: string | null; date?: string | null; name?: string; headline?: string | null }): LetterParts {
  const s = Array.isArray(l.paragraphs) ? { greeting: l.greeting ?? "", paragraphs: l.paragraphs, signoff: l.signoff ?? "" } : split(l.body, ctx.name ?? "");
  return {
    subject: l.subject ?? "",
    recipient: l.recipient ?? ctx.company ?? "",
    date: l.date ?? ctx.date?.slice(0, 10) ?? "",
    greeting: s.greeting || DEFAULT_GREETING,
    paragraphs: s.paragraphs.length ? s.paragraphs : [""],
    signoff: s.signoff || DEFAULT_SIGNOFF,
    headline: l.headline ?? ctx.headline ?? "",
  };
}

/** Remet les parties dans le document (avec le texte complet `body` toujours à jour : copie, anciens écrans). */
export function letterDoc(p: LetterParts, prev: LetterDoc): LetterDoc {
  const paragraphs = p.paragraphs.map((x) => x.trim()).filter(Boolean);
  return {
    ...prev,
    subject: p.subject, recipient: p.recipient, date: p.date, greeting: p.greeting, paragraphs, signoff: p.signoff, headline: p.headline,
    body: [p.greeting, ...paragraphs, p.signoff].filter(Boolean).join("\n\n"),
  };
}

/** « 2026-10-31 » → « Le 31 octobre 2026 » (« Le 1er novembre 2026 ») ; un texte déjà réécrit à la main reste tel quel. */
export function letterDate(d: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  const dt = new Date(`${d}T12:00:00Z`);
  const day = dt.getUTCDate();
  return `Le ${day === 1 ? "1er" : day} ${dt.toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" })}`;
}

/** Coordonnées de l'expéditeur : e-mail, téléphone, ville et un lien (LinkedIn d'abord). Pas la mobilité : elle n'a rien à faire en en-tête d'une lettre. */
export function senderItems(id: Profile["identity"]): Item[] {
  return [...contactItems(id).filter((i) => !/^Mobilité/i.test(i.text)), ...linkItems(id, 1)];
}
