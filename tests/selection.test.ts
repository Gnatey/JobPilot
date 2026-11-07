// Sélection de lignes « À analyser » dans Offres & CV (lib/selection.ts) : cocher, décocher, élaguer, restreindre la file.
import { checkedLabel, pruneSelection, restrictQueue, setMany, toggleId } from "../lib/selection";
import { ok, done } from "./helpers";

const s0: ReadonlySet<string> = new Set();
const s1 = toggleId(s0, "a");
ok("cocher une ligne", s1.has("a") && s1.size === 1);
ok("la sélection d'origine n'est jamais modifiée", s0.size === 0);
ok("recliquer décoche", !toggleId(s1, "a").has("a"));
ok("tout cocher d'un coup, sans doublon", setMany(s1, ["a", "b", "c"], true).size === 3);
ok("tout décocher d'un coup", setMany(new Set(["a", "b", "c"]), ["a", "c", "zzz"], false).size === 1);
ok("une ligne analysée ou supprimée quitte la sélection", pruneSelection(new Set(["a", "b", "c"]), ["b", "c", "d"]).join() === "b,c");
ok("sélection vide : rien", pruneSelection(new Set(), ["a"]).length === 0);
ok("libellé", checkedLabel(1) === "1 cochée" && checkedLabel(12) === "12 cochées");

const q = {
  items: [{ app_id: "a", n: 1 }, { app_id: "b", n: 2 }, { app_id: "c", n: 3 }],
  blocked: [{ app_id: "d" }, { app_id: "e" }],
  skippedIds: ["f", "g"], skipped: 2,
};
const all = restrictQueue(q, null);
ok("sans sélection (Tout analyser) : la file entière, telle quelle", all.items.length === 3 && all.blocked.length === 2 && all.noSource === 2);
const some = restrictQueue(q, new Set(["a", "c", "d", "f", "zzz"]));
ok("avec une sélection : seulement les lignes cochées, l'ordre de la file est gardé", some.items.map((i) => i.app_id).join() === "a,c");
ok("les lignes mises de côté et sans texte sont comptées parmi les cochées seulement", some.blocked.map((b) => b.app_id).join() === "d" && some.noSource === 1);
ok("une ligne cochée absente de la file (déjà analysée) ne casse rien", restrictQueue(q, new Set(["zzz"])).items.length === 0);

done();
