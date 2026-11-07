/**
 * Import d'une page de résultats par le favori « Envoyer à JobPilot » : RIEN D'INCOMPLET dans « À trier » (décision de Juliana, 7 novembre).
 * Logique pure, lisible par l'écran (aucun import serveur), testée par tests/reco-import.test.ts ; la route est app/api/offers/capture.
 *
 * - Une offre de la page est d'abord rangée « en lecture » (`READING`, statut que AUCUNE liste n'affiche) ; elle passe en « new » quand son annonce
 *   a été lue en entier (route `enrich`). Les offres lues ne dépassent pas `READ_CAP` par import : les suivantes ne sont pas prises, un second clic
 *   sur le favori prend la suite (les offres déjà lues sont sautées, celles restées « en lecture » sont relues en premier).
 * - Page fermée avant la fin : ce qui n'est pas lu reste invisible et est SUPPRIMÉ au bout de `READING_DAYS` jours (lib/reco-age-db.ts).
 * - LinkedIn est exclu de cette règle (jamais lu en entier, exprès) : ses listes se rangent comme avant, titre et extrait, directement dans « À trier ».
 * - Doublons : même adresse (comme avant) ET même poste chez la même entreprise connue, au même lieu ou sans lieu (déjà une offre, une candidature ou une
 *   recommandation, quel que soit son statut, refusée comprise).
 */
import { companyKey, knownCompany, titleKey } from "./offer-dups";
import { norm } from "./offers-filter";

/** Annonces lues en entier par import (≈ 1 min 15 à 2-3 secondes chacune). */
export const READ_CAP = 30;
/** Statut d'une offre prise sur une page mais pas encore lue en entier : invisible partout. */
export const READING = "reading";
/** Au-delà, une offre restée « en lecture » est supprimée. */
export const READING_DAYS = 2;

export const readingCutoff = (now: Date = new Date()) => new Date(now.getTime() - READING_DAYS * 86_400_000).toISOString();

/** LinkedIn : liste rangée comme avant (titre et extrait), sans lecture ni suppression. */
export function isLenientPage(pageUrl: string): boolean {
  try { return /(^|\.)linkedin\.com$/i.test(new URL(pageUrl).hostname); } catch { return false; }
}

export const sameSite = (a: string, b: string): boolean => { try { return new URL(a).origin === new URL(b).origin; } catch { return false; } };

export type FoundOffer = { key: string; title: string; company: string; location: string; snippet: string; url: string };
export type KnownReco = { id: string; status: string; offer_id: string | null; snippet: string | null };
export type SeenJob = { title: string | null; company: string | null; location: string | null };

/** Une offre connue dont on n'a pas encore le texte de l'annonce : à lire (nouvelle, de l'e-mail, ou restée « en lecture »). */
export const needsReading = (r: KnownReco): boolean => !r.offer_id && ["new", "analyzed", READING].includes(r.status) && (r.snippet ?? "").length < 300;

/** Lieu comparable : la première partie (« Paris (75) », « Paris, France » donnent « paris »). */
const placeKey = (l: string | null | undefined) => norm(l ?? "").replace(/\(.*?\)/g, "").split(/[,/]|\s[-–]\s/)[0].replace(/[^a-z0-9]/g, "");

export type ImportSkips = { known: number; duplicate: number; otherSite: number; noLink: number; overCap: number };
export type ImportPlan = {
  lenient: boolean;
  /** Offres nouvelles à ranger : « reading » (à lire) ou, pour LinkedIn, « new ». */
  insert: (FoundOffer & { status: "new" | typeof READING })[];
  /** Clés des offres à lire maintenant (nouvelles + déjà connues incomplètes), dans l'ordre de la page, au plus `cap`. */
  readKeys: string[];
  skipped: ImportSkips;
};

