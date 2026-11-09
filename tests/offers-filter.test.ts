// Offres & CV : recherche, filtres (avec CV / sans CV / à analyser) et « Voir les N autres » (la liste faisait 13 000 px avec 200 lignes).
import { readFileSync } from "node:fs";
import { FILTERS, PAGE_SIZE, TOOLS_FROM, filterCounts, matchesFilter, matchesQuery, nextBatch, norm, selectItems, visibleFilters, type ListItem } from "../lib/offers-filter";
import { ok, done } from "./helpers";

const item = (key: string, over: Partial<ListItem> = {}): ListItem => ({
  key, kind: "offer", href: `/offres/${key}`, ad: null, score: 80, title: "Data Analyst", sub: "Acme, Paris", state: "À postuler", meta: "Aucun CV, 1 nov.", at: `2026-11-0${(Number(key.replace(/\D/g, "")) % 9) + 1}`, cv: 0, ...over,
});
const list: ListItem[] = [
  item("o1", { title: "Data Analyst BI", sub: "Orano, Paris, Industrie", cv: 2 }),
  item("o2", { title: "Chargé d'études statistiques", sub: "École Polytechnique, Palaiseau", cv: 0 }),
  item("o3", { title: "Analyste reporting", sub: "SNCF Voyageurs, Saint-Denis", cv: 1 }),
  item("a1", { kind: "app", title: "Consultant Power BI", sub: "Capgemini, Lyon", score: null, cv: 0, state: "À postuler" }),
  item("o4", { title: "Data Engineer", sub: "Acme, Lille", cv: 0, state: null }),
];

// ---------- Recherche ----------
ok("sans accents ni majuscules, apostrophe droite ou courbe", norm("École d’Été") === "ecole d'ete");
ok("recherche vide : tout passe", list.every((i) => matchesQuery(i, "")) && list.every((i) => matchesQuery(i, "   ")));
ok("poste, entreprise, lieu et type d'entreprise se cherchent", matchesQuery(list[0], "analyst") && matchesQuery(list[0], "orano") && matchesQuery(list[0], "paris") && matchesQuery(list[0], "industrie"));
ok("sans accents : « ecole » trouve « École », « charge d'etudes » trouve « Chargé d'études »", matchesQuery(list[1], "ecole") && matchesQuery(list[1], "charge d'etudes") && matchesQuery(list[1], "CHARGÉ D’ÉTUDES"));
ok("plusieurs mots, dans n'importe quel ordre, tous requis", matchesQuery(list[0], "paris data") && matchesQuery(list[0], "bi orano") && !matchesQuery(list[0], "orano lyon"));
ok("on ne cherche ni dans l'étape ni dans « Aucun CV » (« cv » ne ramène pas toute la liste)", !matchesQuery(list[1], "cv") && !matchesQuery(list[1], "postuler") && !matchesQuery(list[1], "aucun"));

// ---------- Filtres ----------
const keys = (f: Parameters<typeof matchesFilter>[1]) => list.filter((i) => matchesFilter(i, f)).map((i) => i.key).join(",");
ok("Toutes : toutes les lignes", keys("all") === "o1,o2,o3,a1,o4");
ok("Avec CV : les offres analysées qui ont au moins un CV", keys("with_cv") === "o1,o3");
ok("Sans CV : les offres analysées sans CV (pas les lignes « à analyser »)", keys("no_cv") === "o2,o4");
ok("À analyser : les candidatures dont l'offre n'est pas encore lue", keys("to_analyze") === "a1");
ok("recherche et filtre se combinent, l'ordre de la liste est gardé", selectItems(list, "data", "no_cv").map((i) => i.key).join(",") === "o4" && selectItems(list, "analy", "all").map((i) => i.key).join(",") === "o1,o3" && selectItems(list, "analy", "with_cv").length === 2 && selectItems(list, "power", "to_analyze").map((i) => i.key).join(",") === "a1" && selectItems(list, "", "all").length === 5);
ok("aucun résultat : liste vide, pas d'erreur", selectItems(list, "zzz", "all").length === 0);

// ---------- Boutons de filtre ----------
{
  const c = filterCounts(list);
  ok("les compteurs portent sur toute la liste (ils ne bougent pas pendant la frappe)", c.all === 5 && c.with_cv === 2 && c.no_cv === 2 && c.to_analyze === 1);
  ok("tous les filtres connus ont un compteur", FILTERS.every((f) => typeof c[f.id] === "number"));
  ok("un filtre vide n'est pas proposé, sauf s'il est actif ; « Toutes » toujours", visibleFilters({ all: 4, with_cv: 0, no_cv: 4, to_analyze: 0 }, "all").map((f) => f.id).join() === "all,no_cv" && visibleFilters({ all: 4, with_cv: 0, no_cv: 4, to_analyze: 0 }, "with_cv").map((f) => f.id).join() === "all,with_cv,no_cv");
  ok("un seul choix possible : aucun bouton", visibleFilters({ all: 9, with_cv: 0, no_cv: 0, to_analyze: 0 }, "all").length === 0 && visibleFilters({ all: 9, with_cv: 0, no_cv: 9, to_analyze: 0 }, "all").length === 2);
}

// ---------- Voir les N autres ----------
ok("30 lignes d'abord, outils à partir de 8 lignes", PAGE_SIZE === 30 && TOOLS_FROM === 8);
ok("« Voir les N autres » : 30 de plus, ou ce qui reste, puis plus rien", nextBatch(200, 30) === 30 && nextBatch(200, 180) === 20 && nextBatch(40, 30) === 10 && nextBatch(30, 30) === 0 && nextBatch(5, 30) === 0 && nextBatch(0, 30) === 0);

// ---------- Branchement ----------
const page = readFileSync("app/offres/page.tsx", "utf8");
const comp = readFileSync("components/offers-list.tsx", "utf8");
const work = readFileSync("components/offers-workspace.tsx", "utf8");
ok("la page passe ses lignes à l'espace de travail, qui les passe à OffersList (plus de liste de 200 lignes écrite en dur)", /<OffersWorkspace\s+items=\{items\}/.test(page) && work.includes("<OffersList items={items}") && !page.includes('<ul className="list">'));
ok("la page lit toujours toutes les offres, candidatures, CV, textes gardés et dates de recommandations page après page", (page.match(/fetchAll\(/g) ?? []).length === 7 && !/\.limit\(/.test(page));
ok("chaque ligne garde sa fiche, « Annonce » et la suppression avec raison", comp.includes("<Link href={it.href}") && comp.includes("Ouvrir l'annonce") && comp.includes("<OfferRowDelete kind={it.kind} id={it.key} label={it.title} />"));
ok("accessibilité : champ de recherche étiqueté, filtres en boutons à état (aria-pressed), nombre de résultats annoncé (role=status), bouton « Tout afficher »", comp.includes('aria-label="Rechercher dans Offres & CV"') && comp.includes("aria-pressed={filter === f.id}") && comp.includes('role="status"') && comp.includes("Tout afficher") && comp.includes('className="link hit font-semibold"'));
ok("« Voir les N autres » et le compte des lignes affichées", comp.includes("Voir les {batch} autres") && comp.includes("affichées sur"));
ok("une nouvelle recherche ou un autre filtre repart des 30 premières lignes", /const search = [^\n]*setShown\(PAGE_SIZE\)/.test(comp) && /const pick = [^\n]*setShown\(PAGE_SIZE\)/.test(comp));

done();
