// Doublons d'Offres & CV : repérage (sûr / à relire), choix de la ligne gardée, protections. Logique pure, aucun réseau.
import { findDuplicates, droppable, droppableKeys, dupSummary, titleKey, companyKey, knownCompany, MIN_MAYBE_TITLE, type DupItem } from "../lib/offer-dups";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ok, done } from "./helpers";

const src = (f: string) => readFileSync(join(process.cwd(), f), "utf8");
let n = 0;
const it = (title: string, company: string, over: Partial<DupItem> = {}): DupItem => ({
  key: `k${++n}`, kind: "app", title, company, href: `/x/${n}`, ad: `https://exemple.fr/${n}`, score: null, at: `2026-10-${String(10 + (n % 15)).padStart(2, "0")}T10:00:00Z`, cv: 0, ...over,
});

// ---------- Clés de comparaison ----------
ok("l'intitulé se compare sans (H/F), accents ni majuscules", titleKey("Administrateur Base de Données H/F") === titleKey("ADMINISTRATEUR base de donnees (F/H)"));
ok("l'entreprise se compare sans SA, groupe, France", companyKey("Klesia") === companyKey("KLESIA") && companyKey("Société Générale SA") === companyKey("société générale") && companyKey("Capgemini France") === companyKey("Capgemini"));
ok("« Non spécifié », « Non communiqué », « Entreprise ? » ne sont pas des entreprises", !knownCompany("Non spécifié") && !knownCompany("Non communiqué") && !knownCompany("Entreprise ?") && !knownCompany("") && knownCompany("Atos"));

// ---------- Doublons sûrs ----------
{
  const a = it("Développeur Angular / Python Django (H/F)", "Atos");
  const b = it("Développeur Angular / Python Django (H/F)", "Atos");
  const c = it("Autre poste", "Atos");
  const g = findDuplicates([a, b, c]);
  ok("deux lignes de même intitulé et même entreprise : un groupe sûr", g.length === 1 && g[0].sure && g[0].items.length === 2);
  ok("une seule ligne en trop est proposée, l'autre est gardée", droppableKeys(g).length === 1 && droppable(g[0], g[0].items[1]) && !droppable(g[0], g[0].items[0]));
  ok("la plus ancienne est gardée à égalité", g[0].items[0].at <= g[0].items[1].at);
}
{
  const offer = it("Chargé de mission data F/H", "Crédit Agricole CIB", { kind: "offer", score: 72, cv: 0 });
  const app = it("Chargé de mission data H/F", "Crédit Agricole CIB", { kind: "app", at: "2026-09-01T00:00:00Z" });
  const g = findDuplicates([app, offer]);
  ok("l'offre déjà analysée est préférée à la ligne « à analyser », même plus récente", g.length === 1 && g[0].keepId === offer.key);
}
{
  const withCv = it("Consultant Data & IA (F/H)", "Deloitte", { kind: "app", cv: 2, at: "2026-10-30T00:00:00Z" });
  const plain = it("Consultant Data & IA (F/H)", "Deloitte", { kind: "offer", score: 80, at: "2026-09-01T00:00:00Z" });
  const g = findDuplicates([plain, withCv]);
  ok("la ligne qui a un CV est gardée avant tout, et n'est jamais proposée", g.length === 1 && g[0].keepId === withCv.key && !droppable(g[0], withCv));
  ok("l'autre est proposée à la suppression", droppable(g[0], plain));
}
{
  const a = it("Data Office - Gouvernance & Qualité", "Bpifrance", { kind: "offer", cv: 1 });
  const b = it("Data Office - Gouvernance & Qualité", "Bpifrance", { kind: "offer", cv: 3 });
  ok("deux lignes qui ont chacune un CV : rien à supprimer, pas de groupe", findDuplicates([a, b]).length === 0);
}
{
  const a = it("Chef de projet SI", "Alpha"), b = it("Chef de projet SI", "Beta");
  ok("un intitulé court chez deux entreprises différentes n'est PAS un doublon", findDuplicates([a, b]).length === 0);
  const t = "Responsable de la gouvernance des données";
  ok("un intitulé précis dépasse le seuil de " + MIN_MAYBE_TITLE + " caractères utiles", titleKey(t).length >= MIN_MAYBE_TITLE);
}

// ---------- À relire : même intitulé précis, entreprise différente ou inconnue ----------
{
  const t = "Consultant fonctionnel data migration SAP S/4HANA – PS / CSS – transactionnel";
  const a = it(t, "Non communiqué"), b = it(t, "Aéronautique"), c = it(t, "Non spécifié");
  const g = findDuplicates([a, b, c]);
  ok("la même annonce reçue trois fois avec trois « entreprises » : un groupe à relire", g.length === 1 && !g[0].sure && g[0].items.length === 3);
  ok("rien n'est coché d'office dans un groupe à relire (le composant coche seulement les groupes sûrs)", g[0].sure === false);
  ok("le résumé distingue sûrs et à relire", /à relire/.test(dupSummary(g)) && !/sûrs/.test(dupSummary(g)));
}
{
  const t = "Gestionnaire Shadow IT et Gouvernance SI H/F";
  const a = it(t, "Crédit Agricole S.A."), b = it(t, "Crédit Agricole CIB"), c = it(t, "Crédit Agricole CIB");
  const g = findDuplicates([a, b, c]);
  ok("un groupe sûr (CIB deux fois) ET un groupe à relire (avec Crédit Agricole S.A.)", g.filter((x) => x.sure).length === 1 && g.filter((x) => !x.sure).length === 1);
  ok("le groupe sûr passe avant", g[0].sure === true);
  ok("le groupe à relire ne compte qu'UNE ligne par entreprise (la meilleure du groupe sûr)", g.find((x) => !x.sure)!.items.length === 2);
}

// ---------- Rien à signaler ----------
ok("aucune ligne en double : aucun groupe", findDuplicates([it("A", "X"), it("B", "Y")]).length === 0 && findDuplicates([]).length === 0);
ok("un intitulé vide n'est jamais rapproché", findDuplicates([it("", "X"), it("", "X")]).length === 0);

// ---------- Le composant et ses garanties ----------
{
  const c = src("components/offer-dups.tsx");
  ok("le composant ne coche d'office que les groupes sûrs", /over\[it\.key\] \?\? g\.sure/.test(c));
  ok("la suppression se fait sans raison (un doublon ne dit rien des goûts)", /body: "\{\}"/.test(c) && !/reason/.test(c));
  ok("confirmation avant de supprimer, et lien d'annonce sûr (linkOf, noopener)", /showModal/.test(c) && /linkOf\(it\.ad\)/.test(c) && /noopener noreferrer/.test(c));
  ok("aucune requête de calcul : tout se fait dans le navigateur", !/fetch\("\/api\/offers\/check|\/api\/.*dup/.test(c));
  const w = src("components/offers-workspace.tsx");
  ok("le composant est branché dans Offres & CV", /<OfferDups items=\{dupItems\}/.test(w));
  const p = src("app/offres/page.tsx");
  ok("la page donne l'entreprise de chaque ligne (offres et lignes à analyser)", (p.match(/company: \(/g) ?? []).length === 2);
}
done();
