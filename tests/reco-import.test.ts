// Import d'une liste par le favori : rien d'incomplet dans « À trier ». Plan d'import (30 lues, reprise, doublons, LinkedIn exclu) et garanties des routes. Sans réseau.
import { planImport, importNotes, importSummary, isLenientPage, needsReading, readingCutoff, READ_CAP, READING, READING_DAYS, type FoundOffer, type KnownReco } from "../lib/reco-import";
import { archiveOld, purgeUnread } from "../lib/reco-age-db";
import { KEPT } from "../lib/fit";
import { fakeSupabase, type Row } from "./fake-supabase";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ok, done } from "./helpers";

const src = (f: string) => readFileSync(join(process.cwd(), f), "utf8");
const PAGE = "https://fr.indeed.com/jobs?q=data";
let n = 0;
const offer = (over: Partial<FoundOffer> = {}): FoundOffer => { n++; return { key: `https://fr.indeed.com/viewjob?jk=${n}`, title: `Data analyst numéro ${n}`, company: `Entreprise ${n}`, location: "Paris", snippet: "extrait", url: `https://fr.indeed.com/viewjob?jk=${n}`, ...over }; };
const known = (m: Record<string, Partial<KnownReco>> = {}) => new Map(Object.entries(m).map(([k, v]) => [k, { id: `id-${k}`, status: "new", offer_id: null, snippet: "court", ...v } as KnownReco]));

// ---------- Constantes ----------
ok("30 annonces lues par import, 2 jours avant suppression", READ_CAP === 30 && READING_DAYS === 2 && READING === "reading");
ok("la limite de suppression est à 2 jours pile", new Date(readingCutoff(new Date("2026-11-10T12:00:00Z"))).toISOString() === "2026-11-08T12:00:00.000Z");
ok("LinkedIn (et ses sous-domaines) est la seule page exclue", isLenientPage("https://www.linkedin.com/jobs/search?keywords=bi") && isLenientPage("https://fr.linkedin.com/jobs/x") && !isLenientPage("https://fr.indeed.com/jobs") && !isLenientPage("pas une adresse"));

// ---------- Une page ordinaire ----------
{
  const offers = [offer(), offer(), offer()];
  const p = planImport({ pageUrl: PAGE, offers, known: new Map(), seen: [] });
  ok("les offres nouvelles sont rangées « en lecture », jamais « new »", p.insert.length === 3 && p.insert.every((o) => o.status === READING));
  ok("toutes sont à lire maintenant, dans l'ordre de la page", p.readKeys.join() === offers.map((o) => o.key).join());
  ok("rien n'est écarté", Object.values(p.skipped).every((x) => x === 0));
}
{
  const offers = Array.from({ length: 40 }, () => offer());
  const p = planImport({ pageUrl: PAGE, offers, known: new Map(), seen: [] });
  ok("au-delà de 30, les offres en plus ne sont PAS prises (ni rangées, ni lues)", p.insert.length === 30 && p.readKeys.length === 30 && p.skipped.overCap === 10);
  ok("ce sont les 30 premières de la page", p.insert[29].key === offers[29].key && !p.insert.some((o) => o.key === offers[30].key));
  const second = planImport({ pageUrl: PAGE, offers, known: known(Object.fromEntries(offers.slice(0, 30).map((o) => [o.key, { snippet: "x".repeat(400), status: "new" }]))), seen: [] });
  ok("un second clic prend la suite : les 30 déjà lues sont sautées", second.insert.length === 10 && second.skipped.known === 30 && second.skipped.overCap === 0);
}

// ---------- Reprise ----------
{
  const o1 = offer(), o2 = offer(), o3 = offer();
  const p = planImport({ pageUrl: PAGE, offers: [o1, o2, o3], known: known({ [o1.key]: { status: READING }, [o2.key]: { status: "new", snippet: "x".repeat(500) } }), seen: [] });
  ok("une offre restée « en lecture » est relue, sans doublon", !p.insert.some((o) => o.key === o1.key) && p.readKeys.includes(o1.key));
  ok("une offre déjà lue en entier est sautée (« déjà connue »)", !p.readKeys.includes(o2.key) && p.skipped.known === 1);
  ok("la nouvelle est rangée « en lecture »", p.insert.length === 1 && p.insert[0].key === o3.key);
  const emailReco = planImport({ pageUrl: PAGE, offers: [o1], known: known({ [o1.key]: { status: "new", snippet: "extrait d'e-mail" } }), seen: [] });
  ok("une offre venue d'un e-mail, sans texte d'annonce, est aussi lue (elle devient complète)", emailReco.readKeys.length === 1 && emailReco.insert.length === 0);
  ok("une offre déjà analysée n'est pas relue", !needsReading({ id: "x", status: "analyzed", offer_id: "o", snippet: "court" }) && !needsReading({ id: "x", status: "rejected", offer_id: null, snippet: "court" }));
}

// ---------- Ce qui n'est pas pris ----------
{
  const p = planImport({ pageUrl: PAGE, offers: [offer({ url: "" }), offer({ url: "https://autre-site.fr/offre/1" }), offer()], known: new Map(), seen: [] });
  ok("sans lien ou vers un autre site : pas prise, comptée", p.insert.length === 1 && p.skipped.noLink === 1 && p.skipped.otherSite === 1);
}

