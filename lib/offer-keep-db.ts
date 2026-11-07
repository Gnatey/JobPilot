/**
 * « Garder pour plus tard », côté base : crée ou complète la recommandation et la ligne « À analyser », sans jamais dupliquer.
 * Séparé de la route pour être testé avec une fausse base (tests/offer-keep-db.test.ts). Aucun appel d'IA : le pré-score vient de `score`, qui est gratuit.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureApplication } from "./offer-ops";
import { MIN_TEXT, UNTITLED, keepMessage, type KeepOutcome, type KeepPlan, type TextState } from "./offer-keep";

type User = { id: string; email?: string | null };
export type ScoreFn = (title: string, text: string, company: string) => Promise<{ quick_score: number; matched: string[]; senior: boolean }>;
export type KeepResult = { outcome: KeepOutcome; title: string; message: string; id?: string; appId?: string; textAdded?: boolean; text?: TextState };
type RecoRow = { id: string; status: string; url: string | null; snippet: string | null; title: string | null; company: string | null; offer_id: string | null };

export async function keepOffer(supabase: SupabaseClient, user: User, plan: KeepPlan, score: ScoreFn): Promise<KeepResult> {
  const urls = [...new Set([plan.url, plan.rawUrl].filter((x): x is string => !!x))];
  let title = plan.title;
  const done = (outcome: KeepOutcome, extra: { id?: string; appId?: string; text?: TextState } = {}): KeepResult => ({
    outcome, title, message: keepMessage(outcome, title, extra.text), ...extra, textAdded: extra.text === "added" || extra.text === "replaced",
  });

  // Déjà analysée : on la rouvre
  if (urls.length) {
    const { data: offer } = await supabase.from("offers").select("id").in("url", urls).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (offer) return done("analyzed", { id: offer.id as string });
  }
  const recoCols = "id, status, url, snippet, title, company, offer_id";
  let reco = (await supabase.from("recommendations").select(recoCols).eq("dedupe_key", plan.key).maybeSingle()).data as RecoRow | null;
  // Une offre reçue par e-mail ou par une recherche automatique n'a pas toujours la clé de son adresse (clé « az:… », ancienne adresse de suivi) :
  // on la retrouve aussi par son adresse, sinon le texte apporté partirait dans une 2e recommandation que « Tout analyser » ne lirait jamais.
  if (!reco && urls.length) {
    const { data: same } = await supabase.from("recommendations").select(recoCols).in("url", urls).order("created_at", { ascending: true }).limit(10);
    const rows = (same ?? []) as RecoRow[];
    reco = rows.find((r) => r.offer_id) ?? rows.find((r) => r.status === "accepted") ?? rows[0] ?? null;
  }
  if (reco?.offer_id) return done("analyzed", { id: reco.offer_id as string });

  // Ligne déjà dans la liste ? (par l'adresse ; sans adresse, par le poste et l'entreprise de la recommandation retrouvée par son texte)
  let existing: { id: string; status: string; applied_at: string | null; offer_id: string | null } | null = null;
  const cols = "id, status, applied_at, offer_id";
  if (urls.length) {
    existing = (await supabase.from("applications").select(cols).in("url", urls).order("created_at", { ascending: true }).limit(1).maybeSingle()).data;
  } else if (reco) {
    existing = (await supabase.from("applications").select(cols).eq("title", reco.title ?? "").eq("company", reco.company || "Entreprise ?").eq("status", "a_postuler").is("offer_id", null).limit(1).maybeSingle()).data;
  }
  const loose = !!existing && existing.status === "a_postuler" && !existing.offer_id && !existing.applied_at;
  if (existing && !loose) return done("tracked", { appId: existing.id });

  // Une recommandation déjà connue garde son poste et son entreprise (c'est par eux qu'on la rapproche de sa ligne, quand il n'y a pas de lien)
  const company = reco ? (reco.company ?? "") : plan.company;
  if (reco?.title) title = reco.title;
  // Le titre d'une annonce collée sans lien doit rester unique : « Data analyst » deux fois, de deux entreprises, ne doit pas se rapprocher du mauvais texte
  else if (!plan.url) {
    const { count } = await supabase.from("applications").select("id", { count: "exact", head: true }).eq("title", title).eq("company", company || "Entreprise ?");
    if (count) title = `${title} (${count + 1})`;
  }

  // Recommandation : porte le texte de l'annonce et le pré-score (gratuit, sans IA). « Garder » vaut « Je candidate » : elle passe en acceptée.
  const now = new Date().toISOString();
  // Le texte que la personne apporte fait foi : il remplace celui qu'on avait (un extrait d'alerte, une recherche, un ancien collage),
  // même s'il est plus court. Seul un texte trop court pour servir (< 150 signes) est écarté, et on le lui dit.
  const old = (reco?.snippet ?? "").trim();
  const text: TextState = !plan.text ? "none" : plan.text.length < MIN_TEXT ? "short" : plan.text.trim() === old ? "same" : old ? "replaced" : "added";
  const store = text === "added" || text === "replaced";
  const scored = store ? await score(title === UNTITLED ? "" : title, plan.text, company) : null;
  if (reco) {
    const { error } = await supabase.from("recommendations").update({
      status: "accepted", reject_reason: null, decided_at: now,
      ...(store ? { snippet: plan.text, ...scored } : {}),
      ...(!reco.url && plan.url ? { url: plan.url } : {}),
    }).eq("id", reco.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("recommendations").insert({
      user_id: user.id, origin: "page", source: plan.site, dedupe_key: plan.key, title, company, url: plan.url,
      snippet: store ? plan.text : null, ...(scored ?? {}), status: "accepted", decided_at: now, received_at: now,
    });
    if (error) throw error;
  }

  if (loose && existing) return done("exists", { appId: existing.id, text });

  const appId = await ensureApplication(supabase, user, { company, title, url: plan.url, channel: plan.site === "texte" ? null : plan.site }, "a_postuler");
  return done("kept", { appId, text });
}
