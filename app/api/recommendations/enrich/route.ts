import { requireUser } from "@/lib/supabase/server";
import { handle } from "@/lib/http";
import { getProfile } from "@/lib/profile";
import { computeLearning } from "@/lib/learning";
import { quickScore } from "@/lib/quick-score";
import { tidyText, usableJobText } from "@/lib/reco-text";
import { READING } from "@/lib/reco-import";
import { hasPostedColumn } from "@/lib/posted-db";
import { postedFromText } from "@/lib/posted";

export const maxDuration = 30;

type Body = { items?: { id?: unknown; text?: unknown }[] };

/**
 * Complète des offres recommandées avec le texte de l'annonce, lu par la personne dans son propre navigateur.
 * Le pré-score est recalculé sur l'annonce entière (gratuit, sans IA) : il devient bien plus fiable que sur le seul titre.
 * Une offre prise sur une page et restée « en lecture » (invisible) devient « À trier » dès que son annonce est lue en entier (lib/reco-import.ts).
 */
export async function POST(req: Request) {
  return handle(25_000, async () => {
    const { supabase, user } = await requireUser();
    const body = (await req.json().catch(() => ({}))) as Body;
    const items = (Array.isArray(body.items) ? body.items : [])
      .map((i) => ({ id: typeof i?.id === "string" ? i.id : "", text: typeof i?.text === "string" ? tidyText(i.text).slice(0, 4000) : "" }))
      .filter((i) => i.id && usableJobText(i.text))
      .slice(0, 20);
    if (!items.length) return { updated: [] };

    const [profile, learning] = await Promise.all([getProfile(supabase, user), computeLearning(supabase, user.id)]);
    const withPosted = await hasPostedColumn(supabase);
    const { data: rows } = await supabase.from("recommendations").select("id, title, company, location, offer_id, status, origin").in("id", items.map((i) => i.id)).eq("user_id", user.id);

    const updated: { id: string; score: number; senior: boolean; analyzed: boolean }[] = [];
    for (const r of rows ?? []) {
      const text = items.find((i) => i.id === r.id)?.text;
      if (!text) continue;
      const q = quickScore(profile, r.title ?? "", `${text} ${r.location ?? ""}`, learning, r.company ?? "");
      // Date de publication écrite en tête de la page (« Publiée il y a 3 jours », ligne LinkedIn « Il y a 3 jours ») : lue, jamais devinée ; une date déjà donnée par une source de recherche n'est pas touchée
      const posted = withPosted && r.origin !== "search" ? postedFromText(text) : null;
      const patch = { snippet: text, quick_score: q.score, matched: q.matched, senior: q.senior, ...(posted ? { posted_at: posted } : {}) };
      await supabase.from("recommendations").update(r.status === READING ? { ...patch, status: "new" } : patch).eq("id", r.id).eq("user_id", user.id);
      updated.push({ id: r.id, score: q.score, senior: q.senior, analyzed: !!r.offer_id });
    }
    return { updated };
  });
}
