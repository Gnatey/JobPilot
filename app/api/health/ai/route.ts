import { requireUser } from "@/lib/supabase/server";
import { handle } from "@/lib/http";
import { structured, modelInfo } from "@/lib/llm";
import { spendAi, AI_COST } from "@/lib/quota";

export const maxDuration = 30;

/** Petit appel de test pour vérifier que la clé IA fonctionne et que le quota n'est pas épuisé. */
export async function POST() {
  return handle(25_000, async () => {
    const { supabase, user } = await requireUser();
    await spendAi(supabase, user, AI_COST.test);
    const t0 = Date.now();
    await structured<{ ok: boolean }>({ fast: true, maxTokens: 50, system: "Réponds ok=true.", prompt: "ping", schema: { properties: { ok: { type: "boolean" } }, required: ["ok"] } });
    return { ok: true, ms: Date.now() - t0, ...modelInfo() };
  });
}
