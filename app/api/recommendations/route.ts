import { requireUser, HttpError } from "@/lib/supabase/server";
import { handle } from "@/lib/http";
import { getProfile } from "@/lib/profile";
import { quickScore } from "@/lib/quick-score";
import { computeLearning } from "@/lib/learning";
import { httpUrlOrNull } from "@/lib/fetch-offer";

type Item = { key?: string; id?: string; source?: string; title?: string; company?: string; location?: string; url?: string; description?: string; experience?: string; date?: string };

const KEY = /^(ft|az|jb):[A-Za-z0-9_.-]{1,100}$/;
const SOURCE_BY_PREFIX: Record<string, string> = { ft: "France Travail", az: "Adzuna", jb: "Jooble" };
const clip = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");

/** « Stocker » des résultats de recherche dans les Recommandées. Renvoie l'id de chaque offre stockée, par clé. */
export async function POST(req: Request) {
  return handle(async () => {
    const { supabase, user } = await requireUser();
    const { items } = (await req.json().catch(() => ({}))) as { items?: Item[] };
    if (!Array.isArray(items) || !items.length) throw new HttpError(400, "Aucune offre à ranger.");
    const [profile, learning] = await Promise.all([getProfile(supabase, user), computeLearning(supabase, user.id)]);
    const rows = items.slice(0, 100).flatMap((o) => {
      const key = clip(o.key, 120) || (o.id ? `ft:${clip(o.id, 100)}` : ""); // anciens écrans : identifiant France Travail nu
      const url = httpUrlOrNull(o.url);
      if (!KEY.test(key) || !clip(o.title, 300) || !url) return [];
      const description = clip(o.description, 4000);
      const q = quickScore(profile, clip(o.title, 300), `${clip(o.experience, 200)} ${description}`, learning, clip(o.company, 200));
      return [{
        user_id: user.id, origin: "search", source: clip(o.source, 40) || SOURCE_BY_PREFIX[key.slice(0, 2)], dedupe_key: key,
        title: clip(o.title, 300), company: clip(o.company, 200), location: clip(o.location, 200), url, snippet: description,
        quick_score: q.score, matched: q.matched, senior: q.senior, received_at: clip(o.date, 40) || new Date().toISOString(),
      }];
    });
    if (!rows.length) throw new HttpError(400, "Offre illisible : relance la recherche.");
    await supabase.from("recommendations").upsert(rows, { onConflict: "user_id,dedupe_key", ignoreDuplicates: true });
    const { data } = await supabase.from("recommendations").select("id, dedupe_key").in("dedupe_key", rows.map((r) => r.dedupe_key));
    return { ids: Object.fromEntries((data ?? []).map((r) => [r.dedupe_key, r.id])) };
  });
}
