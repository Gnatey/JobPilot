// « Vérifier les annonces » porte aussi sur les offres DÉJÀ ANALYSÉES (9 novembre : « quand l'analyse est faite, on ne peut plus vérifier les annonces »).
import { readFileSync } from "node:fs";
import { unclearSkips, type CheckResult } from "../lib/offer-check";
import { isOfferSkip, type Skip } from "../lib/analyze-skips";
import { reconcile, syncSkips, type LineState } from "../lib/skip-sync";
import { ok, done } from "./helpers";

const src = (f: string) => readFileSync(f, "utf8");

// ---------- Les lignes illisibles : une offre analysée n'a rien à coller ----------
{
  const lines = new Map([["a1", { title: "Ligne", url: "https://indeed.com/x", kind: "app" as const }], ["o1", { title: "Offre", url: "https://indeed.com/y", kind: "offer" as const }]]);
  const res: CheckResult[] = [{ id: "a1", verdict: "skipped", site: "Indeed" }, { id: "o1", verdict: "skipped", site: "Indeed" }];
  const un = unclearSkips(res, lines);
  ok("la ligne « À analyser » illisible est listée (avec « Coller le texte »)", un.length === 1 && un[0].appId === "a1");
  ok("une offre déjà analysée illisible n'est pas listée avec un conseil qui ne la concerne pas (elle reste dans le compte du bilan)", !un.some((s) => s.appId === "o1"));
}

// ---------- Synchronisation du bilan : deux sortes de lignes ----------
{
  const calls: string[] = [];
  const skips: Skip[] = [
    { appId: "a1", title: "A", url: null, kind: "gone", site: "x" },
    { appId: "o1", title: "O", url: null, kind: "gone", site: "x", target: "offer", cv: 1 },
    { appId: "o2", title: "O2", url: null, kind: "gone", site: "x", target: "offer" },
  ];
  const r = await syncSkips(skips, async (ids, target) => {
    calls.push(`${target}:${ids.join("+")}`);
    // a1 : toujours « À analyser » ; o1 : supprimée depuis (absente) ; o2 : toujours là
    const states: LineState[] = target === "offer" ? [{ id: "o2", state: "todo", has_text: false }] : [{ id: "a1", state: "todo", has_text: false }];
    return states;
  });
  ok("les candidatures et les offres sont interrogées séparément", calls.join(" ") === "app:a1 offer:o1+o2");
  ok("une offre supprimée depuis (absente de la réponse) sort du bilan, les autres restent", r.drop.join() === "o1" && r.kept.length === 0);
  ok("une offre dont la candidature est partie (« away ») sort aussi du bilan", reconcile([{ appId: "o3", title: "", url: null, kind: "gone", site: "x", target: "offer" }], [{ id: "o3", state: "away", has_text: false }]).drop.join() === "o3");
  const failed = await syncSkips(skips, async () => null);
  ok("lecture ratée : rien n'est retiré", failed.drop.length === 0);
  ok("isOfferSkip", isOfferSkip({ target: "offer" }) && !isOfferSkip({}) && !isOfferSkip({ target: "app" }));
}

// ---------- La route : lecture des adresses en base, 6 lignes au plus, aucune IA ----------
{
  const route = src("app/api/offers/check/route.ts");
  ok("la route accepte app_ids et offer_ids, 6 lignes au plus en tout", /app_ids/.test(route) && /offer_ids/.test(route) && /slice\(0, CHECK_BATCH\)/.test(route) && /slice\(0, CHECK_BATCH - appIds\.length\)/.test(route));
  ok("les adresses viennent de la base (jamais de la requête), offres comprises", /from\("offers"\)\.select\("id, url"\)/.test(route) && /from\("applications"\)\.select\("id, url"\)/.test(route) && !/body\.url|body\.urls/.test(route));
  ok("limite de requêtes juste après requireUser, lecture directe, aucune IA", /requireUser\(\);\s*await rateLimit\(supabase, "checkAds"\)/.test(route) && /readOffer\(/.test(route) && !/readOfferWithReader|structured\(|spendAi|checkQuota/.test(route));
  ok("rien n'est supprimé ni modifié par la route (seule la date de publication passe par rememberPosted)", !/\.(update|insert|delete|upsert)\(/.test(route) && /rememberPosted\(/.test(route));
  const lines = src("app/api/offers/lines/route.ts");
  ok("l'état des offres du bilan se relit (offer_ids) ; une offre partie dans Suivi n'est plus proposée à la suppression", /offer_ids/.test(lines) && /pickApplication\(rows\)!\.status === "a_postuler"/.test(lines));
}

// ---------- L'écran ----------
{
  const page = src("app/offres/page.tsx");
  ok("la page donne au bilan les offres analysées qui ont un lien http(s), avec leur nombre de CV", /offerLines=\{todo\.flatMap/.test(page) && /kind: "offer" as const, cv: cvCount\.get\(o\.id\) \?\? 0/.test(page) && /httpUrlOrNull\(/.test(page));
  const work = src("components/offers-workspace.tsx");
  ok("« Vérifier les annonces » s'affiche même quand il n'y a aucune ligne « À analyser »", /checkLines\.length > 0 && \(/.test(work) && /\[\.\.\.lines, \.\.\.offerLines\]/.test(work) && /lines\.length > 0 && <AnalyzeAll/.test(work));
  const check = src("components/check-ads.tsx");
  ok("les offres partent dans offer_ids, les lignes dans app_ids", /app_ids: batch\.filter\(\(id\) => !isOffer\(id\)\)/.test(check) && /offer_ids: batch\.filter\(isOffer\)/.test(check));
  const rep = src("components/analyze-skips.tsx");
  ok("le bilan supprime une offre par /api/offers/:id (avec la raison « Offre plus disponible »), une ligne par /api/applications/:id", /isOfferSkip\(list\[i\]\) \? `\/api\/offers\/\$\{list\[i\]\.appId\}` : `\/api\/applications\/\$\{list\[i\]\.appId\}`/.test(rep) && /reason: GONE_REASON/.test(rep));
  ok("la confirmation dit qu'une offre analysée perd son analyse et ses CV", /l'analyse/.test(rep) && /CV générés/.test(rep));
}
done();
