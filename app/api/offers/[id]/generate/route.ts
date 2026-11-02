import { requireUser, HttpError } from "@/lib/supabase/server";
import { handle } from "@/lib/http";
import { getProfile } from "@/lib/profile";
import { generateCv, generateLetter, generatePrep } from "@/lib/ai";
import type { CvDoc, OfferExtract } from "@/lib/types";
import { letterTemplateFor } from "@/lib/letter";
import { spendAi, AI_COST } from "@/lib/quota";
import { pickApplication } from "@/lib/app-pick";

export const maxDuration = 60;

const low = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Part des mots-clés de l'offre déjà couverts par un CV existant */
function coverage(cv: CvDoc, offer: OfferExtract) {
  const blob = low(JSON.stringify(cv));
  const kws = [...new Set([...(offer.keywords ?? []), ...(offer.must_have ?? [])].map(low))].filter((k) => k.length > 1);
  if (!kws.length) return 0;
  return Math.round((kws.filter((k) => blob.includes(k)).length / kws.length) * 100);
}

type Body = {
  kind: "cv" | "lettre" | "prep";
  variant?: string;
  template?: string;
  reuse_id?: string; // réutiliser ce CV
  force_new?: boolean; // ignorer la suggestion de réutilisation
};

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(52_000, async () => {
    const { id } = await ctx.params;
    const { supabase, user } = await requireUser();
    const body = (await req.json()) as Body;
    const { data: offer } = await supabase.from("offers").select("*").eq("id", id).single();
    if (!offer) throw new HttpError(404, "Offre introuvable");
    const profile = await getProfile(supabase, user);
    const variant = body.variant || offer.analysis?.recommended_variant || profile.targets[0]?.id || "general";
    const template = body.template || offer.analysis?.recommended_template || "compact";
    const { data: appRows } = await supabase.from("applications").select("id, status").eq("offer_id", id).limit(20);
    const app = pickApplication(appRows);

    if (body.kind === "cv") {
      // 1) Réutilisation explicite d'un CV existant
      if (body.reuse_id) {
        const { data: src } = await supabase.from("documents").select("*").eq("id", body.reuse_id).single();
        if (!src) throw new HttpError(404, "CV source introuvable");
        const { data, error } = await supabase.from("documents").insert({
          user_id: user.id, offer_id: id, application_id: app?.id ?? null, kind: "cv",
          variant: src.variant, template: body.template || src.template, content: src.content, reused_from: src.id,
        }).select("id").single();
        if (error) throw error;
        if (app) await supabase.from("applications").update({ cv_variant: src.variant }).eq("id", app.id);
        return { id: data.id };
      }

      // 2) Un CV déjà généré couvre-t-il assez cette offre ?
      if (!body.force_new) {
        const { data: existing } = await supabase
          .from("documents").select("id, variant, template, content, offer_id, offers(company, title)")
          .eq("kind", "cv").eq("variant", variant).neq("offer_id", id).order("created_at", { ascending: false }).limit(30);
        const best = (existing ?? [])
          .map((d) => ({ d, cov: coverage(d.content as CvDoc, offer.extracted) }))
          .sort((a, b) => b.cov - a.cov)[0];
        if (best && best.cov >= 75) {
          const o = best.d.offers as unknown as { company: string; title: string } | null;
          return {
            reuse_candidate: {
              id: best.d.id,
              coverage: best.cov,
              template: best.d.template,
              made_for: o ? `${o.title} chez ${o.company}` : "une autre offre",
            },
          };
        }
      }
    }

    // La lettre part avec le CV de la même offre : même modèle (ou son équivalent) et même titre sous le nom
    let letterTemplate: string | null = null, headline = "";
    if (body.kind === "lettre") {
      const { data: cv } = await supabase.from("documents").select("template, content").eq("offer_id", id).eq("kind", "cv").order("created_at", { ascending: false }).limit(1).maybeSingle();
      headline = (cv?.content as CvDoc | undefined)?.headline || profile.targets.find((t) => t.id === variant)?.title || offer.title || "";
      letterTemplate = letterTemplateFor(cv?.template ?? body.template ?? offer.analysis?.recommended_template);
    }

    await spendAi(supabase, user, body.kind === "cv" ? AI_COST.cv : AI_COST.document);
    const content =
      body.kind === "cv"
        ? await generateCv(profile, offer.extracted, offer.analysis, variant)
        : body.kind === "lettre"
          ? await generateLetter(profile, offer.extracted, offer.analysis, { headline })
          : await generatePrep(profile, offer.extracted, offer.analysis);

    const { data, error } = await supabase
      .from("documents")
      .insert({
        user_id: user.id, offer_id: id, application_id: app?.id ?? null, kind: body.kind,
        variant: body.kind === "cv" ? variant : null, template: body.kind === "cv" ? template : letterTemplate, content,
      })
      .select("id")
      .single();
    if (error) throw error;
    if (body.kind === "cv" && app) await supabase.from("applications").update({ cv_variant: variant }).eq("id", app.id);
    return { id: data.id };
  });
}
