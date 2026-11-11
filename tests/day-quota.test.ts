// « J'en ai demandé 4 et j'en ai eu 13 » (11 novembre, Juliana). Deux défauts prouvés par la lecture du code :
// (1) le formulaire de Recherche ne comptait pas « Candidatures par jour » dans ses changements : changer seulement ce nombre n'enregistrait rien avant « Préparer ma journée » ;
// (2) la liste du jour déjà prête (10 offres à trancher) était reprise telle quelle, même après un nouveau nombre. Sans réseau ni base.
import { readFileSync } from "node:fs";
import { ok, done } from "./helpers";
import { dayIsStale } from "../lib/day";

ok("critères changés : la liste du jour est refaite (comme avant)", dayIsStale(true, 10, 10));
ok("seul le nombre de candidatures par jour change (10 → 4) : la liste est refaite, sinon l'ancienne liste de 10 serait reprise", dayIsStale(false, 10, 4) && dayIsStale(false, 4, 10));
ok("rien ne change : la liste du jour en cours est gardée (on ne perd pas son tri en réenregistrant)", !dayIsStale(false, 4, 4));

const page = readFileSync("app/recherche/page.tsx", "utf8");
ok("« Préparer ma journée » enregistre d'abord quand le nombre de candidatures par jour diffère de celui que le serveur connaît", /const \[savedQuota, setSavedQuota\]/.test(page) && /savedQuota !== quota\) && !\(await saveCriteria\(true\)\)/.test(page));
ok("le nombre connu du serveur est tenu à jour au chargement et après chaque enregistrement", /setSavedQuota\(q0\)/.test(page) && /setSavedQuota\(quota\);/.test(page));
ok("l'écran vide « Ma journée » quand le serveur dit que la liste est refaite (`reset`)", /r\.changed \|\| r\.reset/.test(page));

const route = readFileSync("app/api/criteria/route.ts", "utf8");
ok("la route compare avec le nombre en vigueur avant d'écrire, remet `day` à zéro et le dit au navigateur", /dayIsStale\(changed, dailyQuota\(profile\), quota\)/.test(route) && /reset \? \{ day: null \}/.test(route) && /ok: true, changed, reset,/.test(route));

done();
