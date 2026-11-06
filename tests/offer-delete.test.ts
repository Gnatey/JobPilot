// Offres & CV : supprimer avec la même liste de raisons que « Je ne postule pas », et bouton « Annonce » pour retrouver le lien.
import { readFileSync } from "node:fs";
import { REJECTABLE_RECO, deletionReason, planOfferDeletion } from "../lib/offer-delete";
import { rejectRecosOfApplication } from "../lib/offer-ops";
import { isUnsentApp } from "../lib/app-pick";
import { REJECT_REASONS, NEUTRAL_REASONS } from "../lib/types";
import { httpUrlOrNull } from "../lib/fetch-offer";
import { ok, done } from "./helpers";

// ---------- La raison reçue du navigateur ----------
ok("raison connue : gardée", deletionReason("trop_senior") === "trop_senior" && deletionReason("salaire") === "salaire");
ok("toutes les raisons de « Je ne postule pas » sont acceptées à l'identique", REJECT_REASONS.every((r) => deletionReason(r.id) === r.id));
ok("absente, vide ou pas du texte : aucune raison (suppression sans préciser)", deletionReason(undefined) === null && deletionReason(null) === null && deletionReason("") === null && deletionReason(42) === null && deletionReason({}) === null);
ok("« autre » avec son pourquoi : gardé, borné", deletionReason("autre: pas d'avenir dans l'équipe") === "autre: pas d'avenir dans l'équipe" && deletionReason(`autre: ${"x".repeat(2000)}`)!.length < 400);
ok("une raison trop longue est coupée", deletionReason("y".repeat(500))!.length === 40);

// ---------- Ce que la suppression change côté tri ----------
const unsent = [{ status: "a_postuler", applied_at: null }];
const sentApp = [{ status: "postule", applied_at: "2026-11-01" }];
ok("raison + rien d'envoyé : la recommandation est écartée avec la raison (le tri apprend)", planOfferDeletion(unsent, "trop_senior").rejectRecos === true && planOfferDeletion(unsent, "trop_senior").sent === false);
ok("sans raison : comportement d'avant (la recommandation « analysée » redevient « à trier »)", planOfferDeletion(unsent, null).rejectRecos === false);
ok("offre sans ligne dans Suivi : la raison compte aussi", planOfferDeletion([], "metier").rejectRecos === true && planOfferDeletion(null, "metier").rejectRecos === true && planOfferDeletion(undefined, null).rejectRecos === false);
ok("une candidature déjà envoyée garde son « oui » : la raison n'écarte rien", planOfferDeletion(sentApp, "trop_senior").rejectRecos === false && planOfferDeletion(sentApp, "trop_senior").sent === true);
ok("Postulé, entretien, test, offre, refus : envoyés", ["entretien", "test", "offre", "refuse", "postule"].every((s) => planOfferDeletion([{ status: s, applied_at: "2026-11-01" }], "autre").sent));
ok("abandonné ou « offre plus disponible » sans date d'envoi : ce n'est pas une candidature, la raison compte", planOfferDeletion([{ status: "abandonne", applied_at: null }, { status: "expiree", applied_at: null }], "salaire").rejectRecos === true);
ok("une ligne abandonnée mais envoyée un jour : envoyée", planOfferDeletion([{ status: "abandonne", applied_at: "2026-10-20" }], "salaire").sent === true);
ok("la recommandation déjà écartée n'est jamais réécrite (nouvelle, analysée ou acceptée seulement)", REJECTABLE_RECO.join(",") === "new,analyzed,accepted");
ok("une ligne envoyée ne se supprime pas depuis Offres & CV", isUnsentApp({ status: "a_postuler", applied_at: null }) && !isUnsentApp({ status: "a_postuler", applied_at: "2026-11-01" }) && !isUnsentApp({ status: "postule", applied_at: null }) && !isUnsentApp({ status: "entretien", applied_at: null }));
ok("« offre plus disponible » ne nourrit pas l'apprentissage, « trop senior » oui", NEUTRAL_REASONS.includes("expiree") && !NEUTRAL_REASONS.includes("trop_senior"));

