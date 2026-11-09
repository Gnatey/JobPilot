/**
 * Doublons dans Suivi : la même candidature enregistrée deux fois (deux clics, une offre reçue par deux e-mails, une ancienne version de la synchro).
 * Logique pure, lisible par l'écran (aucun import serveur), testée par tests/app-dups.test.ts ; l'écran est components/suivi-dups.tsx.
 *
 * Deux lignes « en cours » (À postuler, Postulé, Entretien, Test / Cas, Relancé, Offre) forment un doublon si :
 *  - elles viennent de la MÊME offre analysée (`offer_id`), ou
 *  - elles ont le même intitulé (sans « H/F », accents ni majuscules) ET la même entreprise connue, sans que rien ne les sépare : deux lieux différents
 *    (« Paris » et « Lyon ») ou deux envois à plus de 90 jours d'écart sont deux candidatures, pas une.
 * Les lignes closes (Refusé, Abandonné, Offre plus disponible) ne sont jamais comparées : une annonce republiée après un refus est une autre candidature.
 *
 * On GARDE la ligne la plus avancée (Offre > Relancé > Test / Cas > Entretien > Postulé > À postuler), puis celle qui porte le plus de travail
 * (document, note, contact, salaire, entretien, e-mail rattaché), puis la plus anciennement envoyée, puis le meilleur score, puis la plus ancienne.
 * Une ligne qui porte du travail n'est jamais cochée d'office. Rien n'est supprimé sans la personne.
 */
import { norm } from "./offers-filter";
import { titleKey, companyKey, knownCompany } from "./offer-dups";
import { STATUSES } from "./types";

export type DupLine = {
  id: string;
  offer_id: string | null;
  title: string;
  company: string;
  location: string | null;
  status: string;
  score: number | null;
  applied_at: string | null;
  interview_at?: string | null;
  contact: string | null;
  salary: string | null;
  notes: string | null;
  last_email_at: string | null;
  created_at: string;
};
export type AppDupGroup = { id: string; reason: "offer" | "title"; items: DupLine[]; keepId: string };

/** Statuts comparés : tout sauf les lignes closes. */
export const OPEN_STATUSES: readonly string[] = ["a_postuler", "postule", "entretien", "test", "relance", "offre"];
/** Deux envois à plus de 90 jours d'écart : deux candidatures. */
export const MAX_GAP_DAYS = 90;

const rank = (status: string) => STATUSES.findIndex((s) => s.id === status);
const has = (s: string | null | undefined) => !!(s ?? "").trim();
const locKey = (l: string | null) => norm(l ?? "").replace(/[^a-z0-9]/g, "");
const day = (iso: string | null) => (iso && Number.isFinite(Date.parse(iso)) ? Date.parse(iso) : null);

/** Le travail porté par une ligne, en nombre de traces : note, contact, salaire, entretien, e-mail rattaché, document (CV, lettre). */
export function traces(l: DupLine, cv = 0): string[] {
  const out: string[] = [];
  if (cv > 0) out.push(cv > 1 ? `${cv} documents` : "un document");
  if (has(l.notes)) out.push("une note");
  if (has(l.contact)) out.push("un contact");
  if (has(l.salary)) out.push("un salaire");
  if (l.interview_at) out.push("un entretien");
  if (l.last_email_at) out.push("un e-mail rattaché");
  return out;
}

/** Ligne « nue » : aucune trace de travail, la supprimer ne fait perdre que la ligne elle-même. */
export const isBare = (l: DupLine, cv = 0) => traces(l, cv).length === 0;

/** Ordre de préférence : la plus avancée, puis la plus chargée, puis la plus anciennement envoyée, puis le meilleur score, puis la plus ancienne. */
function better(a: DupLine, b: DupLine, cv: Record<string, number>): number {
  const da = day(a.applied_at), db = day(b.applied_at);
  return (
    rank(b.status) - rank(a.status) ||
    traces(b, cv[b.id] ?? 0).length - traces(a, cv[a.id] ?? 0).length ||
    (da == null && db == null ? 0 : da == null ? 1 : db == null ? -1 : da - db) ||
    (b.score ?? -1) - (a.score ?? -1) ||
    a.created_at.localeCompare(b.created_at) ||
    a.id.localeCompare(b.id)
  );
}

