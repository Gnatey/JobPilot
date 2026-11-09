// Offres & CV : la date d'une ligne vient de sa recommandation (publiée / reçue), sinon de son ajout ; le tri de la liste.
import { indexRecoDates, lineWhen, type RecoDate } from "../lib/offers-when";
import { ITEM_SORTS, sortItems } from "../lib/offers-filter";
import { whenLabel } from "../lib/posted";
import { readFileSync } from "node:fs";
import { ok, done } from "./helpers";

const NOW = new Date("2026-11-09T19:30:00Z");
const reco = (o: Partial<RecoDate>): RecoDate => ({ offer_id: null, url: null, received_at: null, origin: null, ...o });
const strip = (u: string) => u.split("?")[0];

// ---------- Rattachement d'une ligne à sa recommandation ----------
{
  const idx = indexRecoDates([
    reco({ offer_id: "o1", url: "https://h.fr/emplois/1.html?x=1", received_at: "2026-11-08T08:00:00Z", origin: "email", posted_at: "2026-11-05T12:00:00Z" }),
    reco({ offer_id: "o2", url: "https://h.fr/emplois/2.html", received_at: "2026-11-08T08:00:00Z", origin: "email" }),
    reco({ url: "https://a.fr/job/3", received_at: "2026-11-02T09:00:00Z", origin: "search" }),
    reco({ offer_id: "o4", url: null, received_at: null }),
  ], strip);
  const line = (o: { offer_id?: string | null; url?: string | null }) => lineWhen(idx, { created_at: "2026-11-09T10:00:00Z", ...o }, strip);
  ok("offre analysée : la date de publication lue passe avant l'arrivée de l'alerte", (() => { const w = line({ offer_id: "o1" }); return w.kind === "posted" && w.at === "2026-11-05T12:00:00Z"; })());
  ok("offre venue d'une alerte sans date de publication : « reçue »", (() => { const w = line({ offer_id: "o2" }); return w.kind === "received" && w.at === "2026-11-08T08:00:00Z"; })());
  ok("ligne « À analyser » : retrouvée par son adresse (paramètres de suivi ignorés), date de la source = publiée", (() => { const w = line({ url: "https://a.fr/job/3?utm_source=mail" }); return w.kind === "posted" && w.at === "2026-11-02T09:00:00Z"; })());
  ok("ligne sans recommandation (analysée à la main) : « ajoutée », date de création", (() => { const w = line({ offer_id: "zz", url: "https://autre.fr/x" }); return w.kind === "added" && w.at === "2026-11-09T10:00:00Z"; })());
  ok("recommandation sans date : ignorée, la ligne garde sa date d'ajout", line({ offer_id: "o4" }).kind === "added");
  ok("libellé affiché", whenLabel({ at: new Date(NOW.getTime() - 3 * 864e5).toISOString(), kind: "posted" }, NOW) === "publiée il y a 3 j");
}
{
  // Deux recommandations pour la même annonce : la date de publication gagne, puis la plus ancienne
  const idx = indexRecoDates([
    reco({ url: "https://s.fr/1", received_at: "2026-11-08T08:00:00Z", origin: "email" }),
    reco({ url: "https://s.fr/1", received_at: "2026-11-01T08:00:00Z", origin: "email" }),
    reco({ url: "https://s.fr/1", received_at: "2026-11-09T08:00:00Z", origin: "search" }),
  ]);
  const w = lineWhen(idx, { url: "https://s.fr/1", created_at: "2026-11-09T10:00:00Z" });
  ok("plusieurs recommandations pour une annonce : la date de la source (publiée) l'emporte", w.kind === "posted" && w.at === "2026-11-09T08:00:00Z");
}

// ---------- Tri de la liste ----------
{
  const it = (key: string, at: string, score: number | null) => ({ key, at, score });
  const list = [it("a", "2026-11-01T00:00:00Z", 60), it("b", "2026-11-07T00:00:00Z", null), it("c", "2026-11-05T00:00:00Z", 90), it("d", "2026-11-07T00:00:00Z", 80)];
  const keys = (xs: { key: string }[]) => xs.map((x) => x.key).join(",");
  ok("récentes d'abord, à date égale le meilleur score", keys(sortItems(list, "date")) === "d,b,c,a");
  ok("anciennes d'abord", keys(sortItems(list, "old")) === "a,c,d,b");
  ok("meilleur score d'abord, sans score à la fin", keys(sortItems(list, "score")) === "c,d,a,b");
  ok("la liste d'origine n'est pas modifiée", keys(list) === "a,b,c,d");
  ok("trois choix, récentes d'abord par défaut", ITEM_SORTS.map((o) => o.id).join(",") === "date,old,score");
  ok("liste vide : aucune erreur", sortItems([], "old").length === 0);
}

// ---------- Câblage ----------
{
  const page = readFileSync("app/offres/page.tsx", "utf8");
  ok("la page lit posted_at seulement si la colonne existe", /hasPostedColumn\(supabase\)/.test(page) && /withPosted \? "offer_id, url, received_at, origin, posted_at"/.test(page));
  ok("la liste propose le tri et ne perd pas la recherche", /ITEM_SORTS/.test(readFileSync("components/offers-list.tsx", "utf8")) && /sortItems\(selectItems\(items, q, filter\), sort\)/.test(readFileSync("components/offers-list.tsx", "utf8")));
}
done();
