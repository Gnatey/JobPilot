import { requireUser } from "@/lib/supabase/server";
import { handle } from "@/lib/http";
import { buildQueue } from "@/lib/analyze-queue";
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
    const [{ data: apps }, { data: recos }, used] = await Promise.all([
      supabase.from("applications").select("id, title, company, url, created_at").eq("status", "a_postuler").is("offer_id", null).limit(300),
      // toutes les offres acceptées et pas encore analysées : le tri par meilleur pré-score se fait ensuite, il doit voir TOUTES les lignes (Supabase coupe sinon à 1 000)
      fetchAll((a, b) => supabase.from("recommendations").select("id, title, company, url, quick_score, source, origin, snippet").eq("status", "accepted").is("offer_id", null).order("id").range(a, b)),
      usedToday(supabase, user.id),
    ]);
    const { items, skipped, blocked } = buildQueue(apps ?? [], recos ?? []);
    const cap = isOwner(user.email) ? null : dailyBudget();
    const possible = cap == null || used == null ? null : Math.max(0, Math.floor((cap - used) / AI_COST.offer));
    return { items, skipped: skipped.length, blocked, budget: { cap, used, possible } };
  });
}
