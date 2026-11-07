/** Range dans Masquées les offres « À trier » reçues il y a plus de 3 semaines (voir lib/reco-age.ts). Aucune IA, rien n'est supprimé. */
import type { SupabaseClient } from "@supabase/supabase-js";
import { KEPT } from "./fit";
import { OLD_REASON, oldCutoff } from "./reco-age";

const chunks = <T,>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

/**
 * Seules les offres « new » (jamais analysées) sont rangées : une offre déjà analysée a coûté de l'IA et reste à décider ; une offre que la personne a
 * remise dans sa liste (« garde ») n'est jamais rangée ; sans date de réception, on ne conclut rien. Rejouable : sans effet s'il n'y a rien d'ancien.
 * Ne lève jamais d'erreur (c'est un rangement, jamais bloquant) : en cas de problème de lecture, rien n'est fait. Renvoie le nombre d'offres rangées.
 */
export async function archiveOld(supabase: SupabaseClient, userId: string, now: Date = new Date()): Promise<number> {
  try {
    const cutoff = oldCutoff(now);
    const ids: string[] = [];
    for (let from = 0; from < 3000; from += 400) {
      const { data, error } = await supabase
        .from("recommendations").select("id, reject_reason")
        .eq("user_id", userId).eq("status", "new").lt("received_at", cutoff).order("id").range(from, from + 399);
      if (error) return 0;
      for (const r of data ?? []) if (r.reject_reason !== KEPT) ids.push(r.id as string);
      if ((data?.length ?? 0) < 400) break;
    }
    for (const c of chunks(ids, 100)) {
      const { error } = await supabase.from("recommendations").update({ status: "filtered", reject_reason: OLD_REASON }).eq("user_id", userId).eq("status", "new").in("id", c);
      if (error) return 0;
    }
    return ids.length;
  } catch {
    return 0;
  }
}
