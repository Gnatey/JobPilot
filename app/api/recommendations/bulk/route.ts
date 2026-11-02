import { requireUser } from "@/lib/supabase/server";
import { handle } from "@/lib/http";
import { KEPT } from "@/lib/fit";

/** Tri en lot : écarter (ou remettre à trier) plusieurs offres d'un coup. */
export async function POST(req: Request) {
  return handle(async () => {
    const { supabase } = await requireUser();
    const { ids, decision, reason } = (await req.json()) as { ids: string[]; decision: "reject" | "restore" | "keep"; reason?: string };
    const list = (ids ?? []).slice(0, 500);
    if (!list.length) return { ok: true, count: 0 };
    const now = new Date().toISOString();
    if (decision === "keep") {
      // Offres masquées par le filtre « adapté à mon profil » que la personne veut garder : « garde » empêche de les re-masquer
      await supabase.from("recommendations").update({ status: "new", reject_reason: KEPT }).in("id", list).eq("status", "filtered");
      return { ok: true, count: list.length };
    }
    const { data: rows } = await supabase.from("recommendations").select("id, offer_id").in("id", list);
    const offerIds = (rows ?? []).map((r) => r.offer_id).filter(Boolean) as string[];
    if (decision === "reject") {
      await supabase.from("recommendations").update({ status: "rejected", reject_reason: reason ?? "score_bas", decided_at: now }).in("id", list);
      if (offerIds.length) await supabase.from("offers").update({ decision: "rejected", reject_reason: reason ?? "score_bas" }).in("id", offerIds);
    } else {
      await supabase.from("recommendations").update({ status: "new", reject_reason: null, decided_at: null }).in("id", list).is("offer_id", null);
      await supabase.from("recommendations").update({ status: "analyzed", reject_reason: null, decided_at: null }).in("id", list).not("offer_id", "is", null);
      if (offerIds.length) await supabase.from("offers").update({ decision: null, reject_reason: null }).in("id", offerIds);
    }
    return { ok: true, count: list.length };
  });
}
