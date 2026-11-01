import { requireUser } from "@/lib/supabase/server";
import { handle } from "@/lib/http";
import { computeStats } from "@/lib/stats";
import { getProfile } from "@/lib/profile";
import { generateInsights } from "@/lib/ai";
import { spendAi, AI_COST } from "@/lib/quota";

export const maxDuration = 60;

export async function POST() {
  return handle(52_000, async () => {
    const { supabase, user } = await requireUser();
    await spendAi(supabase, user, AI_COST.insights);
    const [stats, profile] = await Promise.all([computeStats(supabase), getProfile(supabase, user)]);
    const content = await generateInsights(stats, profile);
    await supabase.from("insights").insert({ user_id: user.id, content: { ...content, sample: stats.totals.sent } });
    return { ok: true };
  });
}