// ---------- Doublons ----------
{
  const a = offer({ title: "Chargé de mission data (H/F)", company: "Klesia", location: "Paris (75)" });
  const b = offer({ title: "CHARGÉ DE MISSION DATA F/H", company: "KLESIA", location: "Paris" });
  const seen = [{ title: "Chargé de mission data H/F", company: "Klesia", location: "Paris, France" }];
  const p = planImport({ pageUrl: PAGE, offers: [a, b], known: new Map(), seen });
  ok("même poste, même entreprise, même lieu qu'une offre déjà connue : écartée", p.insert.length === 0 && p.skipped.duplicate === 2);
  const other = offer({ title: "Chargé de mission data H/F", company: "Klesia", location: "Lyon" });
  ok("le même poste dans une AUTRE ville n'est pas un doublon", planImport({ pageUrl: PAGE, offers: [other], known: new Map(), seen }).insert.length === 1);
  const noPlace = offer({ title: "Chargé de mission data H/F", company: "Klesia", location: "" });
  ok("sans lieu, on ne prend pas le risque : doublon", planImport({ pageUrl: PAGE, offers: [noPlace], known: new Map(), seen }).skipped.duplicate === 1);
  const unknownCo = offer({ title: "Chargé de mission data H/F", company: "Non spécifié", location: "Paris" });
  ok("entreprise non précisée : jamais écartée comme doublon", planImport({ pageUrl: PAGE, offers: [unknownCo], known: new Map(), seen }).insert.length === 1);
  const dupInPage = [offer({ title: "Analyste BI senior", company: "Orange", location: "Paris" }), offer({ title: "Analyste BI senior (H/F)", company: "Orange", location: "Paris" })];
  const q = planImport({ pageUrl: PAGE, offers: dupInPage, known: new Map(), seen: [] });
  ok("deux fois la même offre sur la même page : une seule est prise", q.insert.length === 1 && q.skipped.duplicate === 1);
}

// ---------- LinkedIn : comme avant ----------
{
  const li = "https://www.linkedin.com/jobs/search?keywords=bi";
  const offers = Array.from({ length: 45 }, () => offer({ url: `https://www.linkedin.com/jobs/view/${++n}`, key: `li-${n}` }));
  const p = planImport({ pageUrl: li, offers, known: new Map(), seen: [{ title: offers[0].title, company: offers[0].company, location: "Paris" }] });
  ok("LinkedIn : tout est rangé directement « new » (titre et extrait), sans limite de 30 ni lecture", p.lenient && p.insert.length === 45 && p.insert.every((o) => o.status === "new") && p.readKeys.length === 0);
  ok("LinkedIn : seul le doublon d'adresse est écarté (comme avant)", planImport({ pageUrl: li, offers, known: known({ [offers[0].key]: { snippet: "x".repeat(400) } }), seen: [] }).insert.length === 44);
}

// ---------- Bilan ----------
{
  const t = importNotes({ known: 3, duplicate: 2, otherSite: 1, noLink: 1, overCap: 5 }, 2).join(" ");
  ok("le bilan dit ce qui n'est pas lu (supprimé dans 2 jours), pas pris (limite), écarté (doublon)", /2 offres n'ont pas pu être lues/.test(t) && /dans 2 jours/.test(t) && /5 autres offres/.test(t) && /limite de 30/.test(t) && /2 offres écartées/.test(t) && /2 offres n'ont pas été prises/.test(t));
  ok("rien à signaler : aucune phrase", importNotes({ known: 4, duplicate: 0, otherSite: 0, noLink: 0, overCap: 0 }, 0).length === 0);
}

// ---------- Bilan de l'écran ----------
{
  const none = { known: 0, duplicate: 0, otherSite: 0, noLink: 0, overCap: 0 };
  const a = importSummary({ found: 12, read: 12, toRead: 12, pending: 0, skipped: none });
  ok("tout lu : « 12 annonces lues en entier, prêtes à trier », rien à expliquer", a.ok && /^12 annonces lues en entier, prêtes à trier$/.test(a.title) && a.notes.length === 0 && a.hint === null);
  ok("une seule : accords au singulier", /^1 annonce lue en entier, prête à trier$/.test(importSummary({ found: 1, read: 1, toRead: 1, pending: 0, skipped: none }).title));
  const b = importSummary({ found: 40, read: 30, toRead: 30, pending: 0, skipped: { ...none, overCap: 10 } });
  ok("40 trouvées, 30 lues : le bilan dit que les 10 autres attendent un second clic", b.ok && b.notes.length === 1 && /10 autres offres/.test(b.notes[0]) && /reclique/.test(b.notes[0]));
  const c = importSummary({ found: 12, read: 0, toRead: 12, pending: 12, skipped: none });
  ok("rien n'a pu être lu : jamais « ajoutée » ; le bilan l'explique et dit que les offres seront supprimées", !c.ok && /Aucune offre ajoutée/.test(c.title) && /que lue en entier/.test(c.hint ?? "") && /supprimées dans 2 jours/.test(c.notes.join(" ")));
  const d = importSummary({ found: 12, read: 0, toRead: 0, pending: 0, skipped: { ...none, known: 12 } });
  ok("second clic sur une page déjà prise : « Rien de nouveau »", d.ok && d.title === "Rien de nouveau à ajouter" && /déjà dans JobPilot/.test(d.hint ?? ""));
  ok("page sans offre : phrase d'avant", importSummary({ found: 0, read: 0, toRead: 0, pending: 0, skipped: none }).title.startsWith("Je n'ai trouvé aucune offre"));
}

