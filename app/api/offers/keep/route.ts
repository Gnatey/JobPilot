import { requireUser, HttpError } from "@/lib/supabase/server";
import { handle } from "@/lib/http";
import { getProfile } from "@/lib/profile";
import { computeLearning } from "@/lib/learning";
import { quickScore } from "@/lib/quick-score";
import { planKeep } from "@/lib/offer-keep";
import { keepOffer, type ScoreFn } from "@/lib/offer-keep-db";

/**
 * « Garder pour plus tard » : enregistre une offre SANS l'analyser (aucun appel d'IA, donc aucune action IA dépensée).
 * L'offre devient une ligne « À analyser » d'Offres & CV (candidature « À postuler » sans offre lue) ; le texte de l'annonce, s'il a été collé,
 * est rangé dans la recommandation d'où elle vient, pour que « Tout analyser » / « Analyser la sélection » le retrouvent sans relire le site.
 * Jamais de doublon : une offre déjà analysée est rouverte, une ligne déjà dans la liste n'est pas recréée (son texte est complété si on en apporte un),
 * une offre déjà dans Suivi n'est pas touchée. La logique est dans lib/offer-keep-db.ts (testée).
 */
export async function POST(req: Request) {
  return handle(async () => {
    const { supabase, user } = await requireUser();
    const planned = planKeep((await req.json().catch(() => ({}))) as Record<string, unknown>);
    if (!planned.ok) throw new HttpError(400, planned.error);
    // Le pré-score est gratuit (sans IA) ; le profil et l'historique ne sont lus que s'il y a un texte à noter
    const score: ScoreFn = async (title, text, company) => {
      const [profile, learning] = await Promise.all([getProfile(supabase, user), computeLearning(supabase, user.id)]);
      const q = quickScore(profile, title, text, learning, company);
      return { quick_score: q.score, matched: q.matched, senior: q.senior };
    };
    return keepOffer(supabase, user, planned.plan, score);
  });
}
