// « Garder pour plus tard » côté base (lib/offer-keep-db.ts), avec une fausse base en mémoire.
// Le texte d'une annonce reste attaché à SA ligne « À analyser » (table application_texts) : jamais de doublon, jamais d'IA, rien dans Recommandées.
import { fakeSupabase, type Row } from "./fake-supabase";
import { SetupError, keepOffer, keepOnLine, readLineText } from "../lib/offer-keep-db";
import { cleanAdText, planKeep, UNTITLED } from "../lib/offer-keep";
import { isMissingTable } from "../lib/db-missing";
import { buildQueue, type QueueApp, type QueueReco } from "../lib/analyze-queue";
import { ok, done } from "./helpers";

const user = { id: "u1", email: "juliana@exemple.fr" };
const ad = "Nous recherchons un data analyst pour construire des tableaux de bord et fiabiliser les données de l'entreprise. ".repeat(4);
const plan = (i: Parameters<typeof planKeep>[0]) => { const r = planKeep(i); if (!r.ok) throw new Error(r.error); return r.plan; };
const fresh = (seed: Record<string, Row[]> = {}, missing: string[] = []) => fakeSupabase(seed, {}, { missing });
const URL1 = "https://www.hellowork.com/fr-fr/emplois/82945204.html";
const URL2 = "https://fr.indeed.com/viewjob?jk=abc123";
const lineOf = (extra: Record<string, unknown> = {}) => ({ id: "a1", user_id: "u1", url: URL2, title: "Data analyst", company: "Acme", status: "a_postuler", applied_at: null, offer_id: null, ...extra });
const textOf = (tables: Record<string, Row[]>, appId = "a1") => String(tables.application_texts?.find((t) => t.application_id === appId)?.body ?? "");
const queueOf = (tables: Record<string, Row[]>) => buildQueue(
  tables.applications.map((a) => ({ ...(a as unknown as QueueApp), has_text: !!tables.application_texts?.some((t) => t.application_id === a.id) })),
  (tables.recommendations ?? []) as unknown as QueueReco[],
);

// ---------- 1. Un lien seul ----------
{
  const { sb, tables, log } = fresh();
  const r = await keepOffer(sb, user, plan({ url: `${URL1}?utm_source=mail` }));
  ok("un lien seul : gardé, une ligne « À analyser »", r.outcome === "kept" && tables.applications.length === 1);
  const a = tables.applications[0];
  ok("la ligne : À postuler, sans offre lue, adresse nettoyée, site noté", a.status === "a_postuler" && a.offer_id === null && a.url === URL1 && a.title === UNTITLED && a.channel === "HelloWork" && a.applied_at === null && a.next_action_at === null);
  ok("RIEN dans Recommandées : la table des recommandations n'est même pas lue ni écrite", !log.some((l) => /recommendations/.test(l)), log.join(","));
  ok("aucune écriture dans les offres, les documents ni les textes (rien à ranger sans texte)", !log.some((l) => /^(insert|update|delete|upsert) (offers|documents|insights|application_texts)/.test(l)) && log.includes("insert applications"), log.join(","));

  // ---------- 2. Le même lien deux fois ----------
  const again = await keepOffer(sb, user, plan({ url: URL1 }));
  ok("le même lien une 2e fois : « déjà dans ta liste », rien de créé", again.outcome === "exists" && again.text === "none" && !again.textAdded && tables.applications.length === 1 && /colle-le/.test(again.message));

  // ---------- 3. Même lien, avec le texte cette fois ----------
  const withText = await keepOffer(sb, user, plan({ url: URL1, text: ad }));
  ok("le texte apporté plus tard est rangé SUR la ligne existante", withText.outcome === "exists" && withText.text === "added" && withText.textAdded === true && tables.applications.length === 1 && textOf(tables, a.id as string).startsWith("Nous recherchons"));
  ok("… et la phrase le dit", /Texte gardé sur cette ligne/.test(withText.message));
  const same = await keepOffer(sb, user, plan({ url: URL1, text: ad }));
  ok("le même texte encore : « déjà gardé », une seule ligne de texte", same.text === "same" && /déjà gardé/.test(same.message) && tables.application_texts.length === 1);
  const q = queueOf(tables);
  ok("« Tout analyser » la voit « lue en entier » (texte gardé), sans relire le site", q.items.length === 1 && q.items[0].full === true && q.items[0].app_id === a.id);
  const newer = await keepOffer(sb, user, plan({ url: URL1, text: ad.slice(0, 300) }));
  ok("un texte plus court que celui gardé le REMPLACE (la personne l'a collé exprès)", newer.text === "replaced" && /remplacé/.test(newer.message) && textOf(tables, a.id as string).length < ad.length && tables.application_texts.length === 1);
  ok("jamais de recommandation créée, ni avant ni après", !log.some((l) => /recommendations/.test(l)));
}

