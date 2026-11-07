// Rangement automatique à 3 semaines : une offre « À trier » reçue il y a plus de 21 jours passe dans Masquées (raison « ancienne »), sans IA.
import { OLD_AFTER_DAYS, OLD_LABEL, OLD_REASON, isOld, oldCutoff, staysAsIs } from "../lib/reco-age";
import { archiveOld } from "../lib/reco-age-db";
import { ensureFit } from "../lib/fit-stock";
import { KEPT } from "../lib/fit";
import { EMPTY_PROFILE } from "../lib/empty-profile";
import { fakeSupabase, type Row } from "./fake-supabase";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const src = (f: string) => readFileSync(join(process.cwd(), f), "utf8");
import { ok, done } from "./helpers";

const NOW = new Date("2026-11-30T10:00:00Z");
const day = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();
const U = "u1";

// ---------- Logique pure ----------
ok("le délai est de 3 semaines (21 jours)", OLD_AFTER_DAYS === 21 && /3 semaines/.test(OLD_LABEL));
ok("la date limite est 21 jours avant maintenant", oldCutoff(NOW) === new Date("2026-11-09T10:00:00Z").toISOString());
ok("reçue il y a 22 jours : ancienne ; il y a 20 jours : non ; il y a 21 jours pile : non (strictement avant)", isOld(day(22), NOW) && !isOld(day(20), NOW) && !isOld(day(21), NOW));
ok("sans date de réception (ou date illisible) : on ne conclut rien", !isOld(null, NOW) && !isOld(undefined, NOW) && !isOld("pas une date", NOW));
ok("« garde » (remise par la personne) et « ancienne » restent comme elles sont", staysAsIs(KEPT) && staysAsIs(OLD_REASON) && !staysAsIs("fit_metier") && !staysAsIs(null));

// ---------- archiveOld avec une fausse base ----------
const rec = (id: string, over: Row = {}): Row => ({ id, user_id: U, status: "new", reject_reason: null, received_at: day(30), offer_id: null, ...over });
{
  const { sb, tables, log } = fakeSupabase({
    recommendations: [
      rec("vieille"), rec("recente", { received_at: day(5) }), rec("limite", { received_at: day(20) }),
      rec("analysee", { status: "analyzed", offer_id: "o1" }), rec("gardee", { reject_reason: KEPT }),
      rec("sans-date", { received_at: null }), rec("acceptee", { status: "accepted" }), rec("ecartee", { status: "rejected", reject_reason: "metier" }),
      rec("masquee", { status: "filtered", reject_reason: "fit_stage" }), rec("autre-personne", { user_id: "u2" }),
    ],
  });
  const n = await archiveOld(sb, U, NOW);
  const by = (id: string) => tables.recommendations.find((r) => r.id === id)!;
  ok("une offre « À trier » de plus de 3 semaines est rangée dans Masquées avec la raison « ancienne »", n === 1 && by("vieille").status === "filtered" && by("vieille").reject_reason === OLD_REASON);
  ok("une offre récente (5 ou 20 jours) n'est pas touchée", by("recente").status === "new" && by("limite").status === "new");
  ok("une offre déjà analysée n'est pas rangée (elle a coûté de l'IA et reste à décider)", by("analysee").status === "analyzed");
  ok("une offre que la personne a remise dans sa liste (« garde ») n'est jamais rangée", by("gardee").status === "new" && by("gardee").reject_reason === KEPT);
  ok("sans date de réception : rien", by("sans-date").status === "new");
  ok("acceptée, écartée, déjà masquée : intactes (raisons comprises)", by("acceptee").status === "accepted" && by("ecartee").reject_reason === "metier" && by("masquee").reject_reason === "fit_stage");
  ok("l'offre d'une autre personne n'est pas touchée", by("autre-personne").status === "new");
  ok("jamais de suppression : le nombre de lignes ne change pas", tables.recommendations.length === 10 && !log.some((l) => l.startsWith("delete")));
  const again = await archiveOld(sb, U, NOW);
  ok("rejouable : le second passage ne fait rien", again === 0);
}
{
  const { sb, tables } = fakeSupabase({ recommendations: [rec("a"), rec("b", { received_at: day(40) })] });
  tables.recommendations.push(...Array.from({ length: 250 }, (_, i) => rec(`m${i}`, { received_at: day(25) })));
  const n = await archiveOld(sb, U, NOW);
  ok("beaucoup d'offres anciennes (plus d'une page, plusieurs lots de 100) : toutes rangées", n === 252 && tables.recommendations.every((r) => r.status === "filtered"));
}
{
  const { sb } = fakeSupabase({ recommendations: [rec("x")] }, {}, { missing: ["recommendations"] });
  const n = await archiveOld(sb, U, NOW);
  ok("une base qui répond une erreur : aucun plantage, rien n'est fait", n === 0);
}

// ---------- Le filtre « adapté à mon profil » ne remet pas à trier une offre rangée pour son âge ----------
{
  const profile = { ...EMPTY_PROFILE, preferences: { ...EMPTY_PROFILE.preferences, contracts: ["CDI"] } };
  const { sb, tables } = fakeSupabase({
    profiles: [{ id: U, user_id: U, data: profile }],
    recommendations: [
      rec("old", { status: "filtered", reject_reason: OLD_REASON, title: "Data analyst", snippet: "", location: "Paris" }),
      rec("kept", { reject_reason: KEPT, title: "Stage data", snippet: "", location: "Paris" }),
      rec("fit-ok-masquee", { status: "filtered", reject_reason: "fit_metier", title: "Data analyst", snippet: "", location: "Paris" }),
    ],
  });
  await ensureFit(sb, U, profile, true);
  const by = (id: string) => tables.recommendations.find((r) => r.id === id)!;
  ok("ensureFit ne remet pas à trier une offre rangée pour son âge", by("old").status === "filtered" && by("old").reject_reason === OLD_REASON);
  ok("… mais une offre masquée pour une autre raison, devenue compatible, revient toujours à trier", by("fit-ok-masquee").status === "new");
}
// L'âge est vérifié partout où les offres à trier sont lues (accueil, Recommandées, Tri rapide, synchro)
for (const f of ["app/recommandees/page.tsx", "app/recommandees/tri/page.tsx", "app/page.tsx", "lib/sync.ts"]) {
  ok(`${f} range les offres anciennes avant de les lire`, /archiveOld\(/.test(src(f)));
}
ok("la raison « ancienne » est neutre pour l'apprentissage (jamais comptée comme un refus)", !/status["']?\s*[:=]\s*["']rejected/.test(src("lib/reco-age-db.ts")));
done();
