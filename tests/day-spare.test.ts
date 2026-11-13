// « J'ai demandé 4 offres dans Recherche, mais dans Recommandées j'en ai eu 13 » (13 novembre, Juliana, avec la capture : 4 candidatures par jour, période 24 h).
// « Préparer ma journée » rangeait dans « À trier » TOUTES les offres trouvées qui convenaient ; la liste du jour n'en prenait que 4. Sans réseau ni base.
import { readFileSync } from "node:fs";
import { ok, done } from "./helpers";
import { leftovers } from "../lib/search-store";

const stored = Array.from({ length: 13 }, (_, i) => `r${i + 1}`);
const taken = ["r2", "r5", "r7", "r9"];
const spare = leftovers(stored, taken);
ok("13 offres rangées, 4 prises dans la liste du jour : les 9 autres sont à retirer, jamais une de la liste du jour", spare.length === 9 && taken.every((t) => !spare.includes(t)), JSON.stringify(spare));
ok("rien rangé (recherche sans résultat) ou liste du jour qui prend tout : rien à retirer", leftovers(undefined, taken).length === 0 && leftovers([], taken).length === 0 && leftovers(["a", "b"], ["a", "b", "c"]).length === 0);
ok("un identifiant en double n'est retiré qu'une fois", leftovers(["a", "a", "b"], []).length === 2);

const day = readFileSync("lib/day.ts", "utf8");
const sync = readFileSync("lib/sync.ts", "utf8");
ok("buildDay ne retire que des lignes « new » de la personne, par identifiant, après avoir choisi la liste du jour", /const spare = leftovers\(stats\?\.ids, take\);[\s\S]*?\.from\("recommendations"\)\.delete\(\)\.eq\("user_id", user\.id\)\.eq\("status", "new"\)\.in\("id", spare\.slice\(i, i \+ 100\)\)/.test(day) && day.indexOf("const take =") < day.indexOf("const spare ="));
ok("storeSearchOffers dit quelles lignes elle vient de ranger (`ids`) ; la recherche du matin, elle, garde tout (aucun appel de retrait)", /ids: \(data \?\? \[\]\)\.filter\(\(d\) => d\.status === "new"\)/.test(sync) && !/delete\(\)/.test(sync.slice(sync.indexOf("export async function storeSearchOffers"), sync.indexOf("/* ---------- 3."))));
done();
