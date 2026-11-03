// Offres & CV : quelle offre analysée reste dans Recommandées, laquelle passe ici, laquelle va dans Suivi.
import { partitionOffers } from "../lib/offers-todo";
import { ok, done } from "./helpers";

const offers = [
  { id: "analysee-a-trier", decision: null },          // analysée depuis Recommandées, rien décidé
  { id: "a-postuler", decision: "accepted" },          // « Je candidate » : candidature À postuler
  { id: "postulee", decision: "accepted" },            // candidature envoyée
  { id: "refusee", decision: "accepted" },             // candidature refusée
  { id: "abandonnee", decision: "accepted" },
  { id: "ecartee", decision: "rejected" },             // « Pas pour moi »
  { id: "a-la-main", decision: null },                 // collée à la main, jamais passée par Recommandées
  { id: "a-la-main-ecartee", decision: "rejected" },
];
const status = new Map([["a-postuler", "a_postuler"], ["postulee", "postule"], ["refusee", "refuse"], ["abandonnee", "abandonne"]]);
const inReco = new Set(["analysee-a-trier"]);
const r = partitionOffers(offers, status, inReco);
const ids = r.todo.map((o) => o.id);

ok("analysée mais pas décidée (venue de Recommandées) : ne bouge pas, absente d'Offres & CV", !ids.includes("analysee-a-trier") && r.waiting === 1);
ok("« Je candidate » (À postuler) : dans Offres & CV", ids.includes("a-postuler"));
ok("postulée, refusée, abandonnée : dans Suivi, pas ici", !ids.includes("postulee") && !ids.includes("refusee") && !ids.includes("abandonnee"));
ok("« Pas pour moi » : n'apparaît plus", !ids.includes("ecartee") && !ids.includes("a-la-main-ecartee"));
ok("analyse faite à la main, pas décidée : à décider ici (pas d'autre endroit)", ids.includes("a-la-main"));
ok("liste exacte, ordre d'origine conservé", JSON.stringify(ids) === JSON.stringify(["a-postuler", "a-la-main"]), JSON.stringify(ids));
ok("compteurs : 2 ici, 1 attend dans Recommandées, 5 ailleurs (Suivi ou écartées)", r.todo.length === 2 && r.waiting === 1 && r.elsewhere === 5, JSON.stringify({ todo: r.todo.length, waiting: r.waiting, elsewhere: r.elsewhere }));

// Dès qu'une décision est prise, l'offre quitte Recommandées pour sa nouvelle place
const decided = partitionOffers(offers, new Map([...status, ["analysee-a-trier", "a_postuler"]]), new Set());
ok("décidée « À postuler » : passe dans Offres & CV", decided.todo.some((o) => o.id === "analysee-a-trier") && decided.waiting === 0);
const sent = partitionOffers(offers, new Map([...status, ["analysee-a-trier", "postule"]]), new Set());
ok("analysée puis postulée : va dans Suivi, plus ici", !sent.todo.some((o) => o.id === "analysee-a-trier") && sent.waiting === 0);
// Même si la reco est encore marquée « à trier » par erreur, une candidature existante l'emporte
const both = partitionOffers(offers, new Map([...status, ["analysee-a-trier", "postule"]]), inReco);
ok("la candidature l'emporte sur l'état de la reco", !both.todo.some((o) => o.id === "analysee-a-trier") && both.waiting === 0);
ok("listes vides sans erreur", partitionOffers([], new Map(), new Set()).todo.length === 0);
done();
