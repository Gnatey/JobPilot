import { requireUser, HttpError } from "@/lib/supabase/server";
import { handle } from "@/lib/http";
import { getProfile } from "@/lib/profile";
import { extractPageOffers } from "@/lib/ai";
import { computeLearning } from "@/lib/learning";
import { quickScore } from "@/lib/quick-score";
import { spendAi, AI_COST } from "@/lib/quota";
import { detectSource, normalizeJobUrl, httpUrlOrNull } from "@/lib/fetch-offer";

export const maxDuration = 60;

type Body = { url?: string; title?: string; page?: string; links?: { t?: string; h?: string }[] };

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
const clip = (s: unknown, n: number) => (typeof s === "string" ? s.trim().slice(0, n) : "");

/**
 * Une page de résultats vue dans le navigateur de la personne (envoyée par le favori) :
 * on en tire toutes les offres, on les note gratuitement et on les range dans « Recommandées ».
 * Aucune lecture automatique du site : c'est la personne qui a ouvert la page.
 */
export async function POST(req: Request) {
  return handle(52_000, async () => {
    const { supabase, user } = await requireUser();
    const body = (await req.json()) as Body;
    const pageUrl = httpUrlOrNull(clip(body.url, 2000) ?? "") ?? "";
    const page = clip(body.page, 30000);
    if (page.length < 200) throw new HttpError(400, "La page reçue est presque vide. Attends qu'elle soit entièrement chargée, puis reclique sur le favori.");

    const links = (Array.isArray(body.links) ? body.links : [])
      .slice(0, 150)
      .map((l) => ({ t: clip(l?.t, 160), h: httpUrlOrNull(clip(l?.h, 1500) ?? "") ?? "" }))
      .filter((l) => l.t && l.h);
    const allowed = new Set(links.map((l) => l.h));

    await spendAi(supabase, user, AI_COST.search);
    const [profile, learning] = await Promise.all([getProfile(supabase, user), computeLearning(supabase, user.id)]);
    const found = await extractPageOffers(pageUrl, clip(body.title, 200), page, links);

    let host = "";
    try { host = new URL(pageUrl).hostname.replace(/^www\./, ""); } catch { /* adresse absente */ }
    const detected = detectSource(pageUrl);
    const source = detected === "Site entreprise" || detected === "texte" ? host || "Page web" : detected;

    const seen = new Set<string>();
    const rows = [];
    for (const o of found) {
      const url = o.url && allowed.has(o.url) ? normalizeJobUrl(o.url) : ""; // jamais un lien inventé par l'IA
      const key = url ? url.toLowerCase() : `${norm(o.title)}|${norm(o.company)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const q = quickScore(profile, o.title, `${o.snippet} ${o.location}`, learning, o.company);
      rows.push({
        user_id: user.id, origin: "page", source, dedupe_key: key,
        title: clip(o.title, 200), company: clip(o.company, 120), location: clip(o.location, 120),
        url: url || null, snippet: clip(o.snippet, 280), quick_score: q.score, matched: q.matched, senior: q.senior,
        received_at: new Date().toISOString(),
      });
    }

    let added = 0;
    let items: { id: string; url: string; title: string }[] = [];
    if (rows.length) {
      const { data, error } = await supabase.from("recommendations").upsert(rows, { onConflict: "user_id,dedupe_key", ignoreDuplicates: true }).select("id");
      if (error) throw error;
      added = data?.length ?? 0;
      // À lire en entier : les offres de cette page dont on n'a encore que le titre (nouvelles, ou déjà connues mais jamais lues)
      const { data: known } = await supabase.from("recommendations").select("id, url, title, snippet, offer_id, status").in("dedupe_key", rows.map((r) => r.dedupe_key));
      items = (known ?? [])
        .filter((d) => d.url && !d.offer_id && ["new", "analyzed"].includes(d.status) && (d.snippet ?? "").length < 300)
        .map((d) => ({ id: d.id, url: d.url as string, title: (d.title as string) ?? "" }));
    }
    return { found: rows.length, added, already: rows.length - added, source, items };
  });
}
