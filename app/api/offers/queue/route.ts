import { requireUser } from "@/lib/supabase/server";
import { handle } from "@/lib/http";
import { buildQueue, noSourceLine } from "@/lib/analyze-queue";
import { AI_COST, dailyBudget, isOwner, usedToday } from "@/lib/quota";
import { fetchAll } from "@/lib/paged";

export const dynamic = "force-dynamic";

/**
 * File d'attente de « Tout analyser » : les lignes « À analyser » d'Offres & CV, meilleur pré-score d'abord,
 * et ce qu'il reste d'actions IA aujourd'hui. Rien n'est stocké : la file se recalcule à chaque fois, donc « reprendre plus tard » est gratuit.
 */
export async function GET() {
  return handle(async () => {
    const { supabase, user } = await requireUser();
    const [{ data: apps }, { data: recos }, texts, used] = await Promise.all([
      // toutes les lignes « À analyser », page après page (un limit() de 300 en laissait de côté sans le dire)
      fetchAll((a, b) => supabase.from("applications").select("id, title, company, url, created_at").eq("status", "a_postuler").is("offer_id", null).order("id").range(a, b)),
      // toutes les offres acceptées et pas encore analysées : le tri par meilleur pré-score se fait ensuite, il doit voir TOUTES les lignes (Supabase coupe sinon à 1 000)
      fetchAll((a, b) => supabase.from("recommendations").select("id, title, company, url, quick_score, source, origin, snippet").eq("status", "accepted").is("offer_id", null).order("id").range(a, b)),
      // quelles lignes portent un texte gardé (leurs identifiants seulement) ; table absente (base pas encore à jour) ou illisible : aucune, sans bloquer la file
      fetchAll((a, b) => supabase.from("application_texts").select("application_id").order("application_id").range(a, b)),
      usedToday(supabase, user.id),
    ]);
    const withText = new Set(texts.error ? [] : texts.data.map((t) => t.application_id as string));
    const { items, skipped, blocked } = buildQueue((apps ?? []).map((a) => ({ ...a, has_text: withText.has(a.id as string) })), recos ?? []);
    const cap = isOwner(user.email) ? null : dailyBudget();
    const possible = cap == null || used == null ? null : Math.max(0, Math.floor((cap - used) / AI_COST.offer));
    // `skippedIds` : pour « Analyser la sélection », qui ne compte que les lignes cochées ; `skippedLines` : les mêmes lignes sans lien ni texte, pour les LISTER dans le bilan
    // (avant, seul leur nombre s'affichait : on ne savait pas lesquelles ouvrir)
    return { items, skipped: skipped.length, skippedIds: skipped.map((s) => s.id), skippedLines: skipped.map(noSourceLine), blocked, budget: { cap, used, possible } };
  });
}
