import { requireUser, HttpError } from "@/lib/supabase/server";
import { handle } from "@/lib/http";
import { SYNC_CHUNK, lineStatus, type LineState } from "@/lib/skip-sync";

export const dynamic = "force-dynamic";

/**
 * État actuel de quelques lignes d'Offres & CV (100 au plus) : toujours « À analyser », analysée depuis, ou sortie de la liste ; et porte-t-elle un
 * texte gardé. Sert à remettre à jour le bilan de « Tout analyser » / « Vérifier les annonces » quand la personne a collé un texte ou analysé une ligne
 * dans un autre onglet. Lecture seule, aucune IA. Une ligne qui n'existe plus (ou qui n'est pas à la personne) est simplement absente de la réponse.
 * Table des textes absente (base pas encore à jour) : aucune ligne n'a de texte, sans erreur.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const { supabase } = await requireUser();
    const body = (await req.json().catch(() => ({}))) as { app_ids?: unknown };
    const ids = [...new Set((Array.isArray(body.app_ids) ? body.app_ids : []).filter((x): x is string => typeof x === "string" && x.length > 0 && x.length < 60))].slice(0, SYNC_CHUNK);
    if (!ids.length) throw new HttpError(400, "Aucune ligne.");
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
