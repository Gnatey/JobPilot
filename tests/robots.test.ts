// robots.txt : tout est fermé aux moteurs de recherche, sauf les pages publiques lues par Google (validation Gmail).
import { readFileSync } from "node:fs";
import robots from "../app/robots";
import { ok, done } from "./helpers";

const r = robots();
const rule = Array.isArray(r.rules) ? r.rules[0] : r.rules;
const allow = ([] as string[]).concat(rule.allow ?? []);
const disallow = ([] as string[]).concat(rule.disallow ?? []);

ok("tous les robots visés", rule.userAgent === "*");
ok("le reste du site reste fermé (Disallow: /)", disallow.includes("/"));
ok("accueil, mentions légales et confidentialité autorisées", allow.includes("/$") && allow.includes("/mentions-legales") && allow.includes("/confidentialite"));
ok("rien d'autre n'est ouvert (pas d'app, d'API ni d'admin)", allow.length === 3 && !allow.some((a) => /^\/(api|admin|offres|suivi|profil|parametres|documents|mon-cv|recommandees|recherche|stats|diagnostic|partage|importer)/.test(a)));

// Les pages ouvertes existent bien, et la porte (middleware) les laisse passer sans connexion
const mw = readFileSync("middleware.ts", "utf8");
ok("middleware : les pages légales sont publiques", mw.includes('"/mentions-legales"') && mw.includes('"/confidentialite"'));
ok("middleware : robots.txt n'est pas derrière la connexion", /matcher:[^\n]*robots\.txt/.test(mw));
ok("pages légales présentes", readFileSync("app/mentions-legales/page.tsx", "utf8").length > 0 && readFileSync("app/confidentialite/page.tsx", "utf8").length > 0);
done();
