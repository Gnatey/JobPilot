/**
 * « Garder pour plus tard » : enregistrer une offre, ou le texte de son annonce, SANS l'analyser (aucun appel d'IA). Logique pure, testée par
 * tests/offer-keep.test.ts ; la route est app/api/offers/keep, la base lib/offer-keep-db.ts. Le texte reste attaché à SA ligne « À analyser » d'Offres & CV
 * (table `application_texts`) : il revient quand on rouvre la ligne, et « Tout analyser » / « Analyser la sélection » le lisent. Rien n'est créé dans
 * Recommandées : une offre qu'on a sous les yeux n'a pas à y apparaître.
 */
import { httpUrlOrNull, normalizeJobUrl, detectSource } from "./fetch-offer";
import { tidyText } from "./reco-text";

/** Longueur minimale d'un texte collé pour qu'il serve plus tard (même seuil que l'analyse). */
export const MIN_TEXT = 150;
/** L'analyse ne lit que les 18 000 premiers caractères : inutile d'en ranger davantage. */
export const MAX_TEXT = 20000;
/** Poste affiché quand ni la personne ni l'adresse n'en donnent un. Jamais utilisé pour rapprocher deux lignes (voir buildQueue). */
export const UNTITLED = "Annonce à analyser";

export type KeepInput = { url?: unknown; text?: unknown; title?: unknown; company?: unknown };
export type KeepPlan = {
  /** Adresse normalisée (celle qu'on range), ou null. */
  url: string | null;
  /** Adresse telle que collée : une ligne plus ancienne peut l'avoir gardée ainsi. */
  rawUrl: string | null;
  /** Texte de l'annonce nettoyé, ou "". */
  text: string;
  title: string;
  company: string;
  /** Le poste a été deviné d'après l'adresse (pas saisi). */
  titleGuessed: boolean;
  site: string;
};

const clip = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "");

/**
 * Un intitulé lisible tiré de la fin d'une adresse (« …/jobs/junior-data-engineer_paris » donne « Junior data engineer paris »), sinon "".
 * Seulement quand l'adresse porte vraiment des mots : un numéro (« …/emplois/12345.html ») ne dit rien. Un repère de lecture, jamais un fait.
 */
export function titleFromUrl(raw: string | null | undefined): string {
  if (!raw) return "";
  let last = "";
  try {
    last = decodeURIComponent(new URL(raw).pathname.split("/").filter(Boolean).pop() ?? "");
  } catch {
    return "";
  }
  const slug = last.replace(/\.(html?|php|aspx?)$/i, "").replace(/[-_+]+/g, " ").replace(/\b\d{5,}\b/g, " ").replace(/\s+/g, " ").trim();
  const letters = slug.replace(/[^\p{L}]/gu, "");
  // Des mots (pas un identifiant) : au moins deux mots, au moins 8 lettres, et peu de chiffres
  if (slug.split(" ").length < 2 || letters.length < 8 || /\d{3,}/.test(slug)) return "";
  return slug.charAt(0).toUpperCase() + slug.slice(1);
}

/** Prépare l'enregistrement : vérifie qu'il y a de quoi garder (un lien, ou un texte assez long) et nettoie les champs. */
export function planKeep(input: KeepInput): { ok: true; plan: KeepPlan } | { ok: false; error: string } {
  const rawUrl = typeof input.url === "string" && input.url.trim() ? httpUrlOrNull(input.url) : null;
  if (typeof input.url === "string" && input.url.trim() && !rawUrl) return { ok: false, error: "Ce lien n'est pas une adresse web valide (il doit commencer par http:// ou https://)." };
  const text = typeof input.text === "string" ? tidyText(input.text).slice(0, MAX_TEXT) : "";
  if (!rawUrl && text.length < MIN_TEXT) {
    return { ok: false, error: text ? `Le texte est trop court (${text.length} caractères sur ${MIN_TEXT}) : colle l'annonce complète, ou son lien.` : "Colle le lien de l'annonce, ou son texte." };
  }
  const url = rawUrl ? normalizeJobUrl(rawUrl) : null;
  const typed = clip(input.title, 200);
  // Sans lien, le poste est la seule façon de retrouver la ligne dans la liste
  if (!url && !typed) return { ok: false, error: "Sans lien, indique le poste (« Poste », sous le texte) pour t'y retrouver dans ta liste." };
  const guessed = typed ? "" : titleFromUrl(url);
  const title = typed || guessed || UNTITLED;
  const company = clip(input.company, 120);
  return { ok: true, plan: { url, rawUrl, text, title, company, titleGuessed: !typed && !!guessed, site: detectSource(url) } };
}

/** Texte collé pour une ligne d'Offres & CV déjà ouverte : nettoyé et plafonné (l'analyse ne lit que les 18 000 premiers caractères). */
export const cleanAdText = (v: unknown): string => (typeof v === "string" ? tidyText(v).slice(0, MAX_TEXT) : "");

/** Ce que la route a fait, pour la phrase de confirmation. `missing` : la ligne n'existe plus. */
export type KeepOutcome = "kept" | "exists" | "tracked" | "analyzed" | "missing";
/** Ce qu'il est advenu du texte apporté : rangé (added), remplacé (replaced), identique à celui déjà gardé (same), trop court pour servir (short), aucun (none). */
export type TextState = "added" | "replaced" | "same" | "short" | "none";

export function keepMessage(outcome: KeepOutcome, title: string, text: TextState = "none"): string {
  const tooShort = ` Le texte collé est trop court pour servir (${MIN_TEXT} caractères au moins) : colle l'annonce complète.`;
  switch (outcome) {
    case "kept": return `Gardée dans Offres & CV (à analyser) : ${title}.${text === "added" ? " Son texte est gardé avec elle." : text === "short" ? tooShort : ""}`;
    case "exists":
      switch (text) {
        case "added": return "Texte gardé sur cette ligne d'Offres & CV : tu le retrouveras en la rouvrant.";
        case "replaced": return "J'ai remplacé le texte gardé sur cette ligne par celui que tu viens de coller.";
        case "same": return "Ce texte est déjà gardé sur cette ligne.";
        case "short": return `Rien n'a changé.${tooShort}`;
        default: return "Cette offre est déjà dans ta liste (Offres & CV, à analyser). Pour lui garder le texte de l'annonce, colle-le dans la zone de texte, puis « Garder ».";
      }
    case "tracked": return "Cette offre est déjà dans ton suivi : rien n'a été ajouté.";
    case "analyzed": return "Cette offre est déjà analysée : je te l'ouvre.";
    case "missing": return "Cette ligne n'existe plus dans ta liste (supprimée entre-temps ?).";
  }
}
