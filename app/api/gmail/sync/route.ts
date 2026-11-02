import { requireUser } from "@/lib/supabase/server";
import { handle } from "@/lib/http";
import { syncGmail, runSavedSearches, autoPrepare, refitStock } from "@/lib/sync";
import { spendAi, AI_COST } from "@/lib/quota";
import { currentDeadline, withDeadline } from "@/lib/budget";

export const maxDuration = 300;

/**
 * Bouton "Tout synchroniser" : Gmail, recherches sauvegardées, préparation des meilleures offres.
 * Chaque étape a sa part du temps (270 s au total, sous la limite de 300 s) : si le temps ou l'IA manque, la route s'arrête
 * proprement, renvoie ce qui est fait avec `partial: true`, et un nouveau clic reprend là où elle s'était arrêtée.
 */
export async function POST() {
  return handle(270_000, async () => {
    const { supabase, user } = await requireUser();
    await spendAi(supabase, user, AI_COST.mailSync);
    await refitStock(supabase, user.id).catch(() => null);
    const total = currentDeadline()!;
    // Gmail ne mange pas tout le temps : les recherches et l'analyse des meilleures offres doivent aussi avoir leur tour
    const gmail = await withDeadline(total.slice(total.left() * 0.55), () => syncGmail(supabase, user.id));
    const searches = await runSavedSearches(supabase, user.id);
    // Chaque offre préparée est décomptée du quota IA de la personne
    const prep = await autoPrepare(supabase, user.id, () => spendAi(supabase, user, AI_COST.offer));
    const partial = Boolean(("partial" in gmail && gmail.partial) || ("partial" in searches && searches.partial) || prep.stopped === "temps");
    return { gmail, searches, prep, partial };
  });
}
