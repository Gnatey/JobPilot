import { requireUser } from "@/lib/supabase/server";
import { handle } from "@/lib/http";
import { getProfile } from "@/lib/profile";
import { quickScore } from "@/lib/quick-score";
import { computeLearning } from "@/lib/learning";
import { searchAll, externalId } from "@/lib/sources";
import { sanitizeCriteria } from "@/lib/sources/criteria";
import { spendAi, AI_COST } from "@/lib/quota";

export const maxDuration = 60;

export async function POST(req: Request) {
  return handle(async () => {
    const { supabase, user } = await requireUser();
    const criteria = sanitizeCriteria(await req.json().catch(() => ({})));
    // Les sources gratuites ont un quota quotidien partagé : une recherche compte dans les actions du jour
    await spendAi(supabase, user, AI_COST.search);
    const [found, profile, learning] = await Promise.all([searchAll(criteria), getProfile(supabase, user), computeLearning(supabase, user.id)]);
    const keys = found.offers.map((o) => o.key);
    const known = new Map<string, string>();
    const decided = new Map<string, string>();
    for (let i = 0; i < keys.length; i += 150) {
      const chunk = keys.slice(i, i + 150);
      const [{ data: offers }, { data: recos }] = await Promise.all([
        supabase.from("offers").select("id, external_id").in("external_id", chunk.map(externalId)),
        supabase.from("recommendations").select("dedupe_key, status").in("dedupe_key", chunk),
      ]);
      for (const o of offers ?? []) known.set(o.external_id, o.id);
      for (const r of recos ?? []) decided.set(r.dedupe_key, r.status);
    }
    return {
      sources: found.sources,
      results: found.offers
        .map((o) => {
          const q = quickScore(profile, o.title, `${o.experience} ${o.description}`, learning, o.company);
          return { ...o, quick_score: q.score, matched: q.matched, penalties: q.penalties, offer_id: known.get(externalId(o.key)) ?? null, decision: decided.get(o.key) ?? null };
        })
        .filter((o) => o.decision !== "rejected")
        .sort((a, b) => b.quick_score - a.quick_score),
    };
  });
}
