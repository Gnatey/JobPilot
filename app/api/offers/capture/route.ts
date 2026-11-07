import { requireUser, HttpError } from "@/lib/supabase/server";
import { handle } from "@/lib/http";
import { getProfile } from "@/lib/profile";
import { extractPageOffers } from "@/lib/ai";
import { computeLearning } from "@/lib/learning";
import { quickScore } from "@/lib/quick-score";
import { spendAi, AI_COST } from "@/lib/quota";
import { detectSource, normalizeJobUrl, httpUrlOrNull } from "@/lib/fetch-offer";
import { fetchAll } from "@/lib/paged";
import { planImport, isLenientPage, READING, type FoundOffer, type KnownReco, type SeenJob } from "@/lib/reco-import";

export const maxDuration = 60;

type Body = { url?: string; title?: string; page?: string; links?: { t?: string; h?: string }[] };

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
const clip = (s: unknown, n: number) => (typeof s === "string" ? s.trim().slice(0, n) : "");
const chunks = <T,>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

/**
 * Une page de résultats vue dans le navigateur de la personne (envoyée par le favori) :
 * on en tire les offres, on les note gratuitement et on les range.
 * Aucune lecture automatique du site : c'est la personne qui a ouvert la page.
 *
 * Règle (décidée par Juliana, 7 novembre) : rien d'incomplet dans « À trier ». Une offre prise sur une page est d'abord rangée « en lecture »
 * (statut invisible) ; elle devient visible quand son annonce a été lue en entier (route enrich). 30 lues au plus par import, les suivantes
 * sont reprises au clic suivant. Sauf LinkedIn : titre et extrait directement, comme avant. Voir lib/reco-import.ts.
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

    // Les offres de la page, sans doublon d'adresse (ni de titre + entreprise quand il n'y a pas d'adresse)
    const dedupe = new Set<string>();
    const offers: FoundOffer[] = [];
    for (const o of found) {
      const url = o.url && allowed.has(o.url) ? normalizeJobUrl(o.url) : ""; // jamais un lien inventé par l'IA
      const key = url ? url.toLowerCase() : `${norm(o.title)}|${norm(o.company)}`;
      if (dedupe.has(key)) continue;
      dedupe.add(key);
      offers.push({ key, url, title: clip(o.title, 200), company: clip(o.company, 120), location: clip(o.location, 120), snippet: clip(o.snippet, 280) });
    }

    // Ce que JobPilot connaît déjà : mêmes adresses (à reprendre ou à sauter), mêmes postes chez les mêmes entreprises (doublons)
    const lenient = isLenientPage(pageUrl);
    const known = new Map<string, KnownReco & { url: string | null; title: string | null }>();
    for (const c of chunks(offers.map((o) => o.key), 100)) {
      const { data, error } = await supabase.from("recommendations").select("id, dedupe_key, url, title, snippet, offer_id, status").eq("user_id", user.id).in("dedupe_key", c);
      if (error) throw error;
      for (const d of data ?? []) known.set(d.dedupe_key as string, { id: d.id, status: d.status, offer_id: d.offer_id, snippet: d.snippet, url: d.url, title: d.title });
    }
    let seen: SeenJob[] = [];
    if (!lenient) {
      const cols = "title, company, location";
      const [r, a, f] = await Promise.all([
        fetchAll<SeenJob>((x, y) => supabase.from("recommendations").select(cols).order("id").range(x, y)),
        fetchAll<SeenJob>((x, y) => supabase.from("applications").select(cols).order("id").range(x, y)),
        fetchAll<SeenJob>((x, y) => supabase.from("offers").select(cols).order("id").range(x, y)),
      ]);
      // Une lecture ratée ne doit pas laisser passer des doublons en silence : on s'arrête plutôt (le favori peut être recliqué)
      if (r.error || a.error || f.error) throw new HttpError(503, "Je n'ai pas pu vérifier les doublons. Reclique sur le favori dans un instant.");
      seen = [...r.data, ...a.data, ...f.data];
    }

    const plan = planImport({ pageUrl, offers, known, seen });
    const now = new Date().toISOString();
    const rows = plan.insert.map((o) => {
      const q = quickScore(profile, o.title, `${o.snippet} ${o.location}`, learning, o.company);
      return {
        user_id: user.id, origin: "page", source, dedupe_key: o.key, status: o.status,
        title: o.title, company: o.company, location: o.location,
        url: o.url || null, snippet: o.snippet, quick_score: q.score, matched: q.matched, senior: q.senior,
        received_at: now,
      };
    });

    let added = 0;
    const ids = new Map<string, string>(); // clé → identifiant, pour les offres rangées maintenant
    if (rows.length) {
      const { data, error } = await supabase.from("recommendations").upsert(rows, { onConflict: "user_id,dedupe_key", ignoreDuplicates: true }).select("id, dedupe_key");
      if (error) throw error;
      added = data?.length ?? 0;
      for (const d of data ?? []) ids.set(d.dedupe_key as string, d.id as string);
    }

    // À lire en entier par le navigateur de la personne : les offres nouvelles (« en lecture ») et celles déjà connues mais jamais lues
    const items = plan.readKeys.flatMap((k) => {
      const kn = known.get(k);
      const id = kn?.id ?? ids.get(k);
      const o = offers.find((x) => x.key === k);
      const url = kn?.url ?? o?.url ?? "";
      if (!id || !url) return [];
      return [{ id, url, title: kn?.title ?? o?.title ?? "", reading: (kn?.status ?? READING) === READING }];
    });
    const already = offers.filter((o) => known.has(o.key)).length;
    return { found: offers.length, added, already, source, items, lenient: plan.lenient, skipped: plan.skipped };
  });
}