// ---------- Ligne « À analyser » : la recommandation d'où elle vient ----------
type Call = { table: string; patch?: Record<string, unknown>; in?: [string, unknown[]]; eq: [string, unknown][] };
function fakeDb() {
  const calls: Call[] = [];
  const sb = {
    from(table: string) {
      const c: Call = { table, eq: [] };
      calls.push(c);
      const q: Record<string, unknown> = {
        update: (patch: Record<string, unknown>) => { c.patch = patch; return q; },
        in: (col: string, vals: unknown[]) => { c.in = [col, vals]; return q; },
        eq: (col: string, v: unknown) => { c.eq.push([col, v]); return q; },
        then: (resolve: (v: unknown) => void) => resolve({}),
      };
      return q;
    },
  };
  return { calls, sb: sb as never };
}
{
  const { calls, sb } = fakeDb();
  await rejectRecosOfApplication(sb, { url: "https://exemple.fr/offre/1", title: "Data analyst", company: "Acme" }, "trop_senior");
  const c = calls[0];
  ok("avec une adresse : la recommandation de même adresse est écartée avec la raison", c.table === "recommendations" && c.patch?.status === "rejected" && c.patch?.reject_reason === "trop_senior" && typeof c.patch?.decided_at === "string" && c.eq.length === 1 && c.eq[0][0] === "url" && c.eq[0][1] === "https://exemple.fr/offre/1");
  ok("seulement les recommandations nouvelles, analysées ou acceptées", c.in?.[0] === "status" && c.in[1].join(",") === "new,analyzed,accepted");
}
{
  const { calls, sb } = fakeDb();
  await rejectRecosOfApplication(sb, { url: null, title: "BI analyst", company: "Beta" }, "autre: trajet");
  const c = calls[0];
  ok("sans adresse : même poste et même entreprise", c.eq.length === 2 && c.eq[0][0] === "title" && c.eq[0][1] === "BI analyst" && c.eq[1][0] === "company" && c.eq[1][1] === "Beta" && c.patch?.reject_reason === "autre: trajet");
}

// ---------- Le lien « Annonce » : seulement une adresse web ----------
ok("adresse http(s) : proposée", httpUrlOrNull("https://exemple.fr/offre?id=1") === "https://exemple.fr/offre?id=1" && httpUrlOrNull("http://exemple.fr/x") !== null);
ok("javascript:, texte, vide : jamais proposés", httpUrlOrNull("javascript:alert(1)") === null && httpUrlOrNull("pas une adresse") === null && httpUrlOrNull("") === null && httpUrlOrNull(null) === null && httpUrlOrNull(undefined) === null);

// ---------- Branchement ----------
const read = (f: string) => readFileSync(f, "utf8");
const offerRoute = read("app/api/offers/[id]/route.ts");
const appRoute = read("app/api/applications/[id]/route.ts");
const dialog = read("components/offer-row-delete.tsx");
const page = read("app/offres/page.tsx");
ok("route offre : lit la raison, écarte la recommandation AVANT de supprimer l'offre (ensuite le lien est perdu)", offerRoute.includes("deletionReason(") && offerRoute.includes("reject_reason: reason") && offerRoute.indexOf('from("recommendations")') > -1 && offerRoute.indexOf('from("recommendations")') < offerRoute.indexOf('from("offers").delete()'));
ok("route offre : sans raison, l'ancien comportement (analysée → à trier) est conservé", /update\(\{ status: "new" \}\)\.eq\("offer_id", id\)\.eq\("status", "analyzed"\)/.test(offerRoute));
ok("route offre : une candidature envoyée n'est jamais supprimée avec l'offre", /\.in\("status", \["a_postuler", "abandonne", "expiree"\]\)\.is\("applied_at", null\)/.test(offerRoute));
ok("route ligne : refuse une candidature déjà envoyée (409), accepte une raison, supprime la ligne", appRoute.includes("HttpError(409") && appRoute.includes("!isUnsentApp(app)") && appRoute.includes("rejectRecosOfApplication(supabase, app, reason)") && appRoute.includes('delete().eq("id", id)'));
ok("fenêtre de suppression : la même liste de raisons que « Je ne postule pas » (ReasonChips), « Annuler » et « Supprimer sans préciser »", dialog.includes("<ReasonChips") && dialog.includes("Annuler") && dialog.includes("Supprimer sans préciser") && dialog.includes("<dialog"));
ok("fenêtre : un clic sur une raison supprime avec cette raison ; la raison part en JSON", dialog.includes("onPick={(reason) => remove(reason)}") && dialog.includes("JSON.stringify({ reason })"));
ok("fenêtre : Échap et clic à côté la ferment, sans supprimer", dialog.includes("onCancel=") && dialog.includes("e.target === ref.current"));
ok("fenêtre : pas de formulaire imbriqué (la raison « Autre » est elle-même un formulaire)", !/<form[\s>]/.test(dialog));
ok("Offres & CV : bouton « Annonce » (nouvel onglet, noreferrer, libellé pour lecteur d'écran), adresse filtrée par httpUrlOrNull", page.includes("Annonce") && page.includes('target="_blank"') && page.includes('rel="noreferrer"') && /aria-label=\{`Ouvrir l'annonce/.test(page) && page.includes("httpUrlOrNull("));
ok("Offres & CV : lien « Annonce » aussi pour les lignes « À analyser » (adresse de la candidature) et les offres analysées (colonne url lue)", /ad: httpUrlOrNull\(a\.url\)/.test(page) && page.includes('select("id, title, company, location, url, created_at")') && page.includes('select("id, title, company, location, url, score,'));

done();
