/**
 * « Garder pour plus tard », côté base : crée la ligne « À analyser » si elle n'existe pas, et range le texte de l'annonce SUR cette ligne
 * (table `application_texts`), sans jamais dupliquer et sans rien créer dans Recommandées. Séparé de la route pour être testé avec une fausse base
 * (tests/offer-keep-db.test.ts). Aucun appel d'IA.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureApplication } from "./offer-ops";
import { isMissingTable } from "./db-missing";
import { MIN_TEXT, keepMessage, type KeepOutcome, type KeepPlan, type TextState } from "./offer-keep";

type User = { id: string; email?: string | null };
export type KeepResult = { outcome: KeepOutcome; title: string; message: string; id?: string; appId?: string; text?: TextState; textAdded?: boolean };
type LineRow = { id: string; title: string | null; status: string; applied_at: string | null; offer_id: string | null };

/** La table des textes n'existe pas encore : la mise à jour de la base n'a pas été lancée. */
export class SetupError extends Error {}
const SETUP = "Pour garder un texte, il faut d'abord mettre la base à jour : Administration › Installation (une fois, 1 minute).";

const LINE_COLS = "id, title, status, applied_at, offer_id";
const loose = (l: LineRow) => l.status === "a_postuler" && !l.offer_id && !l.applied_at;

function result(outcome: KeepOutcome, title: string, extra: { id?: string; appId?: string; text?: TextState } = {}): KeepResult {
  return { outcome, title, message: keepMessage(outcome, title, extra.text), ...extra, textAdded: extra.text === "added" || extra.text === "replaced" };
}

/** Vérifie que la table existe AVANT de créer quoi que ce soit : pas de ligne sans son texte si la base n'est pas à jour. */
async function needTable(supabase: SupabaseClient) {
  const { error } = await supabase.from("application_texts").select("application_id").limit(1);
  if (error && isMissingTable(error)) throw new SetupError(SETUP);
}

/** Le texte gardé sur une ligne ("" s'il n'y en a pas, ou si la table n'existe pas encore). */
export async function readLineText(supabase: SupabaseClient, appId: string): Promise<string> {
  const { data } = await supabase.from("application_texts").select("body").eq("application_id", appId).maybeSingle();
  return ((data as { body?: string } | null)?.body ?? "").trim();
}

/**
 * Range le texte sur la ligne. Le texte de la personne fait foi : il remplace celui qu'on avait, même plus court. Seul un texte trop court pour servir
 * (< 150 signes) est écarté, et on le lui dit.
 */
async function storeText(supabase: SupabaseClient, user: User, appId: string, text: string): Promise<TextState> {
  if (!text) return "none";
  if (text.length < MIN_TEXT) return "short";
  const old = await readLineText(supabase, appId);
  if (old === text.trim()) return "same";
  const { error } = await supabase.from("application_texts").upsert(
    { application_id: appId, user_id: user.id, body: text, updated_at: new Date().toISOString() },
    { onConflict: "application_id" },
  );
  if (error) { if (isMissingTable(error)) throw new SetupError(SETUP); throw error; }
  return old ? "replaced" : "added";
}

/**
 * Range le texte COLLÉ pour une analyse SUR la ligne, avant de dépenser de l'IA : si l'analyse échoue ensuite (IA saturée, limite du jour atteinte), le texte
 * reste sur la ligne au lieu d'être perdu (« le texte reste là, il ne va pas aller autre part »). Ne lève JAMAIS d'erreur et ne bloque rien : texte trop
 * court, ligne introuvable, déjà analysée ou déjà envoyée, table absente (base pas encore à jour) → rien n'est rangé et on le dit par `false`. Renvoie
 * `true` quand le texte est bien sur la ligne.
 */
export async function rememberLineText(supabase: SupabaseClient, user: User, appId: string, text: string): Promise<boolean> {
  try {
    if (text.trim().length < MIN_TEXT) return false;
    const { data } = await supabase.from("applications").select(LINE_COLS).eq("id", appId).maybeSingle();
    const line = data as LineRow | null;
    if (!line || line.offer_id || !loose(line)) return false;
    const state = await storeText(supabase, user, appId, text.trim());
    return state === "added" || state === "replaced" || state === "same";
  } catch {
    return false;
  }
}

/** « Garder » depuis une ligne d'Offres & CV ouverte (`?app=…`) : le texte va sur CETTE ligne, quelle que soit l'adresse. */
export async function keepOnLine(supabase: SupabaseClient, user: User, appId: string, text: string): Promise<KeepResult> {
  const { data } = await supabase.from("applications").select(LINE_COLS).eq("id", appId).maybeSingle();
  const line = data as LineRow | null;
  if (!line) return result("missing", "");
  const title = line.title || "Poste ?";
  if (line.offer_id) return result("analyzed", title, { id: line.offer_id, appId });
  if (!loose(line)) return result("tracked", title, { appId });
  if (text.length >= MIN_TEXT) await needTable(supabase);
  return result("exists", title, { appId, text: await storeText(supabase, user, appId, text) });
}

/** « Garder » depuis la page « Analyser une offre » (sans ligne ouverte) : retrouve la ligne par son adresse (ou son texte), sinon la crée. */
export async function keepOffer(supabase: SupabaseClient, user: User, plan: KeepPlan): Promise<KeepResult> {
  const urls = [...new Set([plan.url, plan.rawUrl].filter((x): x is string => !!x))];
  let title = plan.title;

  // Déjà analysée : on la rouvre
  if (urls.length) {
    const { data: offer } = await supabase.from("offers").select("id").in("url", urls).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (offer) return result("analyzed", title, { id: offer.id as string });
  }

  // Ligne déjà dans la liste ? Par l'adresse ; sans adresse, par le texte lui-même (la même annonce collée deux fois reste une seule ligne)
  let existing: LineRow | null = null;
  if (urls.length) {
    existing = (await supabase.from("applications").select(LINE_COLS).in("url", urls).order("created_at", { ascending: true }).limit(1).maybeSingle()).data as LineRow | null;
  } else if (plan.text) {
    const { data: same } = await supabase.from("application_texts").select("application_id").eq("body", plan.text).limit(1).maybeSingle();
    const id = (same as { application_id?: string } | null)?.application_id;
    if (id) existing = (await supabase.from("applications").select(LINE_COLS).eq("id", id).maybeSingle()).data as LineRow | null;
  }
  if (existing && existing.offer_id) return result("analyzed", existing.title || title, { id: existing.offer_id, appId: existing.id });
  if (existing && !loose(existing)) return result("tracked", existing.title || title, { appId: existing.id });

  if (plan.text.length >= MIN_TEXT) await needTable(supabase);

  if (existing) return result("exists", existing.title || title, { appId: existing.id, text: await storeText(supabase, user, existing.id, plan.text) });

  // Le titre d'une annonce collée sans lien doit rester unique : « Data analyst » deux fois, de deux entreprises, ne doit pas se confondre
  if (!plan.url) {
    const { count } = await supabase.from("applications").select("id", { count: "exact", head: true }).eq("title", title).eq("company", plan.company || "Entreprise ?");
    if (count) title = `${title} (${count + 1})`;
  }
  const appId = await ensureApplication(supabase, user, { company: plan.company, title, url: plan.url, channel: plan.site === "texte" ? null : plan.site }, "a_postuler");
  return result("kept", title, { appId, text: await storeText(supabase, user, appId, plan.text) });
}