// ---------- 4. Déjà analysée ----------
{
  const { sb, tables } = fresh({ offers: [{ id: "off-1", url: URL1, user_id: "u1", created_at: "2026-11-01" }] });
  const r = await keepOffer(sb, user, plan({ url: URL1, text: ad }));
  ok("une offre déjà analysée est rouverte, rien n'est créé", r.outcome === "analyzed" && r.id === "off-1" && !tables.applications?.length && !tables.application_texts?.length);
}

// ---------- 5. Déjà dans Suivi, ou déjà rattachée à une offre ----------
{
  for (const st of ["postule", "entretien", "refuse"]) {
    const { sb, tables } = fresh({ applications: [lineOf({ url: URL1, status: st, applied_at: "2026-10-30" })] });
    const r = await keepOffer(sb, user, plan({ url: URL1, text: ad }));
    ok(`déjà dans Suivi (${st}) : rien n'est touché, aucun texte rangé`, r.outcome === "tracked" && tables.applications.length === 1 && tables.applications[0].status === st && !tables.application_texts?.length);
  }
  const { sb, tables } = fresh({ applications: [lineOf({ url: URL1, offer_id: "off-3" })] });
  const r = await keepOffer(sb, user, plan({ url: URL1, text: ad }));
  ok("une ligne déjà rattachée à une offre analysée : on rouvre l'offre, rien n'est recréé", r.outcome === "analyzed" && r.id === "off-3" && tables.applications.length === 1 && !tables.application_texts?.length);
}

// ---------- 6. Texte collé sans lien ----------
{
  const { sb, tables } = fresh();
  const p1 = plan({ text: ad, title: "Data analyst" });
  const r1 = await keepOffer(sb, user, p1);
  ok("texte + poste sans lien : gardé, avec son texte", r1.outcome === "kept" && r1.text === "added" && tables.applications[0].url === null && tables.applications[0].company === "Entreprise ?" && textOf(tables, tables.applications[0].id as string) === ad.trim());
  const again = await keepOffer(sb, user, p1);
  ok("le même texte collé deux fois : une seule ligne, « déjà gardé »", again.outcome === "exists" && again.text === "same" && tables.applications.length === 1 && tables.application_texts.length === 1);
  const other = await keepOffer(sb, user, plan({ text: ad + " Poste basé à Lyon.", title: "Data analyst" }));
  ok("un autre texte avec le même poste : une 2e ligne, au titre rendu unique", other.outcome === "kept" && tables.applications.length === 2 && tables.applications[1].title === "Data analyst (2)" && tables.application_texts.length === 2);
  const q = queueOf(tables);
  ok("les deux lignes sont lisibles par « Tout analyser » (sans lien, par leur texte gardé)", q.items.length === 2 && q.items.every((i) => i.full));
}

