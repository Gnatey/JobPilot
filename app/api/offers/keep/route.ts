import { requireUser, HttpError } from "@/lib/supabase/server";
import { handle } from "@/lib/http";
import { cleanAdText, planKeep } from "@/lib/offer-keep";
import { SetupError, keepOffer, keepOnLine, readLineText } from "@/lib/offer-keep-db";
import { recoText } from "@/lib/reco-text";
import { normalizeJobUrl } from "@/lib/fetch-offer";

export const dynamic = "force-dynamic";

/**
 * « Garder pour plus tard » : range une offre, ou le texte de son annonce, SANS l'analyser (aucun appel d'IA, donc aucune action IA dépensée).
 * Le texte reste attaché à SA ligne « À analyser » d'Offres & CV (table `application_texts`), et rien n'est créé dans Recommandées.
 * Avec `app_id` (ligne ouverte depuis Offres & CV) : le texte va sur cette ligne. Sans : la ligne est retrouvée par son adresse, sinon créée.
 * Jamais de doublon. La logique est dans lib/offer-keep-db.ts (testée).
 */
export async function POST(req: Request) {
  return handle(async () => {
    const { supabase, user } = await requireUser();
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    try {
      if (typeof body.app_id === "string" && body.app_id) {
        const r = await keepOnLine(supabase, user, body.app_id, cleanAdText(body.text));
        if (r.outcome === "missing") throw new HttpError(404, r.message);
        return r;
      }
      const planned = planKeep(body);
      if (!planned.ok) throw new HttpError(400, planned.error);
      return await keepOffer(supabase, user, planned.plan);
    } catch (e) {
      if (e instanceof SetupError) throw new HttpError(409, e.message);
      throw e;
    }
  });
}

/**
 * Le texte déjà gardé pour une ligne (`?app=…`), pour le remettre dans la zone de texte quand on rouvre la ligne.
 * À défaut, le texte rangé par l'ancienne version de « Garder » dans la recommandation de même adresse (livrée le matin du 7 novembre).
 */
export async function GET(req: Request) {
  return handle(async () => {
    const { supabase } = await requireUser();
    const appId = new URL(req.url).searchParams.get("app");
    if (!appId) throw new HttpError(400, "Ligne manquante.");
    const own = await readLineText(supabase, appId);
    if (own) return { text: own };
    const { data: line } = await supabase.from("applications").select("url").eq("id", appId).maybeSingle();
    const url = (line as { url?: string | null } | null)?.url;
    if (!url) return { text: "" };
    const { data: recos } = await supabase.from("recommendations").select("origin, snippet").eq("origin", "page").in("url", [...new Set([url, normalizeJobUrl(url)])]).limit(5);
    const best = ((recos ?? []) as { origin: string; snippet: string | null }[]).map((r) => recoText(r)).sort((a, b) => b.length - a.length)[0] ?? "";
    return { text: best };
  });
}
