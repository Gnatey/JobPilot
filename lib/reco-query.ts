import type { Profile } from "./types";
import type { Learning } from "./learning";
import type { Reco } from "@/components/reco-list";
import { quickScore } from "./quick-score";
import { recoText } from "./reco-text";

/** Colonnes lues pour afficher les offres recommandées (le texte complet de l'annonce reste en base). */
export const RECO_COLS = "id, title, company, location, url, source, origin, snippet, status, reject_reason, received_at, offer_id, quick_score, senior, offers(score)";

export type RecoRow = {
  id: string; title: string | null; company: string | null; location: string | null; url: string | null; source: string | null; origin: string | null;
  snippet: string | null; status: string; reject_reason: string | null; received_at: string | null; offer_id: string | null; senior: boolean;
  offers: { score: number | null } | null;
};

const clean = (s: string) => s.replace(/\[https?:\/\/[^\]]*\]/g, " ").replace(/\s+/g, " ").trim();

/** Le pré-score est recalculé avec ce que l'app a appris depuis l'arrivée de l'offre. */
export function toReco(r: RecoRow, profile: Profile, learning: Learning, withExcerpt = false): Reco {
  const q = quickScore(profile, r.title ?? "", `${r.snippet ?? ""} ${r.location ?? ""}`, learning, r.company ?? "");
  return {
    id: r.id, title: r.title, company: r.company, location: r.location, url: r.url, source: r.source, origin: r.origin,
    status: r.status, reject_reason: r.reject_reason, received_at: r.received_at, offer_id: r.offer_id,
    score: r.offers?.score ?? q.score, ai: r.offers?.score != null, read: recoText(r).length > 0, matched: q.matched, senior: q.senior || r.senior, years: q.years, penalties: q.penalties,
    ...(withExcerpt && r.snippet ? { excerpt: clean(r.snippet).slice(0, 320) } : {}),
  };
}