// ---------- 7. Depuis une ligne d'Offres & CV ouverte (?app=…) : le texte va SUR cette ligne ----------
{
  // La ligne vient d'une recherche : sa recommandation existe, avec un extrait. Elle ne doit PAS être touchée.
  const reco = { id: "r1", user_id: "u1", dedupe_key: "az:555", status: "accepted", url: URL2, title: "Data analyst", company: "Acme", origin: "search", snippet: "Extrait de la recherche.", offer_id: null };
  const { sb, tables, log } = fresh({ applications: [lineOf()], recommendations: [reco] });
  const r = await keepOnLine(sb, user, "a1", cleanAdText(ad));
  ok("le texte est rangé sur la ligne ouverte", r.outcome === "exists" && r.text === "added" && textOf(tables) === ad.trim() && tables.applications.length === 1);
  ok("la recommandation n'est ni lue ni modifiée : pas de 2e recommandation, pas de décision enregistrée", !log.some((l) => /recommendations/.test(l)) && tables.recommendations.length === 1 && tables.recommendations[0].snippet === "Extrait de la recherche." && tables.recommendations[0].status === "accepted");
  ok("la file lira CE texte (annonce lue en entier)", queueOf(tables).items[0]?.full === true);
  ok("rouvrir la ligne : le texte est retrouvé tel quel", (await readLineText(sb, "a1")) === ad.trim());
  const r2 = await keepOnLine(sb, user, "a1", cleanAdText(ad + " Mise à jour."));
  ok("un nouveau collage remplace le texte gardé", r2.text === "replaced" && textOf(tables).endsWith("Mise à jour.") && tables.application_texts.length === 1);
}
{
  // Indeed : la file met de côté les lignes illisibles SAUF celles qui portent un texte
  const indeedLine = lineOf({ id: "a2", url: "https://fr.indeed.com/rc/clk?jk=zzz999" });
  const { sb, tables } = fresh({ applications: [indeedLine] });
  const before = queueOf(tables);
  ok("ligne Indeed sans texte : mise de côté d'office (jamais tentée)", before.items.length === 0 && before.blocked.length === 1);
  await keepOnLine(sb, user, "a2", cleanAdText(ad));
  const after = queueOf(tables);
  ok("la même ligne avec son texte gardé : analysée (plus mise de côté)", after.items.length === 1 && after.blocked.length === 0 && after.items[0].full === true);
}
{
  const { sb, tables } = fresh({ applications: [lineOf()] });
  const short = await keepOnLine(sb, user, "a1", cleanAdText("trop court"));
  ok("texte trop court : rien n'est rangé, la phrase l'explique", short.text === "short" && /trop court/.test(short.message) && !tables.application_texts?.length);
  const none = await keepOnLine(sb, user, "a1", "");
  ok("sans texte : la phrase dit comment en ajouter un", none.text === "none" && /colle-le/.test(none.message));
  const gone = await keepOnLine(sb, user, "inconnue", cleanAdText(ad));
  ok("ligne supprimée entre-temps : « missing », rien d'écrit", gone.outcome === "missing" && !tables.application_texts?.length);
}
{
  const sent = fresh({ applications: [lineOf({ status: "postule", applied_at: "2026-10-30" })] });
  const t = await keepOnLine(sent.sb, user, "a1", cleanAdText(ad));
  ok("ligne déjà postulée : rien n'est touché", t.outcome === "tracked" && !sent.tables.application_texts?.length);
  const an = fresh({ applications: [lineOf({ offer_id: "off-9" })] });
  const o = await keepOnLine(an.sb, user, "a1", cleanAdText(ad));
  ok("ligne déjà analysée : on ouvre l'offre", o.outcome === "analyzed" && o.id === "off-9" && !an.tables.application_texts?.length);
}

// ---------- 8. La base n'est pas encore à jour (table absente) ----------
{
  const { sb, tables } = fresh({ applications: [lineOf()] }, ["application_texts"]);
  let err: unknown = null;
  try { await keepOnLine(sb, user, "a1", cleanAdText(ad)); } catch (e) { err = e; }
  ok("garder un texte : erreur claire « mettre la base à jour », pas une erreur technique", err instanceof SetupError && /mettre la base à jour/.test((err as Error).message));
  err = null;
  const before = tables.applications.length;
  try { await keepOffer(sb, user, plan({ url: URL1, text: ad })); } catch (e) { err = e; }
  ok("… et rien n'est créé avant de le savoir (pas de ligne sans son texte)", err instanceof SetupError && tables.applications.length === before);
  const linkOnly = await keepOffer(sb, user, plan({ url: URL1 }));
  ok("garder un lien seul fonctionne sans la table", linkOnly.outcome === "kept" && tables.applications.length === before + 1);
  ok("lire le texte d'une ligne sans la table : vide, sans erreur", (await readLineText(sb, "a1")) === "");
  const noText = await keepOnLine(sb, user, "a1", "");
  ok("sans texte, la ligne ouverte répond normalement", noText.outcome === "exists" && noText.text === "none");
}

// ---------- 9. Une autre erreur de base est remontée, pas avalée ----------
{
  const { sb } = fresh({ applications: [lineOf()] });
  const real = (sb as unknown as { from: (x: string) => unknown }).from.bind(sb);
  const bad = { from: (t: string) => (t === "application_texts" ? { select: () => ({ limit: async () => ({ data: [], error: null }), eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }), upsert: async () => ({ error: new Error("base indisponible") }) } : real(t)) } as never;
  let msg = "";
  try { await keepOnLine(bad, user, "a1", cleanAdText(ad)); } catch (e) { msg = `${e instanceof SetupError ? "setup:" : ""}${(e as Error).message}`; }
  ok("une erreur d'écriture est remontée telle quelle (jamais « gardé » à tort, jamais prise pour une base à mettre à jour)", msg === "base indisponible", msg);
}

// ---------- 10. Reconnaître une table absente, et seulement elle ----------
ok("42P01 et PGRST205 : table absente", isMissingTable({ code: "42P01" }) && isMissingTable({ code: "PGRST205" }));
ok("le message de PostgREST : table absente", isMissingTable({ message: "Could not find the table 'public.application_texts' in the schema cache" }));
ok("une panne ou un refus ne sont PAS une table absente", !isMissingTable({ message: "JWT expired" }) && !isMissingTable({ code: "42501", message: "permission denied" }) && !isMissingTable(null) && !isMissingTable(undefined));

done();
