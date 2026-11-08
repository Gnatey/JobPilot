/**
 * Menu de bureau : le groupe « Réglages » (Mes réglages, Confidentialité, Administration pour l'administratrice) s'ouvre au clic, jamais au survol.
 * Lecture du source de components/nav.tsx (le composant dépend du navigateur) : on vérifie les promesses d'accessibilité et le rôle de chaque entrée.
 */
import { readFileSync } from "node:fs";
import { ok, done } from "./helpers";

const nav = readFileSync("components/nav.tsx", "utf8");

ok("le groupe est un vrai bouton qui annonce son état (aria-expanded) et ce qu'il commande (aria-controls)", /<button type="button" onClick=\{\(\) => setGroupOpen[^\n]*aria-expanded=\{groupOpen\}[^\n]*aria-controls="nav-reglages"/.test(nav));
ok("la liste commandée existe sous cet identifiant", /id="nav-reglages"/.test(nav));
ok("la liste fermée est masquée (hidden), pas seulement transparente : ses liens ne sont plus atteignables au clavier", /id="nav-reglages" className=\{groupOpen \? "[^"]*" : "hidden"\}/.test(nav));
ok("aucune ouverture au survol (onMouseEnter, onMouseOver, onPointerEnter)", !/onMouse(Enter|Over|Leave)|onPointer(Enter|Over|Leave)/.test(nav));
ok("le groupe contient Mes réglages et Confidentialité", /SETTINGS_KIDS = \[[\s\S]*?"\/parametres"[\s\S]*?"\/confidentialite"[\s\S]*?\];/.test(nav));
ok("Administration n'est ajoutée au groupe que pour l'administratrice", /const settingsKids = admin \? \[\.\.\.SETTINGS_KIDS, \{ href: "\/admin"/.test(nav));
ok("le groupe s'ouvre tout seul quand on est sur une de ses pages (et se rouvre en y arrivant)", /useState\(inSettings\)/.test(nav) && /if \(inSettings\) setGroupOpen\(true\)/.test(nav));
ok("le téléphone garde sa feuille « Plus » à plat : Réglages et Administration y sont toujours listés", /const secondary = admin \? \[\.\.\.SECONDARY, \{ href: "\/admin"/.test(nav) && /\.\.\.secondary/.test(nav));
ok("Réglages reste dans la liste à plat du téléphone", /const SECONDARY = \[[\s\S]*?"\/parametres"[\s\S]*?\];/.test(nav));
ok("le bureau ne montre pas Réglages deux fois (la ligne est retirée de la liste, le groupe la remplace)", /SECONDARY\.filter\(\(m\) => m\.href !== "\/parametres"\)/.test(nav));

done();