export function planImport(a: { pageUrl: string; offers: FoundOffer[]; known: Map<string, KnownReco>; seen: SeenJob[]; cap?: number }): ImportPlan {
  const cap = a.cap ?? READ_CAP;
  const lenient = isLenientPage(a.pageUrl);
  const skipped: ImportSkips = { known: 0, duplicate: 0, otherSite: 0, noLink: 0, overCap: 0 };
  const insert: ImportPlan["insert"] = [];
  const readKeys: string[] = [];

  // Postes déjà connus : « titre|entreprise » → lieux (chaîne vide = lieu inconnu)
  const seen = new Map<string, Set<string>>();
  const note = (title: string | null, company: string | null, location: string | null) => {
    const t = titleKey(title ?? "");
    if (!t || !knownCompany(company ?? "")) return;
    const k = `${t}|${companyKey(company ?? "")}`;
    seen.set(k, (seen.get(k) ?? new Set()).add(placeKey(location)));
  };
  for (const s of a.seen) note(s.title, s.company, s.location);
  const isDup = (o: FoundOffer) => {
    const t = titleKey(o.title);
    if (!t || !knownCompany(o.company)) return false;
    const places = seen.get(`${t}|${companyKey(o.company)}`);
    if (!places) return false;
    const p = placeKey(o.location);
    return !p || places.has(p) || places.has("");
  };

  for (const o of a.offers) {
    const known = a.known.get(o.key);
    if (known) {
      if (lenient || !needsReading(known)) skipped.known++; // LinkedIn : jamais relu
      else if (readKeys.length < cap) readKeys.push(o.key);
      else skipped.overCap++;
      continue;
    }
    if (lenient) { insert.push({ ...o, status: "new" }); continue; } // comme avant : rien de plus pour LinkedIn
    if (!o.url) { skipped.noLink++; continue; } // sans lien, l'annonce ne pourra jamais être lue : pas prise
    if (!sameSite(o.url, a.pageUrl)) { skipped.otherSite++; continue; } // un autre site : le favori ne le lit pas
    if (isDup(o)) { skipped.duplicate++; continue; }
    if (readKeys.length >= cap) { skipped.overCap++; continue; }
    insert.push({ ...o, status: READING });
    readKeys.push(o.key);
    note(o.title, o.company, o.location);
  }
  return { lenient, insert, readKeys, skipped };
}

/** Phrases du bilan d'import (écran « Réception d'une page »), pour ce qui n'a PAS été pris ou pas lu. */
export function importNotes(s: ImportSkips, pending: number): string[] {
  const p = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;
  const out: string[] = [];
  if (pending > 0) out.push(`${p(pending, "offre n'a pas pu être lue en entier", "offres n'ont pas pu être lues en entier")} : ${pending > 1 ? "elles restent" : "elle reste"} invisible${pending > 1 ? "s" : ""} et ${pending > 1 ? "seront supprimées" : "sera supprimée"} dans ${READING_DAYS} jours. Reclique sur le favori sur cette page pour les relire.`);
  if (s.overCap > 0) out.push(`${p(s.overCap, "autre offre de la page n'a pas été prise", "autres offres de la page n'ont pas été prises")} (limite de ${READ_CAP} lues par import) : reclique sur le favori pour prendre la suite.`);
  if (s.otherSite + s.noLink > 0) out.push(`${p(s.otherSite + s.noLink, "offre n'a pas été prise", "offres n'ont pas été prises")} : ${s.otherSite + s.noLink > 1 ? "elles n'ont" : "elle n'a"} pas de lien lisible depuis ce site. Ouvre-les et reclique sur le favori.`);
  if (s.duplicate > 0) out.push(`${p(s.duplicate, "offre écartée", "offres écartées")} : ${s.duplicate > 1 ? "mêmes" : "même"} poste et ${s.duplicate > 1 ? "mêmes" : "même"} entreprise que ${s.duplicate > 1 ? "des offres" : "une offre"} déjà dans JobPilot.`);
  return out;
}

/** Bilan d'un import (page ordinaire, jamais LinkedIn) : titre, phrase d'explication quand rien n'a pu être lu, et ce qui n'a pas été pris. */
export function importSummary(a: { found: number; read: number; toRead: number; pending: number; skipped: ImportSkips }): { title: string; ok: boolean; hint: string | null; notes: string[] } {
  const notes = importNotes(a.skipped, a.pending);
  if (a.found === 0) return { title: "Je n'ai trouvé aucune offre précise sur cette page.", ok: false, hint: null, notes };
  if (a.read > 0) return { title: `${a.read} annonce${a.read > 1 ? "s" : ""} lue${a.read > 1 ? "s" : ""} en entier, prête${a.read > 1 ? "s" : ""} à trier`, ok: true, hint: null, notes };
  if (a.toRead === 0) {
    const n = a.skipped.known;
    return { title: "Rien de nouveau à ajouter", ok: true, hint: n > 0 ? `${n > 1 ? `Les ${n} offres reconnues de la page sont` : "L'offre reconnue de la page est"} déjà dans JobPilot.` : null, notes };
  }
  return {
    title: "Aucune offre ajoutée à « À trier »",
    ok: false,
    hint: "Je n'ai pas pu lire les annonces en entier : le site a refusé, la page d'origine a été fermée, ou ton favori est ancien (supprime-le et glisse-le à nouveau depuis « Analyser une offre »). Une offre n'arrive dans « À trier » que lue en entier.",
    notes,
  };
}
