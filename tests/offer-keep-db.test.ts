// « Garder pour plus tard » côté base (lib/offer-keep-db.ts), avec une fausse base en mémoire : jamais de doublon, jamais d'IA, le texte est retrouvé.
import { fakeSupabase, type Row } from "./fake-supabase";
import { keepOffer, type ScoreFn } from "../lib/offer-keep-db";
import { planKeep, UNTITLED } from "../lib/offer-keep";
import { buildQueue, type QueueApp, type QueueReco } from "../lib/analyze-queue";
import { ok, done } from "./helpers";

const user = { id: "u1", email: "juliana@exemple.fr" };
let scored = 0;
const score: ScoreFn = async () => { scored++; return { quick_score: 61, matched: ["sql"], senior: false }; };
const ad = "Nous recherchons un data analyst pour construire des tableaux de bord et fiabiliser les données de l'entreprise. ".repeat(4);
const plan = (i: Parameters<typeof planKeep>[0]) => { const r = planKeep(i); if (!r.ok) throw new Error(r.error); return r.plan; };
const fresh = (seed: Record<string, Row[]> = {}) => fakeSupabase(seed, { recommendations: ["user_id", "dedupe_key"] });
const URL1 = "https://www.hellowork.com/fr-fr/emplois/82945204.html";

// ---------- 1. Un lien seul ----------
{
  const { sb, tables, log } = fresh();
  const r = await keepOffer(sb, user, plan({ url: `${URL1}?utm_source=mail` }), score);
  ok("un lien seul : gardé, une ligne « À analyser » et une recommandation acceptée", r.outcome === "kept" && tables.applications.length === 1 && tables.recommendations.length === 1);
  const a = tables.applications[0], re = tables.recommendations[0];
  ok("la ligne : À postuler, sans offre lue, adresse nettoyée, site noté", a.status === "a_postuler" && a.offer_id === null && a.url === URL1 && a.title === UNTITLED && a.channel === "HelloWork" && a.applied_at === null && a.next_action_at === null);
  ok("la recommandation : acceptée, sans texte, sans pré-score inventé", re.status === "accepted" && re.snippet === null && re.quick_score === undefined && re.url === URL1 && re.origin === "page");
  ok("aucun pré-score calculé sans texte (donc aucune lecture du profil)", scored === 0);
  ok("aucune écriture dans les offres ni les documents (rien d'analysé)", !log.some((l) => /^(insert|update|delete) (offers|documents|insights)/.test(l)) && log.includes("insert applications") && log.includes("insert recommendations"), log.join(","));

  // ---------- 2. Le même lien deux fois ----------
  const again = await keepOffer(sb, user, plan({ url: URL1 }), score);
  ok("le même lien une 2e fois : « déjà dans ta liste », rien de créé", again.outcome === "exists" && !again.textAdded && tables.applications.length === 1 && tables.recommendations.length === 1);

  // ---------- 3. Même lien, avec le texte cette fois ----------
  const withText = await keepOffer(sb, user, plan({ url: URL1, text: ad }), score);
  ok("le texte apporté plus tard complète la ligne existante", withText.outcome === "exists" && withText.textAdded === true && tables.applications.length === 1 && tables.recommendations.length === 1);
  ok("le texte et le pré-score sont rangés dans la recommandation", String(tables.recommendations[0].snippet).startsWith("Nous recherchons") && tables.recommendations[0].quick_score === 61 && scored === 1);
  const sameText = await keepOffer(sb, user, plan({ url: URL1, text: ad }), score);
  ok("le même texte encore : rien de plus à ajouter, pas de nouveau calcul", sameText.outcome === "exists" && !sameText.textAdded && scored === 1);
  const q = buildQueue(tables.applications as unknown as QueueApp[], tables.recommendations as unknown as QueueReco[]);
  ok("« Tout analyser » la retrouve avec son texte (annonce lue en entier, pas de relecture du site)", q.items.length === 1 && q.items[0].full === true && q.items[0].reco_id === tables.recommendations[0].id);
}

// ---------- 4. Déjà analysée ----------
{
  const { sb, tables } = fresh({ offers: [{ id: "off-1", url: URL1, user_id: "u1", created_at: "2026-11-01" }] });
  const r = await keepOffer(sb, user, plan({ url: URL1 }), score);
  ok("une offre déjà analysée est rouverte, rien n'est créé", r.outcome === "analyzed" && r.id === "off-1" && !tables.applications?.length && !tables.recommendations?.length);
}
{
  const { sb, tables } = fresh({ recommendations: [{ id: "r9", user_id: "u1", dedupe_key: URL1, status: "analyzed", offer_id: "off-9", url: URL1, title: "X", company: "Y" }] });
  const r = await keepOffer(sb, user, plan({ url: URL1 }), score);
  ok("une recommandation déjà analysée (autre adresse enregistrée) : rouverte aussi", r.outcome === "analyzed" && r.id === "off-9" && !tables.applications?.length);
}