// ---------- Suppression au bout de 2 jours (fausse base) ----------
{
  const NOW = new Date("2026-11-10T12:00:00Z");
  const ago = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
  const r = (id: string, over: Row = {}): Row => ({ id, user_id: "u1", status: READING, reject_reason: null, received_at: ago(60), offer_id: null, ...over });
  const { sb, tables } = fakeSupabase({
    recommendations: [
      r("vieille-lecture"), r("lecture-recente", { received_at: ago(47) }), r("lecture-limite", { received_at: ago(48) }),
      r("autre-personne", { user_id: "u2" }), r("visible", { status: "new" }), r("analysee", { status: "analyzed", offer_id: "o1" }),
      r("acceptee", { status: "accepted" }), r("ecartee", { status: "rejected" }), r("gardee", { status: "new", reject_reason: KEPT }), r("sans-date", { received_at: null }),
    ],
  });
  await purgeUnread(sb, "u1", NOW);
  const ids = tables.recommendations.map((x) => x.id as string);
  ok("une offre « en lecture » de plus de 2 jours est supprimée", !ids.includes("vieille-lecture"));
  ok("moins de 2 jours (47 h) et 48 h pile : conservées (strictement avant)", ids.includes("lecture-recente") && ids.includes("lecture-limite"));
  ok("l'offre « en lecture » d'une autre personne n'est pas touchée", ids.includes("autre-personne"));
  ok("rien d'autre n'est supprimé : visible, analysée, acceptée, écartée, gardée, sans date", ["visible", "analysee", "acceptee", "ecartee", "gardee", "sans-date"].every((x) => ids.includes(x)));
  // Appelée par le rangement habituel, aux mêmes endroits que les offres anciennes
  const second = fakeSupabase({ recommendations: [r("vieille-lecture-2"), r("visible-2", { status: "new", received_at: ago(1) })] });
  await archiveOld(second.sb, "u1", NOW);
  ok("archiveOld supprime aussi les « en lecture » périmées", !second.tables.recommendations.some((x) => x.id === "vieille-lecture-2") && second.tables.recommendations.some((x) => x.id === "visible-2"));
  const broken = fakeSupabase({ recommendations: [r("x")] }, {}, { missing: ["recommendations"] });
  let threw = false;
  try { await purgeUnread(broken.sb, "u1", NOW); } catch { threw = true; }
  ok("une base en erreur ne fait jamais planter le rangement", !threw);
}

// ---------- Les routes et l'écran ----------
{
  const c = src("app/api/offers/capture/route.ts");
  ok("la route de capture utilise le plan, range en « reading » et ne dépend pas de l'ordre de l'IA", /planImport\(/.test(c) && /status: o\.status/.test(c));
  ok("la route cherche les doublons dans les offres, candidatures et recommandations (tous statuts)", /from\("offers"\)/.test(c) && /from\("applications"\)/.test(c) && /from\("recommendations"\)/.test(c) && /fetchAll/.test(c));
  const e = src("app/api/recommendations/enrich/route.ts");
  ok("la lecture complète fait passer l'offre de « reading » à « new »", /READING/.test(e) && /status: "new"/.test(e));
  const d = src("lib/reco-age-db.ts");
  ok("le rangement des offres anciennes supprime aussi les « reading » de plus de 2 jours, et seulement elles", /purgeUnread/.test(d) && /\.eq\("status", READING\)/.test(d) && /readingCutoff/.test(d));
  const i = src("app/importer/page.tsx");
  ok("l'écran lit 30 annonces (la constante, pas un nombre en dur)", /READ_CAP/.test(i) && !/MAX_READ = 12/.test(i));
  ok("l'écran garde l'ancien bilan pour LinkedIn (list.lenient) et ne redirige pas quand il reste quelque chose à expliquer", /list\.lenient/.test(i) && /sum\?\.notes\.length/.test(i) && /abstiens exprès/.test(i));
  ok("l'écran compte comme lues les annonces ENREGISTRÉES par le serveur (scored), pas seulement reçues du site", /out\.read = scored\.length/.test(i));
  ok("les listes d'Accueil, Recommandées et la palette ne montrent jamais « reading » (filtrent new / analyzed)", ["lib/day.ts", "components/nav.tsx", "components/palette.tsx", "app/page.tsx"].every((f) => !/reading/.test(src(f))) && /in\("status", \["new", "analyzed"\]\)/.test(src("components/nav.tsx")));
  ok("les statistiques ignorent les offres « en lecture »", /"reading"/.test(src("lib/stats.ts")));
}
done();