/** Deux lignes de même intitulé et de même entreprise peuvent-elles être la même candidature ? */
function compatible(a: DupLine, b: DupLine): boolean {
  const la = locKey(a.location), lb = locKey(b.location);
  if (la && lb && !la.includes(lb) && !lb.includes(la)) return false; // « Paris » et « Lyon » : deux postes
  const da = day(a.applied_at), db = day(b.applied_at);
  if (da != null && db != null && Math.abs(da - db) > MAX_GAP_DAYS * 864e5) return false; // annonce republiée, nouvelle candidature
  return true;
}

/**
 * Les groupes de doublons. `cv` : nombre de documents rattachés à chaque ligne (par identifiant), pour choisir la ligne gardée ; absent = zéro.
 * Triés : le plus récemment créé d'abord.
 */
export function findAppDuplicates(lines: DupLine[], cv: Record<string, number> = {}): AppDupGroup[] {
  const open = lines.filter((l) => OPEN_STATUSES.includes(l.status));
  const parent = new Map<string, string>(open.map((l) => [l.id, l.id]));
  const find = (x: string): string => { let r = x; while (parent.get(r) !== r) r = parent.get(r)!; return r; };
  const union = (a: string, b: string) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(rb, ra); };
  const viaOffer = new Set<string>(); // groupes réunis par la même offre analysée

  const byOffer = new Map<string, DupLine[]>();
  for (const l of open) if (l.offer_id) byOffer.set(l.offer_id, [...(byOffer.get(l.offer_id) ?? []), l]);
  for (const list of byOffer.values()) for (let i = 1; i < list.length; i++) { union(list[0].id, list[i].id); viaOffer.add(list[0].id); viaOffer.add(list[i].id); }

  const byTitle = new Map<string, DupLine[]>();
  for (const l of open) {
    const t = titleKey(l.title);
    if (t && knownCompany(l.company)) {
      const k = `${t}|${companyKey(l.company)}`;
      byTitle.set(k, [...(byTitle.get(k) ?? []), l]);
    }
  }
  for (const list of byTitle.values())
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) if (compatible(list[i], list[j])) union(list[i].id, list[j].id);

  const clusters = new Map<string, DupLine[]>();
  for (const l of open) clusters.set(find(l.id), [...(clusters.get(find(l.id)) ?? []), l]);

  const groups: AppDupGroup[] = [];
  for (const items of clusters.values()) {
    if (items.length < 2) continue;
    const ranked = [...items].sort((a, b) => better(a, b, cv));
    groups.push({ id: ranked.map((l) => l.id).sort()[0], reason: ranked.every((l) => viaOffer.has(l.id)) ? "offer" : "title", items: ranked, keepId: ranked[0].id });
  }
  const newest = (g: AppDupGroup) => g.items.reduce((m, l) => (l.created_at > m ? l.created_at : m), "");
  return groups.sort((a, b) => newest(b).localeCompare(newest(a)) || a.id.localeCompare(b.id));
}

/** Lignes en trop d'un groupe : toutes sauf celle qu'on garde. */
export const extras = (g: AppDupGroup) => g.items.filter((l) => l.id !== g.keepId);

/** Lignes cochées d'office : en trop ET sans aucune trace de travail. */
export const preChecked = (g: AppDupGroup, cv: Record<string, number> = {}) => extras(g).filter((l) => isBare(l, cv[l.id] ?? 0));

/** Phrase de bilan : « 2 groupes de doublons, 3 lignes en trop ». */
export function appDupSummary(groups: AppDupGroup[]): string {
  const s = (n: number) => (n > 1 ? "s" : "");
  const extra = groups.reduce((n, g) => n + extras(g).length, 0);
  return `${groups.length} groupe${s(groups.length)} de doublons, ${extra} ligne${s(extra)} en trop.`;
}
