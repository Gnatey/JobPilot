// Bilan de « Tout analyser » / « Vérifier les annonces » remis à jour d'après l'état ACTUEL des lignes (7-8 novembre, retour de Juliana :
// « texte collé dans une candidature mais toujours répertoriée dans illisible »). Cause : le bilan est un instantané et « Coller le texte » s'ouvre dans un
// autre onglet ; la ligne y était analysée ou son texte gardé, le bilan restait faux. Les lignes sans lien n'étaient en outre que COMPTÉES, jamais listées.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fakeSupabase, type Row } from "./fake-supabase";
import { SYNC_CHUNK, lineStatus, reconcile, syncSkips, type LineState } from "../lib/skip-sync";
import { groupSkips, type Skip } from "../lib/analyze-skips";
import { NO_SOURCE_SITE, buildQueue, noSourceLine, type QueueApp } from "../lib/analyze-queue";
import { restrictQueue } from "../lib/selection";
import { rememberLineText } from "../lib/offer-keep-db";
import { ok, done } from "./helpers";

const src = (f: string) => readFileSync(join(process.cwd(), f), "utf8");
const skip = (id: string, kind: Skip["kind"] = "unreadable", site = "Indeed"): Skip => ({ appId: id, title: `Poste ${id}`, url: `https://exemple.fr/${id}`, kind, site });
const st = (id: string, state: LineState["state"], has_text = false): LineState => ({ id, state, has_text });

// ---------- État d'une ligne ----------
ok("À postuler sans offre : toujours à faire", lineStatus({ status: "a_postuler", offer_id: null }) === "todo");
ok("une offre analysée depuis : analysée (même si le statut reste À postuler)", lineStatus({ status: "a_postuler", offer_id: "o1" }) === "analyzed");
ok("une ligne passée dans Suivi : sortie de la liste", lineStatus({ status: "postule", offer_id: null }) === "away" && lineStatus({ status: "abandonne", offer_id: null }) === "away");

// ---------- Ce que le bilan change ----------
{
  const skips = [skip("a"), skip("b"), skip("c"), skip("d"), skip("e", "gone"), skip("f", "failed")];
  const r = reconcile(skips, [st("a", "analyzed"), st("b", "todo", true), st("c", "todo"), st("d", "away"), st("e", "todo", true) /* f absente : supprimée */]);
  ok("analysée depuis, passée dans Suivi ou supprimée : sort du bilan", r.drop.sort().join() === "a,d,f", r.drop.join());
  ok("un texte collé sort la ligne d'« illisible » ET de « disparue » (jamais supprimée en lot par erreur)", r.kept.sort().join() === "b,e", r.kept.join());
  ok("une ligne toujours sans texte ne bouge pas", !r.drop.includes("c") && !r.kept.includes("c"));
}
{
  const g = groupSkips([skip("a", "kept"), skip("b", "gone"), skip("c")]);
  ok("groupSkips range « texte déjà collé » à part", g.kept.length === 1 && g.gone.length === 1 && g.unreadable.length === 1 && g.failed.length === 0);
}

// ---------- Par paquets, sans rien conclure d'une lecture ratée ----------
{
  const skips = Array.from({ length: 250 }, (_, i) => skip(`l${i}`));
  const calls: number[] = [];
  const r = await syncSkips(skips, async (ids) => { calls.push(ids.length); return ids.map((id) => st(id, "todo")); });
  ok(`250 lignes : ${Math.ceil(250 / SYNC_CHUNK)} requêtes d'au plus ${SYNC_CHUNK}, rien à changer`, calls.length === 3 && calls.every((n) => n <= SYNC_CHUNK) && r.drop.length === 0 && r.kept.length === 0, calls.join());
  const r2 = await syncSkips(skips, async (ids) => (ids[0] === "l100" ? null : ids.map((id) => st(id, "analyzed"))));
  ok("un paquet dont la lecture échoue n'est PAS conclu : ses lignes restent (jamais retirées parce qu'une requête a raté)", r2.drop.length === 150 && !r2.drop.includes("l100") && !r2.drop.includes("l199"), String(r2.drop.length));
  ok("liste vide : aucune requête", (await syncSkips([], async () => { throw new Error("ne doit pas être appelée"); })).drop.length === 0);
}

