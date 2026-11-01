import { requireUser, HttpError } from "@/lib/supabase/server";
import { handle } from "@/lib/http";
import { pingProviders, modelInfo } from "@/lib/llm";
import { spendAi, AI_COST } from "@/lib/quota";

export const maxDuration = 30;

/** Petit appel de test, fournisseur par fournisseur : la clé fonctionne-t-elle, le quota est-il épuisé, en combien de temps ça répond ? */
export async function POST() {
  return handle(25_000, async () => {
    const { supabase, user } = await requireUser();
    await spendAi(supabase, user, AI_COST.test);
    const t0 = Date.now();
    const providers = await pingProviders();
    if (!providers.length) throw new HttpError(500, "Aucune clé IA configurée.");
    if (providers.every((p) => !p.ok)) throw new HttpError(503, providers.map((p) => `${p.name} : ${p.error}`).join(" · "));
    return { ok: true, ms: Date.now() - t0, providers, ...modelInfo() };
  });
}
