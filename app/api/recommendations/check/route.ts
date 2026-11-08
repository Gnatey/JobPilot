import { requireUser, HttpError } from "@/lib/supabase/server";
import { handle } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { readOffer, detectSource } from "@/lib/fetch-offer";
import { CHECK_BATCH, verdictOf, type CheckResult } from "@/lib/offer-check";
import { checkable, checkTarget, goneWhy } from "@/lib/offer-check-read";

export const maxDuration = 60;

/**
 * « Vérifier les annonces » dans Recommandées : lit le lien de quelques offres « À trier » (6 au plus par appel) pour dire si l'annonce est encore en
 * ligne. AUCUNE IA, aucune action IA dépensée, et rien n'est modifié : c'est la personne qui écarte ensuite, depuis le bilan. Les adresses viennent de la
 * base (jamais du corps de la requête) et passent par la lecture protégée (`readOffer` → `safeGet` : pas d'adresse interne, taille et durée limitées).
 * Lecture directe seulement, jamais le lecteur de secours : pas d'appel en masse à un prestataire. Même seau de limite que « Vérifier les annonces »
 * d'Offres & CV (`checkAds`).
 */
export async function POST(req: Request) {
  return handle(52_000, async () => {
    const { supabase } = await requireUser();
    await rateLimit(supabase, "checkAds");
    const body = (await req.json().catch(() => ({}))) as { ids?: unknown };
    const ids = [...new Set((Array.isArray(body.ids) ? body.ids : []).filter((x): x is string => typeof x === "string" && x.length > 0 && x.length < 60))].slice(0, CHECK_BATCH);
    if (!ids.length) throw new HttpError(400, "Aucune offre à vérifier.");
    const { data: recos } = await supabase.from("recommendations").select("id, url").in("id", ids).eq("status", "new").is("offer_id", null);
    const results: CheckResult[] = await Promise.all(
      (recos ?? []).map(async (r): Promise<CheckResult> => {
        const url = (r.url as string | null) ?? null;
        const site = detectSource(url);
        if (!url || !checkable(url)) return { id: r.id as string, verdict: "skipped", site };
        const target = checkTarget(url);
        const read = await readOffer(target);
        return { id: r.id as string, verdict: verdictOf(read), site, ...(read.gone ? { why: goneWhy(read.why, url, target) } : {}) };
      })
    );
    return { results };
  });
}
