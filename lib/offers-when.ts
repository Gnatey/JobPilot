/**
 * Offres & CV : la date d'une ligne (logique pure, testée par tests/offers-when.test.ts). Une ligne est une offre analysée ou une ligne « À analyser » ;
 * sa date de publication sur le site n'est pas sur la ligne mais sur la recommandation d'où elle vient (rattachée par son offre analysée, ou par son
 * adresse). Sans recommandation (offre analysée à la main), la seule date connue est celle de l'ajout (« ajoutée »).
 */
import { recoWhen, type When, type WhenKind } from "./posted";

export type RecoDate = { offer_id: string | null; url: string | null; posted_at?: string | null; received_at: string | null; origin: string | null };

const RANK: Record<WhenKind, number> = { posted: 0, received: 1, added: 2 };

/** Adresse sans paramètres de suivi, pour rapprocher une ligne de sa recommandation (injectée : le module reste lisible côté navigateur). */
export type Normalize = (url: string) => string;

export type RecoDates = { byOffer: Map<string, When>; byUrl: Map<string, When> };

/** Quand plusieurs recommandations disent la même chose : la date de publication d'abord, puis la plus ancienne (la première fois qu'on a vu l'annonce). */
function better(a: When | undefined, b: When): When {
  if (!a) return b;
  if (RANK[b.kind] !== RANK[a.kind]) return RANK[b.kind] < RANK[a.kind] ? b : a;
  return (b.at ?? "￿") < (a.at ?? "￿") ? b : a;
}

export function indexRecoDates(recos: RecoDate[], normalize: Normalize = (u) => u): RecoDates {
  const byOffer = new Map<string, When>();
  const byUrl = new Map<string, When>();
  for (const r of recos) {
    const w = recoWhen(r);
    if (!w.at) continue;
    if (r.offer_id) byOffer.set(r.offer_id, better(byOffer.get(r.offer_id), w));
    if (r.url) { const k = normalize(r.url); byUrl.set(k, better(byUrl.get(k), w)); }
  }
  return { byOffer, byUrl };
}

/** La date d'une ligne : celle de sa recommandation (par l'offre, sinon par l'adresse), sinon la date d'ajout. */
export function lineWhen(idx: RecoDates, line: { offer_id?: string | null; url?: string | null; created_at: string }, normalize: Normalize = (u) => u): When {
  const fromOffer = line.offer_id ? idx.byOffer.get(line.offer_id) : undefined;
  const fromUrl = line.url ? idx.byUrl.get(normalize(line.url)) : undefined;
  const found = fromOffer && fromUrl ? better(fromOffer, fromUrl) : fromOffer ?? fromUrl;
  return found ?? { at: line.created_at, kind: "added" };
}
