// « Vérifier les annonces » dans Recommandées : sans IA, adresses lues dans la base, on ne conclut « disparue » que sur une preuve.
import { checkCandidates, goneIds, rejectedMessage } from "../lib/reco-check";
import { runChecks, type FetchLike } from "../lib/check-run";
import { CHECK_BATCH, type CheckResult } from "../lib/offer-check";
import { GONE_REASON } from "../lib/analyze-skips";
import { NEUTRAL_REASONS } from "../lib/types";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ok, done } from "./helpers";

const src = (f: string) => readFileSync(join(process.cwd(), f), "utf8");
const reco = (id: string, over: Record<string, unknown> = {}) => ({ id, status: "new", offer_id: null, url: `https://exemple.fr/o/${id}`, ...over });

// ---------- Quelles offres sont vérifiées ----------
const list = [reco("a"), reco("b", { status: "analyzed", offer_id: "o1" }), reco("c", { url: null }), reco("d", { url: "javascript:alert(1)" }), reco("e", { url: "ftp://x/y" }), reco("f", { status: "accepted" }), reco("g", { offer_id: "o2" }), reco("h", { url: "http://ok.fr/1" })];
ok("seules les offres « À trier » jamais analysées, avec un lien http(s), sont vérifiées", checkCandidates(list).map((r) => r.id).join(",") === "a,h");
ok("aucune offre : liste vide, sans erreur", checkCandidates([]).length === 0);

// ---------- Verdicts ----------
const res = (id: string, verdict: CheckResult["verdict"]): CheckResult => ({ id, verdict, site: "HelloWork" });
ok("seules les annonces dont la disparition est prouvée sont proposées à l'écartement", goneIds([res("1", "gone"), res("2", "online"), res("3", "unknown"), res("4", "skipped"), res("5", "gone")]).join(",") === "1,5");
ok("la raison de l'écartement est « Offre plus disponible », neutre pour l'apprentissage (aucune règle tirée de tes goûts)", GONE_REASON === "expiree" && NEUTRAL_REASONS.includes(GONE_REASON));
ok("phrase de confirmation au singulier et au pluriel", /^1 annonce disparue écartée/.test(rejectedMessage(1)) && /^3 annonces disparues écartées/.test(rejectedMessage(3)));

// ---------- La boucle de l'écran ----------
type Call = { url: string; ids: string[] };
const mkFetch = (calls: Call[], script: (n: number, ids: string[]) => { ok: boolean; status: number; body: unknown } | "throw"): FetchLike => async (url, init) => {
  const ids = (JSON.parse(init.body) as { ids: string[] }).ids;
  calls.push({ url, ids });
  const r = script(calls.length, ids);
  if (r === "throw") throw new Error("réseau");
  return { ok: r.ok, status: r.status, json: async () => r.body };
};
const okBody = (ids: string[]) => ({ ok: true, status: 200, body: { results: ids.map((id) => res(id, "online")) } });
const ids = (n: number) => Array.from({ length: n }, (_, i) => `r${i}`);
{
  const calls: Call[] = [];
  const out = await runChecks({ endpoint: "/api/recommendations/check", ids: ids(14), cancelled: () => false, fetchFn: mkFetch(calls, (_, i) => okBody(i)) });
  ok(`14 offres : paquets de ${CHECK_BATCH} (6, 6, 2), un après l'autre, vers la bonne route`, calls.map((c) => c.ids.length).join(",") === "6,6,2" && calls.every((c) => c.url === "/api/recommendations/check"));
  ok("tous les résultats reviennent, rien d'arrêté", out.results.length === 14 && out.stopped === null);
}
{
  const calls: Call[] = [];
  let seen = 0;
  const out = await runChecks({ endpoint: "/x", ids: ids(18), cancelled: () => calls.length >= 1, fetchFn: mkFetch(calls, (_, i) => okBody(i)), onProgress: (r) => { seen = r.length; } });
  ok("« Arrêter » : on s'arrête avant le paquet suivant et on le dit", calls.length === 1 && out.stopped === "Arrêté à ta demande." && out.results.length === 6 && seen === 6);
}
{
  const calls: Call[] = [];
  const out = await runChecks({ endpoint: "/x", ids: ids(18), cancelled: () => false, fetchFn: mkFetch(calls, () => ({ ok: false, status: 401, body: {} })) });
  ok("session expirée (401) : arrêt immédiat avec un message clair", calls.length === 1 && /session a expiré/.test(out.stopped ?? ""));
}
{
  const calls: Call[] = [];
  const out = await runChecks({ endpoint: "/x", ids: ids(18), cancelled: () => false, fetchFn: mkFetch(calls, (n, i) => (n === 1 ? okBody(i) : { ok: false, status: 429, body: { error: "Trop de vérifications : réessaie dans un moment." } })) });
  ok("trop de vérifications (429) : arrêt, message du serveur gardé, résultats déjà obtenus conservés", calls.length === 2 && /Trop de vérifications/.test(out.stopped ?? "") && out.results.length === 6);
}
{
  const calls: Call[] = [];
  const out = await runChecks({ endpoint: "/x", ids: ids(30), cancelled: () => false, fetchFn: mkFetch(calls, () => "throw") });
  ok("réseau coupé : 3 échecs de suite, puis arrêt (jamais de boucle sans fin)", calls.length === 3 && /Plusieurs échecs/.test(out.stopped ?? "") && out.results.length === 0);
}
{
  const calls: Call[] = [];
  const out = await runChecks({ endpoint: "/x", ids: ids(24), cancelled: () => false, fetchFn: mkFetch(calls, (n, i) => (n === 2 ? { ok: false, status: 500, body: {} } : okBody(i))) });
  ok("un paquet en échec isolé n'arrête pas la vérification (les autres sont lus)", calls.length === 4 && out.stopped === null && out.results.length === 18);
}

// ---------- La route : mêmes garanties que « Vérifier les annonces » d'Offres & CV ----------
const route = src("app/api/recommendations/check/route.ts");
ok("route : limite de requêtes appelée juste après requireUser (même seau que la vérification d'Offres & CV)", /requireUser\(\);\s*await rateLimit\(supabase, "checkAds"\)/.test(route));
ok("route : les adresses viennent de la base, jamais du corps de la requête", /from\("recommendations"\)\.select\("id, url"\)/.test(route) && !/body\.url|body\.urls|\.url\s*\?\?\s*body/.test(route));
ok("route : seulement les offres « new » jamais analysées, et 6 identifiants au plus", /\.eq\("status", "new"\)\.is\("offer_id", null\)/.test(route) && /slice\(0, CHECK_BATCH\)/.test(route));
ok("route : lecture directe seulement (jamais le lecteur de secours, jamais d'IA)", /readOffer\(/.test(route) && !/readOfferWithReader|structured\(|spendAi|checkQuota/.test(route));
ok("route : rien n'est modifié (aucune écriture en base)", !/\.(update|insert|delete|upsert)\(/.test(route));
const comp = src("components/check-recos.tsx");
ok("écran : écarter passe par la raison « expiree » (jamais une suppression), avec « Annuler »", /bulkDecision\(ids, "reject", GONE_REASON\)/.test(comp) && /label: "Annuler"/.test(comp) && !/method: "DELETE"/.test(comp));
ok("écran : le lien « Annonce » n'ouvre que du http(s) (linkOf) avec noopener", /linkOf\(g\.url\)/.test(comp) && /rel="noopener noreferrer"/.test(comp));
done();
