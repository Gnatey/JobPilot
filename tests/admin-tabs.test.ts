/**
 * Page Administration en onglets (components/admin-tabs.tsx, app/admin/page.tsx) : lecture du source, car le composant dépend du navigateur.
 * On vérifie l'accessibilité promise (WAI-ARIA tabs), les quatre onglets, et que rien ne se perd dans le découpage (bouton « Tester les sources »,
 * script de mise à jour de la base, liens utiles, comptes anonymes).
 */
import { readFileSync } from "node:fs";
import { ok, done } from "./helpers";

const tabs = readFileSync("components/admin-tabs.tsx", "utf8");
const page = readFileSync("app/admin/page.tsx", "utf8");
const css = readFileSync("app/globals.css", "utf8");

// ---------- Le composant ----------
ok("liste d'onglets, onglets et panneaux ont leurs rôles WAI-ARIA", /role="tablist"/.test(tabs) && /role="tab"/.test(tabs) && /role="tabpanel"/.test(tabs));
ok("chaque onglet désigne son panneau (aria-controls) et chaque panneau son onglet (aria-labelledby)", /aria-controls=\{`admin-panel-\$\{t\.id\}`\}/.test(tabs) && /aria-labelledby=\{`admin-tab-\$\{t\.id\}`\}/.test(tabs));
ok("aria-selected et un seul onglet dans l'ordre de tabulation (tabIndex 0 / -1)", /aria-selected=\{on\}/.test(tabs) && /tabIndex=\{on \? 0 : -1\}/.test(tabs));
ok("flèches, Début et Fin déplacent l'onglet", ["ArrowRight", "ArrowLeft", "Home", "End"].every((k) => tabs.includes(`"${k}"`)));
ok("les panneaux fermés sont masqués par l'attribut hidden (rendus par le serveur, rien de rechargé)", /hidden=\{t\.id !== active\}/.test(tabs));
ok("l'onglet ouvert s'écrit dans l'adresse et se relit (rechargement, lien /admin#installation, retour arrière)", /history\.replaceState/.test(tabs) && /hashchange/.test(tabs) && /window\.location\.hash/.test(tabs));
ok("l'adresse non modifiable ne casse pas l'onglet (try / catch)", /try \{ window\.history\.replaceState[\s\S]*?\} catch/.test(tabs));
ok("la liste d'onglets défile sur petit écran au lieu de déborder", /overflow-x-auto/.test(tabs));

// ---------- La page ----------
const tabsSource = page.slice(page.indexOf("const tabs: AdminTab[]"));
const ids = [...tabsSource.matchAll(/\{ id: "([a-z]+)", label: "([^"]+)"/g)].map((m) => [m[1], m[2]]);
ok("quatre onglets, dans l'ordre : Installation, Clés, Sources, Comptes et usage", ids.map((x) => x[1]).join("|") === "Installation|Clés|Sources|Comptes et usage", ids.map((x) => x[1]).join("|"));
ok("identifiants d'onglet attendus (les liens /admin#installation existent déjà)", ids.map((x) => x[0]).join() === "installation,cles,sources,comptes");
ok("la page s'ouvre sur Installation", /<AdminTabs tabs=\{tabs\} initial="installation" \/>/.test(page));
ok("les liens existants vers /admin#installation tombent sur un onglet qui existe", ids.some((x) => x[0] === "installation"));
ok("le bouton « Tester les sources » est toujours dans l'onglet Sources", /<SourcesTest \/>/.test(page) && page.indexOf("<SourcesTest />") > page.indexOf('id: "sources"') && page.indexOf("<SourcesTest />") < page.indexOf('id: "comptes"'));
ok("le script de mise à jour de la base est dans l'onglet Installation", page.indexOf("<CopySql") > page.indexOf('id: "installation"') && page.indexOf("<CopySql") < page.indexOf('id: "cles"'));
ok("les liens utiles suivent l'installation", page.indexOf('title="Liens utiles"') > page.indexOf('id: "installation"') && page.indexOf('title="Liens utiles"') < page.indexOf('id: "cles"'));
ok("les comptes restent anonymes : ni adresse e-mail ni `email` dans la page", !/\.email\b|user_metadata|r\.email/.test(page));
ok("l'onglet Clés n'affiche que ce que lib/admin-keys.ts fournit (jamais process.env directement dans une liste de clés)", /describeKeys\(\)/.test(page) && !/process\.env\[r\./.test(page));
ok("les messages ne renvoient plus à une section « plus bas » qui n'existe plus", !/plus bas|ci-dessous|juste en dessous/i.test(page.replace(/Le script est juste en dessous\./, "")));

// ---------- Affichage serré ----------
const denseAt = css.indexOf("Administration : affichage plus serré");
const dense = css.slice(css.lastIndexOf("/*", denseAt), css.indexOf("/* CV : pas de mot tout seul"));
ok("le style serré existe", dense.length > 100);
const selectors = [...dense.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{/g)].map((m) => m[1].trim()).filter((x) => !x.startsWith("@media"));
ok("il est limité à .admin-dense (aucune règle qui touche une autre page)", selectors.length >= 5 && selectors.every((sel) => sel.split(",").every((one) => one.trim().startsWith(".admin-dense"))), selectors.filter((sel) => !sel.startsWith(".admin-dense")).join(" | "));
ok("il ne vaut que sur ordinateur et à l'écran (pas de zones de toucher réduites au doigt, pas d'impression)", /@media screen and \(min-width: 768px\)/.test(dense));
ok("la page est enveloppée dans .admin-dense", /<div className="admin-dense">/.test(page));

done();