// ---------- 5. Déjà dans Suivi ----------
{
  for (const st of ["postule", "entretien", "refuse"]) {
    const { sb, tables } = fresh({ applications: [{ id: "a1", user_id: "u1", url: URL1, status: st, applied_at: "2026-10-30", offer_id: null }] });
    const r = await keepOffer(sb, user, plan({ url: URL1, text: ad }), score);
    ok(`déjà dans Suivi (${st}) : rien n'est touché, aucune recommandation créée`, r.outcome === "tracked" && tables.applications.length === 1 && tables.applications[0].status === st && !tables.recommendations?.length);
  }
  const { sb, tables } = fresh({ applications: [{ id: "a1", user_id: "u1", url: URL1, status: "a_postuler", applied_at: null, offer_id: "off-3" }] });
  const r = await keepOffer(sb, user, plan({ url: URL1 }), score);
  ok("une ligne déjà rattachée à une offre analysée n'est pas recréée", r.outcome === "tracked" && tables.applications.length === 1);
}

// ---------- 6. Déjà reçue par e-mail (« À trier ») ou écartée ----------
for (const st of ["new", "rejected"]) {
  const { sb, tables } = fresh({ recommendations: [{ id: "r1", user_id: "u1", dedupe_key: URL1.toLowerCase(), status: st, reject_reason: st === "rejected" ? "lieu" : null, url: URL1, title: "Data analyst H/F", company: "Acme", snippet: "court extrait", offer_id: null }] });
  const r = await keepOffer(sb, user, plan({ url: URL1, text: ad }), score);
  const re = tables.recommendations[0];
  ok(`recommandation « ${st} » déjà connue : une seule recommandation, devenue acceptée`, r.outcome === "kept" && tables.recommendations.length === 1 && re.status === "accepted" && re.reject_reason === null);
  ok("elle garde son poste et son entreprise, gagne le texte ; la ligne porte les mêmes", re.title === "Data analyst H/F" && re.company === "Acme" && String(re.snippet).startsWith("Nous recherchons") && tables.applications[0].title === "Data analyst H/F" && tables.applications[0].company === "Acme");
}

// ---------- 7. La ligne a été supprimée, la recommandation acceptée reste ----------
{
  const { sb, tables } = fresh({ recommendations: [{ id: "r1", user_id: "u1", dedupe_key: URL1.toLowerCase(), status: "accepted", url: URL1, title: "Data analyst", company: "Acme", snippet: ad, offer_id: null }] });
  const r = await keepOffer(sb, user, plan({ url: URL1 }), score);
  ok("ligne supprimée puis re-gardée : la ligne revient, sans doublon de recommandation", r.outcome === "kept" && tables.applications.length === 1 && tables.recommendations.length === 1);
}

// ---------- 8. Texte collé sans lien ----------
{
  const { sb, tables } = fresh();
  const p1 = plan({ text: ad, title: "Data analyst" });
  const r1 = await keepOffer(sb, user, p1, score);
  ok("texte + poste sans lien : gardé", r1.outcome === "kept" && tables.applications[0].url === null && tables.applications[0].company === "Entreprise ?" && String(tables.recommendations[0].dedupe_key).startsWith("texte:"));
  const again = await keepOffer(sb, user, p1, score);
  ok("le même texte collé deux fois : une seule ligne", again.outcome === "exists" && tables.applications.length === 1 && tables.recommendations.length === 1);
  const other = await keepOffer(sb, user, plan({ text: ad + " Poste basé à Lyon.", title: "Data analyst" }), score);
  ok("un autre texte avec le même poste : une 2e ligne, au titre rendu unique", other.outcome === "kept" && tables.applications.length === 2 && tables.applications[1].title === "Data analyst (2)" && tables.recommendations.length === 2);
  const q = buildQueue(tables.applications as unknown as QueueApp[], tables.recommendations as unknown as QueueReco[]);
  const textOf = (appId: string) => tables.recommendations.find((x) => x.id === q.items.find((i) => i.app_id === appId)?.reco_id)?.snippet;
  ok("la file rapproche chaque ligne de SON texte (jamais celui de l'autre)", q.items.length === 2 && textOf(tables.applications[0].id as string) === ad.trim() && String(textOf(tables.applications[1].id as string)).endsWith("Lyon."));
}

// ---------- 9. Deux liens sans titre : chacun garde sa recommandation ----------
{
  const { sb, tables } = fresh();
  await keepOffer(sb, user, plan({ url: "https://exemple.fr/o/1", text: ad }), score);
  await keepOffer(sb, user, plan({ url: "https://exemple.fr/o/2", text: ad + " 2" }), score);
  const q = buildQueue(tables.applications as unknown as QueueApp[], tables.recommendations as unknown as QueueReco[]);
  ok("deux « Annonce à analyser » : chacune retrouve sa recommandation par l'adresse", q.items.length === 2 && q.items.every((i) => i.full) && new Set(q.items.map((i) => i.reco_id)).size === 2);
}

// ---------- 10. Erreur de base : remontée, pas avalée ----------
{
  const { sb } = fresh({ recommendations: [] });
  const bad = { from: (t: string) => (t === "recommendations" ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }), insert: async () => ({ error: new Error("base indisponible") }) } : (sb as unknown as { from: (x: string) => unknown }).from(t)) } as never;
  let msg = "";
  try { await keepOffer(bad, user, plan({ url: URL1 }), score); } catch (e) { msg = (e as Error).message; }
  ok("une erreur d'écriture est remontée à la personne (jamais « gardée » à tort)", msg === "base indisponible");
}

done();
