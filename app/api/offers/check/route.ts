import { requireUser, HttpError } from "@/lib/supabase/server";
import { handle } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { readOffer, detectSource } from "@/lib/fetch-offer";
import { CHECK_BATCH, verdictOf, type CheckResult } from "@/lib/offer-check";
import { checkable, checkTarget, goneWhy } from "@/lib/offer-check-read";
import { rememberPosted } from "@/lib/posted-db";

export const maxDuration = 60;

/**
 * « Vérifier les annonces » : lit les liens de quelques lignes (6 au plus par appel) pour dire si l'annonce est encore en ligne : lignes « À analyser »
 * (`app_ids`) et offres déjà analysées (`offer_ids` : une annonce peut disparaître après son analyse, 9 novembre).
 * AUCUNE IA, aucune action IA dépensée, et rien n'est modifié : c'est la personne qui supprime ensuite, depuis le bilan. Les adresses viennent de la
 * base (jamais du corps de la requête) et passent par la lecture protégée (`readOffer` → `safeGet` : pas d'adresse interne, taille et durée limitées).
 * Lecture directe seulement, jamais le lecteur de secours : pas d'appel en masse à un prestataire.
 */
export async function POST(req: Request) {
  return handle(52_000, async () => {
    const { supabase } = await requireUser();
    await rateLimit(supabase, "checkAds");
    const body = (await req.json().catch(() => ({}))) as { app_ids?: unknown; offer_ids?: unknown };
    const clean = (v: unknown) => [...new Set((Array.isArray(v) ? v : []).filter((x): x is string => typeof x === "string" && x.length > 0 && x.length < 60))];
    // 6 lignes au plus par appel, candidatures et offres confondues
    const appIds = clean(body.app_ids).slice(0, CHECK_BATCH);
    const offerIds = clean(body.offer_ids).slice(0, CHECK_BATCH - appIds.length);
    if (!appIds.length && !offerIds.length) throw new HttpError(400, "Aucune ligne à vérifier.");
    const [{ data: apps }, { data: offers }] = await Promise.all([
      appIds.length ? supabase.from("applications").select("id, url").in("id", appIds).eq("status", "a_postuler").is("offer_id", null) : Promise.resolve({ data: [] as { id: unknown; url: unknown }[] }),
      offerIds.length ? supabase.from("offers").select("id, url").in("id", offerIds) : Promise.resolve({ data: [] as { id: unknown; url: unknown }[] }),
    ]);
    const read1 = async (id: string, rawUrl: unknown, offerId?: string): Promise<CheckResult> => {
      const url = (rawUrl as string | null) ?? null;
      const site = detectSource(url);
      if (!url || !checkable(url)) return { id, verdict: "skipped", site };
      const target = checkTarget(url);
      const read = await readOffer(target);
      // Date de publication lue sur la page : rangée sur la recommandation d'où vient la ligne (sans écraser), le tri par date s'en sert
      if (read.posted) await rememberPosted(supabase, offerId ? { offer_id: offerId } : { url }, read.posted);
      return { id, verdict: verdictOf(read), site, ...(read.gone ? { why: goneWhy(read.why, url, target) } : {}), ...(read.posted ? { posted: read.posted } : {}) };
    };
    const results: CheckResult[] = await Promise.all([
      ...(apps ?? []).map((a) => read1(a.id as string, a.url)),
      ...(offers ?? []).map((o) => read1(o.id as string, o.url, o.id as string)),
    ]);
    return { results };
  });
}
