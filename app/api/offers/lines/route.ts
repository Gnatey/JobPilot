import { requireUser, HttpError } from "@/lib/supabase/server";
import { handle } from "@/lib/http";
import { SYNC_CHUNK, lineStatus, type LineState } from "@/lib/skip-sync";
import { pickApplication } from "@/lib/app-pick";

export const dynamic = "force-dynamic";

/**
 * État actuel de quelques lignes d'Offres & CV (100 au plus) : toujours « À analyser », analysée depuis, ou sortie de la liste ; et porte-t-elle un
 * texte gardé. Sert à remettre à jour le bilan de « Tout analyser » / « Vérifier les annonces » quand la personne a collé un texte ou analysé une ligne
 * dans un autre onglet. `offer_ids` : les offres déjà analysées vérifiées par « Vérifier les annonces ». Lecture seule, aucune IA. Une ligne qui n'existe plus (ou qui n'est pas à la personne) est simplement absente de la réponse.
 * Table des textes absente (base pas encore à jour) : aucune ligne n'a de texte, sans erreur.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const { supabase } = await requireUser();
    const body = (await req.json().catch(() => ({}))) as { app_ids?: unknown; offer_ids?: unknown };
    const clean = (v: unknown) => [...new Set((Array.isArray(v) ? v : []).filter((x): x is string => typeof x === "string" && x.length > 0 && x.length < 60))].slice(0, SYNC_CHUNK);
    const ids = clean(body.app_ids);
    const offerIds = clean(body.offer_ids);
    if (!ids.length && !offerIds.length) throw new HttpError(400, "Aucune ligne.");
    // Offres déjà analysées (bilan de « Vérifier les annonces ») : elles existent encore, ou elles ont été supprimées (absentes de la réponse)
    if (offerIds.length) {
      const [{ data: offers, error }, { data: apps, error: appsError }] = await Promise.all([
        supabase.from("offers").select("id").in("id", offerIds),
        supabase.from("applications").select("offer_id, status").in("offer_id", offerIds),
      ]);
      if (error || appsError) throw error ?? appsError;
      const byOffer = new Map<string, { status: string }[]>();
      for (const a of apps ?? []) byOffer.set(a.offer_id as string, [...(byOffer.get(a.offer_id as string) ?? []), { status: a.status as string }]);
      // Une offre dont la candidature est partie depuis (postulée…) quitte le bilan : elle se gère dans Suivi, jamais ici
      return { lines: (offers ?? []).map((o): LineState => { const rows = byOffer.get(o.id as string); return { id: o.id as string, state: !rows || pickApplication(rows)!.status === "a_postuler" ? "todo" : "away", has_text: false }; }) };
    }
    const [{ data: apps, error }, texts] = await Promise.all([
      supabase.from("applications").select("id, status, offer_id").in("id", ids),
      supabase.from("application_texts").select("application_id").in("application_id", ids),
    ]);
    // Une lecture ratée ne doit jamais ressembler à « ces lignes n'existent plus » : on répond une erreur, l'écran ne retire rien
    if (error) throw error;
    const withText = new Set(texts.error ? [] : (texts.data ?? []).map((t) => t.application_id as string));
    const lines: LineState[] = (apps ?? []).map((a) => ({ id: a.id as string, state: lineStatus({ status: a.status as string | null, offer_id: a.offer_id as string | null }), has_text: withText.has(a.id as string) }));
    return { lines };
  });
}
