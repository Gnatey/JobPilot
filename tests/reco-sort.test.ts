// Ordre des listes d'offres : date de PUBLICATION sur le site (sinon date d'arrivée), plus récentes ou plus anciennes d'abord, ou score.
import { sortRecos, SORT_OPTIONS } from "../lib/reco-sort";
import { ok, done } from "./helpers";

type R = { id: string; received_at: string | null; score: number; posted_at?: string | null; origin?: string | null };
const r = (id: string, received_at: string | null, score: number, extra: Partial<R> = {}): R => ({ id, received_at, score, ...extra });
const list = [r("a", "2026-11-01T10:00:00Z", 60), r("b", "2026-11-07T09:00:00Z", 10), r("c", "2026-11-05T09:00:00Z", 90), r("d", null, 99), r("e", "2026-11-07T09:00:00Z", 40)];
const ids = (xs: { id: string }[]) => xs.map((x) => x.id).join(",");

ok("par date : la plus récente d'abord, sans date à la fin, à date égale le meilleur score d'abord", ids(sortRecos(list, "date")) === "e,b,c,a,d");
ok("plus anciennes d'abord : l'inverse, mais SANS date toujours à la fin", ids(sortRecos(list, "old")) === "a,c,e,b,d");
ok("par score : le meilleur d'abord, à score égal la plus récente", ids(sortRecos(list, "score")) === "d,c,a,e,b");
ok("la liste d'origine n'est pas modifiée", ids(list) === "a,b,c,d,e");
ok("ordre stable à égalité complète (l'identifiant tranche)", ids(sortRecos([r("z", "2026-11-01T00:00:00Z", 5), r("y", "2026-11-01T00:00:00Z", 5)], "date")) === "y,z");
ok("une date illisible compte comme « sans date »", ids(sortRecos([r("p", "n'importe quoi", 99), r("q", "2026-11-01T00:00:00Z", 1)], "date")) === "q,p");
ok("deux « sans date » en ordre croissant : pas de NaN, l'ordre reste stable (score puis identifiant)", ids(sortRecos([r("n1", null, 10), r("n2", null, 50), r("n3", null, 50)], "old")) === "n2,n3,n1");
ok("liste vide : aucune erreur", sortRecos([], "date").length === 0 && sortRecos([], "old").length === 0);
ok("trois choix proposés : récentes d'abord (défaut), anciennes d'abord, score", SORT_OPTIONS.map((o) => o.id).join(",") === "date,old,score");

// ---------- Date de publication sur le site : elle passe avant la date d'arrivée ----------
{
  // Deux alertes e-mail reçues le même jour (8 novembre) : l'une publiée le 20 octobre, l'autre publiée hier
  const mail = [r("vieille", "2026-11-08T08:00:00Z", 50, { origin: "email", posted_at: "2026-10-20T12:00:00Z" }), r("fraiche", "2026-11-08T08:00:00Z", 50, { origin: "email", posted_at: "2026-11-07T12:00:00Z" }), r("inconnue", "2026-11-08T08:00:00Z", 50, { origin: "email" })];
  ok("par date : la publiée la plus récemment d'abord, même si toutes sont arrivées ensemble", ids(sortRecos(mail, "date")) === "inconnue,fraiche,vieille" || ids(sortRecos(mail, "date")) === "fraiche,inconnue,vieille");
  ok("plus anciennes d'abord : la publiée le 20 octobre est la première", sortRecos(mail, "old")[0].id === "vieille");
  // Une offre Adzuna (origine « search ») : sa date d'arrivée EST sa date de publication
  const mix = [r("az", "2026-11-03T09:00:00Z", 40, { origin: "search" }), r("mail", "2026-11-08T09:00:00Z", 40, { origin: "email" }), r("page", "2026-11-09T09:00:00Z", 40, { origin: "page" })];
  ok("les trois sortes de dates se rangent ensemble", ids(sortRecos(mix, "date")) === "page,mail,az");
  // La date de publication d'une offre prise sur une page l'emporte sur l'instant de la prise
  ok("une offre prise sur une page mais publiée il y a 3 semaines passe après une alerte d'hier", ids(sortRecos([r("page", "2026-11-09T09:00:00Z", 40, { origin: "page", posted_at: "2026-10-19T12:00:00Z" }), r("mail", "2026-11-08T09:00:00Z", 40, { origin: "email" })], "date")) === "mail,page");
}
done();
