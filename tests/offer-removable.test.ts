// Supprimer une ligne d'Offres & CV : une ligne « À postuler » qui porte une date d'envoi laissée par une ancienne synchro n'est plus bloquée,
// une vraie candidature l'est toujours. Bilan des lignes impossibles à vérifier. Aucun réseau.
import { isRemovableToApply, isUnsentApp } from "../lib/app-pick";
import { unclearSkips, NO_LINK_SITE, type CheckResult } from "../lib/offer-check";
import { groupSkips, groupBySite, siteAdvice } from "../lib/analyze-skips";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ok, done } from "./helpers";

const src = (f: string) => readFileSync(join(process.cwd(), f), "utf8");

// ---------- Qui peut partir ----------
ok("une ligne jamais envoyée peut partir (comme avant)", isRemovableToApply({ status: "a_postuler" }) && isRemovableToApply({ status: "abandonne" }) && isRemovableToApply({ status: "expiree" }));
ok("« À postuler » avec une date d'envoi laissée par l'ancienne synchro et RIEN d'autre : peut partir (le cas bloqué du 31 octobre)",
  !isUnsentApp({ status: "a_postuler", applied_at: "2026-10-31" }) && isRemovableToApply({ status: "a_postuler", applied_at: "2026-10-31", notes: null, contact: null, salary: null, interview_at: null }));
ok("…mais pas si la personne y a écrit une note, un contact, un salaire ou fixé un entretien",
  !isRemovableToApply({ status: "a_postuler", applied_at: "2026-10-31", notes: "rappeler lundi" }) &&
  !isRemovableToApply({ status: "a_postuler", applied_at: "2026-10-31", contact: "Mme Dupont" }) &&
  !isRemovableToApply({ status: "a_postuler", applied_at: "2026-10-31", salary: "45k" }) &&
  !isRemovableToApply({ status: "a_postuler", applied_at: "2026-10-31", interview_at: "2026-11-12T10:00:00Z" }));
ok("une note faite d'espaces ne compte pas comme une trace", isRemovableToApply({ status: "a_postuler", applied_at: "2026-10-31", notes: "   ", contact: "" }));
ok("une candidature envoyée ne part JAMAIS d'ici (Postulé, Entretien, Test, Relancé, Offre, Refusé)",
  ["postule", "entretien", "test", "relance", "offre", "refuse"].every((st) => !isRemovableToApply({ status: st, applied_at: "2026-10-31" }) && !isRemovableToApply({ status: st })));
ok("une ligne Abandonnée avec une date d'envoi reste protégée (elle a vraiment été envoyée)", !isRemovableToApply({ status: "abandonne", applied_at: "2026-10-31" }));
{
  const r = src("app/api/applications/[id]/route.ts");
  ok("la route de suppression utilise la règle et lit les colonnes qui la décident", /isRemovableToApply\(app\)/.test(r) && /notes, contact, salary, interview_at/.test(r) && !/isUnsentApp/.test(r));
  ok("le refus 409 reste en place pour une vraie candidature", /409/.test(r));
}

// ---------- Bilan des lignes impossibles à vérifier ----------
const lines = new Map([
  ["a", { title: "Analyste BI", url: "https://fr.indeed.com/viewjob?jk=1" }],
  ["b", { title: "Data engineer", url: "https://www.hellowork.com/fr-fr/emplois/9.html" }],
  ["c", { title: "Sans lien", url: null }],
  ["d", { title: "Ligne vérifiée", url: "https://exemple.fr/o" }],
  ["e", { title: "Disparue", url: "https://exemple.fr/p" }],
]);
const res: CheckResult[] = [
  { id: "a", verdict: "skipped", site: "Indeed" }, { id: "b", verdict: "unknown", site: "HelloWork" }, { id: "c", verdict: "skipped", site: "texte" },
  { id: "d", verdict: "online", site: "Site entreprise" }, { id: "e", verdict: "gone", site: "Site entreprise" },
];
{
  const u = unclearSkips(res, lines);
  ok("seules les lignes impossibles à vérifier (bloquées, sans lien, illisibles) sont listées", u.map((s) => s.appId).sort().join() === "a,b,c");
  ok("ni les lignes en ligne ni les disparues", !u.some((s) => s.appId === "d" || s.appId === "e"));
  ok("elles sont rangées « illisibles » : lien, « Coller le texte » et corbeille, jamais cochées pour suppression", u.every((s) => s.kind === "unreadable") && groupSkips(u).gone.length === 0);
  ok("une ligne sans lien porte le nom « Sans lien », pas « texte »", u.find((s) => s.appId === "c")!.site === NO_LINK_SITE);
  ok("les lignes sont rangées par site", groupBySite(u).map((g) => g.site).sort().join() === ["HelloWork", "Indeed", NO_LINK_SITE].sort().join());
  ok("chaque groupe a son conseil", siteAdvice(NO_LINK_SITE).includes("pas de lien") && siteAdvice("Indeed").includes("Indeed") && siteAdvice("HelloWork").length > 20);
  ok("une ligne inconnue de la liste garde un titre de secours", unclearSkips([{ id: "z", verdict: "unknown", site: "X" }], lines)[0].title === "Annonce");
}
{
  const c = src("components/check-ads.tsx");
  ok("l'écran passe les lignes disparues ET les lignes impossibles à vérifier au bilan", /\[\.\.\.run\.gone, \.\.\.run\.unclear\]/.test(c) && /unclearSkips\(results, byId\)/.test(c));
  ok("une ligne supprimée sort des deux listes", /removeSkips\(r\.unclear, ids\)/.test(c));
}
done();
