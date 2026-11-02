import type { SupabaseClient } from "@supabase/supabase-js";
import { today } from "./format";
import * as cheerio from "cheerio";
import { accessToken, fetchMeta, gmailEmail, listJobEmails } from "./gmail";
import { isOwnMail, matchApplication, nextStatus } from "./email-match";
import { analyzeOffer, classifyEmails, extractAlertOffers, extractOffer, generateCv } from "./ai";
import { quickScore } from "./quick-score";
import { fitCheck } from "./fit";
import { criteriaRoles, ensureFit } from "./fit-stock";
import { computeLearning } from "./learning";
import { getProfileById } from "./profile";
import { searchAll, hasSource, externalId, type SearchCriteria, type JobOffer } from "./sources";
import type { Profile } from "./types";
import type { Learning } from "./learning";
import { HttpError } from "./supabase/server";
import { timeLeft } from "./budget";
import { readOffer, detectSource, normalizeJobUrl, httpUrlOrNull } from "./fetch-offer";
import { recoText } from "./reco-text";
import { markRecoGone } from "./offer-ops";
import { splitRoles } from "./job-families";

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\b(sa|sas|group|groupe|france)\b/g, "").replace(/[^a-z0-9]/g, "");

const dedupeKey = (url: string, title: string, company: string) =>
  url ? normalizeJobUrl(url).toLowerCase() : `${norm(title)}|${norm(company)}`;

/* ---------- Corps complet d'un email (pour les alertes) ---------- */

type Part = { mimeType?: string; body?: { data?: string }; parts?: Part[] };
function findPart(p: Part, mime: string): string | null {
  if (p.mimeType === mime && p.body?.data) return Buffer.from(p.body.data, "base64url").toString("utf8");
  for (const c of p.parts ?? []) {
    const r = findPart(c, mime);
    if (r) return r;
  }
  return null;
}
async function fetchBody(token: string, id: string) {
  const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) return "";
  const j = (await r.json()) as { payload: Part };
  const html = findPart(j.payload, "text/html");
  if (html) {
    const $ = cheerio.load(html);
    $("style, script").remove();
    $("a").each((_, a) => {
      const href = $(a).attr("href");
      if (href?.startsWith("http")) $(a).append(` [${href}] `);
    });
    return $("body").text().replace(/\s{2,}/g, " ").trim();
  }
  return findPart(j.payload, "text/plain") ?? "";
}

/* ---------- 1. Gmail : statuts + alertes ---------- */

