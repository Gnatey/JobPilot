// robots.txt : tout est fermé aux moteurs de recherche, sauf les pages publiques lues par Google (validation Gmail).
import { execSync } from "node:child_process";
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

// « noindex » partout, sauf l'accueil visiteur (sinon la demande d'indexation faite dans Search Console serait refusée)
const layout = readFileSync("app/layout.tsx", "utf8");
const home = readFileSync("app/page.tsx", "utf8");
const visitor = home.slice(home.indexOf("absolute:"), home.indexOf("/** Visiteur"));
ok("layout : tout le site reste en noindex par défaut", /robots:\s*\{\s*index:\s*false/.test(layout));
ok("accueil visiteur : indexable", /robots:\s*\{\s*index:\s*true/.test(visitor));
ok("accueil connecté (tableau de bord) : pas indexable", !/index:\s*true/.test(home.slice(home.indexOf("signedIn()) return"), home.indexOf("absolute:"))));
ok("pages légales : indexables (Google les lit pour la validation de la marque)", /robots:\s*\{\s*index:\s*true/.test(readFileSync("app/mentions-legales/page.tsx", "utf8")) && /robots:\s*\{\s*index:\s*true/.test(readFileSync("app/confidentialite/page.tsx", "utf8")));
// Aucune autre page n'est indexable : on cherche « index: true » dans toutes les pages et routes du dossier app
const indexable = execSync('grep -rlE "index:\\s*true" app --include=*.ts --include=*.tsx', { encoding: "utf8" }).split("\n").filter(Boolean).sort();
ok("seules l'accueil et les deux pages légales sont indexables", JSON.stringify(indexable) === JSON.stringify(["app/confidentialite/page.tsx", "app/mentions-legales/page.tsx", "app/page.tsx"]), indexable.join(" "));
done();
