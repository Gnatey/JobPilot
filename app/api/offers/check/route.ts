import { requireUser, HttpError } from "@/lib/supabase/server";
import { handle } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { readOffer, detectSource } from "@/lib/fetch-offer";
import { CHECK_BATCH, verdictOf, type CheckResult } from "@/lib/offer-check";
import { checkable } from "@/lib/offer-check-read";

export const maxDuration = 60;

/**
 * « Vérifier les annonces » : lit les liens de quelques lignes « À analyser » (6 au plus par appel) pour dire si l'annonce est encore en ligne.
 * AUCUNE IA, aucune action IA dépensée, et rien n'est modifié : c'est la personne qui supprime ensuite, depuis le bilan. Les adresses viennent de la
 * base (jamais du corps de la requête) et passent par la lecture protégée (`readOffer` → `safeGet` : pas d'adresse interne, taille et durée limitées).
 * Lecture directe seulement, jamais le lecteur de secours : pas d'appel en masse à un prestataire.
 */
export async function POST(req: Request) {
  return handle(52_000, async () => {
    const { supabase } = await requireUser();
    await rateLimit(supabase, "checkAds");
    const body = (await req.json().catch(() => ({}))) as { app_ids?: unknown };
    const ids = [...new Set((Array.isArray(body.app_ids) ? body.app_ids : []).filter((x): x is string => typeof x === "string" && x.length > 0 && x.length < 60))].slice(0, CHECK_BATCH);
    if (!ids.length) throw new HttpError(400, "Aucune ligne à vérifier.");
    const { data: apps } = await supabase.from("applications").select("id, url").in("id", ids).eq("status", "a_postuler").is("offer_id", null);
    const results: CheckResult[] = await Promise.all(
      (apps ?? []).map(async (a): Promise<CheckResult> => {
        const url = (a.url as string | null) ?? null;
        const site = detectSource(url);
        if (!url || !checkable(url)) return { id: a.id as string, verdict: "skipped", site };
        return { id: a.id as string, verdict: verdictOf(await readOffer(url)), site };
      })
    );
    return { results };
  });
}