// ---------- La route d'état ----------
{
  const r = src("app/api/offers/lines/route.ts");
  ok("la route lit les candidatures ET les textes gardés, par identifiants", /from\("applications"\)[\s\S]*\.in\("id", ids\)/.test(r) && /from\("application_texts"\)[\s\S]*\.in\("application_id", ids\)/.test(r));
  ok("100 identifiants au plus, session exigée, lecture ratée = erreur (jamais « supprimée »)", /slice\(0, SYNC_CHUNK\)/.test(r) && /requireUser/.test(r) && /if \(error\) throw error/.test(r));
  ok("table des textes absente : aucune ligne n'a de texte, sans erreur", /texts\.error \? \[\]/.test(r));
  ok("la route ne modifie rien", !/\.(insert|update|delete|upsert)\(/.test(r));
}

// ---------- L'écran ----------
{
  const c = src("components/analyze-skips.tsx");
  ok("le bilan interroge l'état réel à l'affichage et au retour sur l'onglet", /syncSkips\(/.test(c) && /visibilitychange/.test(c) && /addEventListener\("focus"/.test(c) && /"\/api\/offers\/lines"/.test(c));
  ok("les lignes sorties sont retirées du bilan, la liste de la page est rafraîchie", /live\.current\.onRemoved\(r\.drop\)/.test(c) && /router\.refresh\(\)/.test(c));
  ok("section « Texte déjà collé » avec bouton d'analyse", /Texte déjà collé : prêtes à analyser/.test(c) && /onAnalyze\(g\.kept/.test(c));
  ok("une ligne au texte collé n'est jamais cochée pour suppression (elle quitte « disparues »)", /kept\.has\(s\.appId\) \? \{ \.\.\.s, kind: "kept" \}/.test(c));
  ok("« Tout analyser » et « Vérifier les annonces » donnent l'analyse au bilan", /onAnalyze=\{\(ids\) => \{ void start\(ids\); \}\}/.test(src("components/analyze-all.tsx")) && /onAnalyze=\{onAnalyze\}/.test(src("components/check-ads.tsx")) && /onAnalyze=\{\(ids\) => \{ scrollUp\(\); analyze\.current\?\.start\(ids\); \}\}/.test(src("components/offers-workspace.tsx")));
  const page = src("app/offres/page.tsx");
  ok("la liste marque les lignes qui portent un texte", /from\("application_texts"\)/.test(page) && /hasText: withText\.has/.test(page) && /Texte collé, prête à analyser/.test(src("components/offers-list.tsx")));
}

// ---------- Lignes sans lien ni texte : listées dans le bilan ----------
{
  const apps: QueueApp[] = [{ id: "x1", title: "Chargé de reporting", company: "Acme", url: null }, { id: "x2", title: null, company: null, url: null }, { id: "x3", title: "Avec lien", company: "B", url: "https://exemple.fr/o/3" }];
  const q = buildQueue(apps, []);
  ok("buildQueue : 2 lignes sans lien ni texte, 1 analysable", q.skipped.length === 2 && q.items.length === 1);
  const l = noSourceLine(q.skipped[0]);
  ok("la ligne sans lien devient une ligne du bilan « Sans lien »", l.app_id === "x1" && l.site === NO_SOURCE_SITE && l.url === null && l.title === "Chargé de reporting" && l.company === "Acme");
  ok("sans titre : « Poste ? »", noSourceLine(q.skipped[1]).title === "Poste ?");
  const all = restrictQueue({ items: q.items.map((i) => ({ app_id: i.app_id })), blocked: [], skippedIds: q.skipped.map((s) => s.id), skipped: q.skipped.length, skippedLines: q.skipped.map(noSourceLine) }, null);
  ok("« Tout analyser » : toutes les lignes sans lien sont listées", all.noSourceLines.length === 2 && all.noSource === 2);
  const some = restrictQueue({ items: [], blocked: [], skippedIds: ["x1", "x2"], skipped: 2, skippedLines: q.skipped.map(noSourceLine) }, new Set(["x2", "autre"]));
  ok("« Analyser la sélection » : seulement les lignes cochées", some.noSourceLines.map((x) => x.app_id).join() === "x2" && some.noSource === 1);
  ok("ancienne réponse de la file (sans lignes) : aucune erreur", restrictQueue({ items: [], blocked: [], skippedIds: [], skipped: 3 }, null).noSourceLines.length === 0);
  ok("la route de la file renvoie ces lignes", /skippedLines: skipped\.map\(noSourceLine\)/.test(src("app/api/offers/queue/route.ts")));
  ok("l'écran les range avec les lignes mises de côté (« Sans lien », avec « Coller le texte »)", /\.\.\.cut\.noSourceLines/.test(src("components/analyze-all.tsx")));
}

// ---------- Texte collé pour une analyse : rangé sur la ligne AVANT l'IA ----------
const ad = "Nous recherchons un data analyst pour construire des tableaux de bord et fiabiliser les données de l'entreprise. ".repeat(4);
const user = { id: "u1", email: "juliana@exemple.fr" };
const line = (extra: Record<string, unknown> = {}) => ({ id: "a1", user_id: "u1", url: "https://fr.indeed.com/viewjob?jk=abc", title: "Data analyst", company: "Acme", status: "a_postuler", applied_at: null, offer_id: null, ...extra });
{
  const { sb, tables } = fakeSupabase({ applications: [line()] });
  ok("texte collé : rangé sur la ligne", (await rememberLineText(sb, user, "a1", ad)) === true && String(tables.application_texts?.[0]?.body).startsWith("Nous recherchons"));
  ok("le même texte encore : toujours « rangé », une seule ligne de texte", (await rememberLineText(sb, user, "a1", ad)) === true && tables.application_texts.length === 1);
  ok("un autre texte remplace l'ancien", (await rememberLineText(sb, user, "a1", `${ad} Mise à jour.`)) === true && tables.application_texts.length === 1 && /Mise à jour/.test(String(tables.application_texts[0].body)));
}
{
  const { sb, tables } = fakeSupabase({ applications: [line()] });
  ok("texte trop court : rien de rangé", (await rememberLineText(sb, user, "a1", "trop court")) === false && !tables.application_texts?.length);
}
{
  const { sb, tables } = fakeSupabase({ applications: [line({ offer_id: "o1" })] });
  ok("ligne déjà analysée : rien de rangé", (await rememberLineText(sb, user, "a1", ad)) === false && !tables.application_texts?.length);
  const b = fakeSupabase({ applications: [line({ status: "postule" })] });
  ok("ligne déjà dans Suivi : rien de rangé", (await rememberLineText(b.sb, user, "a1", ad)) === false);
  const c = fakeSupabase({});
  ok("ligne introuvable : rien de rangé, aucune erreur", (await rememberLineText(c.sb, user, "zz", ad)) === false);
}
{
  const { sb } = fakeSupabase({ applications: [line()] }, {}, { missing: ["application_texts"] });
  let threw = false;
  const r = await rememberLineText(sb, user, "a1", ad).catch(() => { threw = true; return false; });
  ok("base pas encore à jour (table absente) : jamais d'erreur, l'analyse continue", r === false && !threw);
}
{
  const r = src("app/api/offers/analyze/route.ts");
  const iRemember = r.indexOf("rememberLineText(supabase, user, body.app_id, text)");
  const iSpend = r.indexOf("await spendAi(");
  ok("la route range le texte collé AVANT de dépenser de l'IA", iRemember > 0 && iSpend > iRemember);
  ok("elle ne range que le texte collé (jamais celui déjà gardé ni un extrait de recommandation)", /const pasted = Boolean\(text && body\.app_id/.test(r) && r.indexOf("const pasted") < r.indexOf("readLineText(supabase, body.app_id)"));
  ok("quand l'analyse échoue, l'erreur dit que le texte est gardé sur la ligne (sauf session expirée)", /Le texte que tu as collé est gardé sur la ligne/.test(r) && /e\.status !== 401/.test(r));
}
done();
