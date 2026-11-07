// Ordre de la liste « À trier » : date (défaut) ou pré-score.
import { sortRecos, SORT_OPTIONS } from "../lib/reco-sort";
import { ok, done } from "./helpers";

const r = (id: string, received_at: string | null, score: number) => ({ id, received_at, score });
const list = [r("a", "2026-11-01T10:00:00Z", 60), r("b", "2026-11-07T09:00:00Z", 10), r("c", "2026-11-05T09:00:00Z", 90), r("d", null, 99), r("e", "2026-11-07T09:00:00Z", 40)];
const ids = (xs: { id: string }[]) => xs.map((x) => x.id).join(",");

ok("par date : la plus récente d'abord, sans date à la fin, à date égale le meilleur score d'abord", ids(sortRecos(list, "date")) === "e,b,c,a,d");
ok("par score : le meilleur d'abord, à score égal la plus récente", ids(sortRecos(list, "score")) === "d,c,a,e,b");
ok("la liste d'origine n'est pas modifiée", ids(list) === "a,b,c,d,e");
ok("ordre stable à égalité complète (l'identifiant tranche)", ids(sortRecos([r("z", "2026-11-01T00:00:00Z", 5), r("y", "2026-11-01T00:00:00Z", 5)], "date")) === "y,z");
ok("une date illisible compte comme « sans date »", ids(sortRecos([r("p", "n'importe quoi", 99), r("q", "2026-11-01T00:00:00Z", 1)], "date")) === "q,p");
ok("liste vide : aucune erreur", sortRecos([], "date").length === 0);
ok("deux choix proposés, la date en premier (c'est le défaut)", SORT_OPTIONS.length === 2 && SORT_OPTIONS[0].id === "date" && SORT_OPTIONS[1].id === "score");
done();