export async function syncGmail(supabase: SupabaseClient, userId: string) {
  const { data: acc } = await supabase.from("gmail_accounts").select("*").eq("user_id", userId).maybeSingle();
  if (!acc) return { skipped: "gmail non connecté" };
  const [profile, learning] = await Promise.all([getProfileById(supabase, userId), computeLearning(supabase, userId)]);
  const token = await accessToken(acc.refresh_token);
  const since = acc.last_sync_at ? Math.max(2, Math.ceil((Date.now() - new Date(acc.last_sync_at).getTime()) / 864e5) + 1) : 30;
  const listed = await listJobEmails(token, Math.min(since, 180));

  const { data: known } = await supabase.from("emails").select("gmail_id").eq("user_id", userId).in("gmail_id", listed.map((m) => m.id).concat("_"));
  const knownSet = new Set((known ?? []).map((k) => k.gmail_id));
  const fresh = listed.filter((m) => !knownSet.has(m.id)).slice(0, 120);
  const fetched = (await Promise.all(fresh.map((m) => fetchMeta(token, m.id)))).filter((m) => m !== null);

  // Mes propres messages (envoyés, brouillons, écrits depuis mon adresse) ne sont jamais des réponses de recruteurs : rangés sans IA, sans toucher au suivi
  const own = (acc.email || (await gmailEmail(token).catch(() => null)) || "").toLowerCase();
  const metas = fetched.filter((m) => !isOwnMail(m, own));
  const mine = fetched.filter((m) => isOwnMail(m, own));
  if (mine.length) {
    await supabase.from("emails").upsert(
      mine.map((m) => ({ user_id: userId, gmail_id: m.id, thread_id: m.threadId, from_addr: m.from, subject: m.subject, snippet: m.snippet, received_at: m.date, category: "autre", application_id: null })),
      { onConflict: "user_id,gmail_id" }
    );
  }

  const { data: apps } = await supabase.from("applications").select("id, company, title, status, applied_at").eq("user_id", userId);
  const companies = (apps ?? []).map((a) => a.company);

  // Étapes courtes et reprenables : si le temps ou l'IA manque, on garde ce qui est lu, on le dit (`partial`) et la synchro suivante reprend là
  // (les emails déjà rangés sont ignorés, la date de dernière synchro n'avance pas tant que tout n'est pas lu).
  let partial = false, stopped: "ia" | undefined, read = 0, failed = 0;
  let classified: Awaited<ReturnType<typeof classifyEmails>> = [];
  for (let i = 0; i < metas.length; i += 40) {
    if (timeLeft() < 25_000) { partial = true; break; }
    const part = metas.slice(i, i + 40);
    const batch = part.map((m) => ({ id: m.id, from: m.from, subject: m.subject, snippet: m.snippet.slice(0, 300) }));
    try {
      classified = classified.concat(await classifyEmails(batch, companies));
      read += part.length;
    } catch (e) {
      if (!read) throw e; // rien de lu : l'erreur remonte telle quelle
      partial = true;
      if (aiBusy(e)) stopped = "ia";
      break;
    }
  }

  const byId = new Map(metas.map((m) => [m.id, m]));
  const ordered = classified
    .filter((c) => c.is_job_related)
    .sort((a, b) => (byId.get(a.id)?.date ?? "").localeCompare(byId.get(b.id)?.date ?? ""));

  let stored = 0, updated = 0, recommended = 0;
  let aiOff = stopped === "ia";
  for (const c of ordered) {
    const m = byId.get(c.id);
    if (!m) continue;
    // Candidature visée : même entreprise (mots entiers) ET, selon les cas, intitulé du poste reconnu. Au moindre doute : aucune.
    const app = c.category !== "alerte_offres"
      ? matchApplication(apps ?? [], { company: c.company || "", subject: m.subject, snippet: m.snippet, jobTitle: c.job_title, category: c.category })?.app
      : undefined;
    const store = async () => {
      await supabase.from("emails").upsert(
        { user_id: userId, gmail_id: m.id, thread_id: m.threadId, from_addr: m.from, subject: m.subject, snippet: m.snippet, received_at: m.date, category: c.category, application_id: app?.id ?? null },
        { onConflict: "user_id,gmail_id" }
      );
      stored++;
    };

    // Alerte emploi → offres recommandées. L'email n'est rangé qu'une fois ses offres lues : sinon, une lecture ratée la perdrait pour de bon.
    if (c.category === "alerte_offres") {
      if (aiOff || timeLeft() < 30_000) { partial = true; continue; }
      let offers: Awaited<ReturnType<typeof extractAlertOffers>> = [];
      try {
        const body = await fetchBody(token, m.id);
        offers = body ? await extractAlertOffers(m.from, m.subject, body) : [];
      } catch (e) {
        if (aiBusy(e) || (e instanceof HttpError && e.status === 504)) { partial = true; if (aiBusy(e)) { aiOff = true; stopped = "ia"; } continue; }
        failed++; // email illisible : rangé quand même pour ne pas être relu à chaque synchro
        await store();
        continue;
      }
      await store();
      const rows = offers.map((o) => {
        const q = quickScore(profile, o.title, `${o.snippet} ${o.location}`, learning, o.company);
        const url = httpUrlOrNull(o.url) ? normalizeJobUrl(o.url) : "";
        // Une alerte contient de tout (stages, alternances, métiers voisins) : ce qui n'est pas pour toi est rangé dans « Masquées », pas dans À trier
        const fit = fitCheck(profile, { title: o.title, text: `${o.snippet} ${o.location}` }, { roles: criteriaRoles(profile) });
        return {
          status: fit.ok ? "new" : "filtered", reject_reason: fit.ok ? null : fit.reason,
          user_id: userId, origin: "email", source: detectSource(url) === "Site entreprise" ? senderName(m.from) : detectSource(url),
          dedupe_key: dedupeKey(url, o.title, o.company), title: o.title, company: o.company, location: o.location,
          url: url || null, snippet: (o.snippet ?? "").slice(0, 280), quick_score: q.score, matched: q.matched, senior: q.senior, email_id: m.id, received_at: m.date,
        };
      });
      if (rows.length) {
        const { data } = await supabase.from("recommendations").upsert(rows, { onConflict: "user_id,dedupe_key", ignoreDuplicates: true }).select("id, status");
        recommended += (data ?? []).filter((d) => d.status === "new").length;
      }
      continue;
    }

    await store();
    if (!app) continue;
    const patch: Record<string, unknown> = { last_email_at: m.date };
    const target = nextStatus(app.status, c.category);
    if (target) {
      patch.status = target;
      app.status = target;
      if (target === "postule" && !app.applied_at) patch.applied_at = m.date.slice(0, 10);
      if (target === "refuse" || target === "offre") patch.next_action_at = null;
      if (target === "entretien" || target === "test") patch.next_action_at = today();
      updated++;
    }
    await supabase.from("applications").update(patch).eq("id", app.id);
  }

  if (!partial) await supabase.from("gmail_accounts").update({ last_sync_at: new Date().toISOString() }).eq("user_id", userId);
  return { scanned: read, stored, updated, recommended, ...(failed ? { failed } : {}), ...(partial ? { partial: true } : {}), ...(stopped ? { stopped } : {}) };
}

/** Quota atteint ou IA saturée : inutile d'insister auprès de l'IA pour la suite. */
const aiBusy = (e: unknown) => e instanceof HttpError && (e.status === 429 || e.status === 503);

function senderName(from: string) {
  return from.replace(/<.*>/, "").replace(/"/g, "").trim() || "Email";
}

/* ---------- 2. Recherches sauvegardées → recommandations ---------- */

export async function runSavedSearches(supabase: SupabaseClient, userId: string) {
  const { data: searches } = await supabase.from("searches").select("*").eq("user_id", userId).eq("auto", true);
  if (!searches?.length || !hasSource()) return { added: 0 };
  const [profile, learning] = await Promise.all([getProfileById(supabase, userId), computeLearning(supabase, userId)]);
  let added = 0, failed = 0, partial = false;
  for (const s of searches.slice(0, 6)) {
    if (timeLeft() < 20_000) { partial = true; break; }
    // Tâche du matin : peu de requêtes par recherche (les sources gratuites ont un quota quotidien partagé)
    const sc = s.criteria as SearchCriteria;
    const found = await searchAll({ ...sc, publishedWithin: "3" }, { maxRequests: 6 }).catch(() => null);
    if (!found) { failed++; continue; }
    added += await storeSearchOffers(supabase, userId, profile, learning, found.offers, sc);
  }
  return { added, ...(failed ? { failed } : {}), ...(partial ? { partial: true } : {}) };
}

/**
 * Range les offres trouvées par une recherche dans les recommandations (les déjà connues sont ignorées).
 * Ce qui n'est pas pour la personne (stage non demandé, métier éloigné) est rangé en « Masquées » au lieu de À trier.
 * Renvoie le nombre de nouvelles offres visibles dans À trier.
 */
export async function storeSearchOffers(supabase: SupabaseClient, userId: string, profile: Profile, learning: Learning, offers: JobOffer[], sc: SearchCriteria): Promise<number> {
  const rows = offers.map((o) => {
    const q = quickScore(profile, o.title, `${o.experience} ${o.description}`, learning, o.company);
    const fit = fitCheck(profile, { title: o.title, text: `${o.experience} ${o.description}` }, { roles: [...splitRoles(sc.keywords), ...criteriaRoles(profile)], contracts: sc.contracts });
    return {
      status: fit.ok ? "new" : "filtered", reject_reason: fit.ok ? null : fit.reason,
      user_id: userId, origin: "search", source: o.source, dedupe_key: o.key,
      title: o.title, company: o.company, location: o.location, url: o.url,
      snippet: o.description.slice(0, 4000), quick_score: q.score, matched: q.matched, senior: q.senior, received_at: o.date || new Date().toISOString(),
    };
  }).filter((r) => r.quick_score >= 30);
  if (!rows.length) return 0;
  const { data } = await supabase.from("recommendations").upsert(rows, { onConflict: "user_id,dedupe_key", ignoreDuplicates: true }).select("id, status");
  return (data ?? []).filter((d) => d.status === "new").length;
}

/* ---------- 3. Analyse automatique des meilleures offres ----------
 * Calcule le vrai score (IA) des meilleures recommandations pour que le tri soit fiable.
 * Ne génère PAS de CV ni de lettre : c'est toi qui décides (sauf AUTO_GENERATE_CV=true).
 */

/** `spend` : décompte d'une offre du quota IA de la personne (appel manuel) ; la tâche du matin n'en a pas. */
export async function autoPrepare(supabase: SupabaseClient, userId: string, spend?: () => Promise<void>): Promise<{ prepared: number; stopped?: "quota" | "ia" | "temps" }> {
  const limit = Number(process.env.AUTO_DAILY_LIMIT ?? 3);
  const minQuick = Number(process.env.AUTO_MIN_QUICK_SCORE ?? 55);
  if (!limit) return { prepared: 0 };
  const { data: recos } = await supabase
    .from("recommendations").select("*").eq("user_id", userId).eq("status", "new")
    .eq("senior", false).gte("quick_score", minQuick).order("quick_score", { ascending: false }).limit(limit * 3);
  const profile = await getProfileById(supabase, userId);
  let prepared = 0, failures = 0;
  for (const r of recos ?? []) {
    if (prepared >= limit || failures >= 2) break;
    if (timeLeft() < 60_000) return { prepared, stopped: "temps" }; // lecture + analyse : on n'en commence pas une sans le temps de la finir
    // Texte de l'offre : extrait de la source (s'il est assez long), sinon lecture de la page
    let text = recoText(r);
    if (text.length < 300 && r.url) {
      const read = await readOffer(r.url);
      if (read.gone) { await markRecoGone(supabase, r.id); continue; } // annonce retirée : elle quitte À trier toute seule
      text = read.text ?? "";
    }
    if (text.length < 300) continue;
    try {
      if (spend) await spend();
      const extracted = await extractOffer(text, r.url ?? undefined);
      const analysis = await analyzeOffer(profile, extracted);
      const { data: offer } = await supabase.from("offers").insert({
        user_id: userId, url: r.url, source: r.source, external_id: /^(ft|az|jb):/.test(r.dedupe_key) ? externalId(r.dedupe_key) : null,
        title: extracted.title || r.title, company: extracted.company || r.company, location: extracted.location || r.location,
        contract: extracted.contract, raw_text: text, extracted, analysis, score: analysis.score,
      }).select("id").single();
      if (!offer) continue;
      await supabase.from("recommendations").update({ status: "analyzed", offer_id: offer.id }).eq("id", r.id);
      if (process.env.AUTO_GENERATE_CV === "true" && analysis.score >= 70) {
        const cv = await generateCv(profile, extracted, analysis, analysis.recommended_variant);
        await supabase.from("documents").insert({
          user_id: userId, offer_id: offer.id, kind: "cv", variant: analysis.recommended_variant, template: analysis.recommended_template, content: cv,
        });
      }
      prepared++;
    } catch (e) {
      // Quota atteint ou IA saturée : on s'arrête là, inutile d'insister. Autre erreur : on passe à l'offre suivante.
      if (e instanceof HttpError && (e.status === 429 || e.status === 503)) return { prepared, stopped: spend && e.status === 429 && /limite d'actions/.test(e.message) ? "quota" : "ia" };
      failures++;
    }
  }
  return { prepared };
}

/** Avant la synchro : revoit les offres déjà reçues si ton profil ou ta recherche ont changé (sans effet sinon). */
export async function refitStock(supabase: SupabaseClient, userId: string) {
  return ensureFit(supabase, userId, await getProfileById(supabase, userId));
}
