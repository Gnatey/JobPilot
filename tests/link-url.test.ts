// Liens du profil (18 novembre 2026, capture de Juliana : « Liens (un par ligne : Libellé | URL) », zone de texte brute).
// Ils deviennent une liste (libellé, adresse, « Ouvrir », corbeille, « Ajouter un lien »). Une adresse incomplète n'est ni cliquable ni écrite sur un CV :
// avant, « Streamlit » devenait `https://Streamlit`, un lien mort dans le PDF.
import { readFileSync } from "node:fs";
import { linkItems, pickLinks } from "../lib/cv-format";
import { duplicateIndexes, linkHref, linkNote, normalizeLinkUrl, usableLinks } from "../lib/link-url";
import { dedupeExact, dedupeLinks, mergeExtracted } from "../lib/profile-fix";
import type { Profile } from "../lib/types";
import { EMPTY_PROFILE } from "../lib/empty-profile";
import { ok, done } from "./helpers";

ok("adresse complète : gardée telle quelle", linkHref("https://jobpilot-recette.vercel.app") === "https://jobpilot-recette.vercel.app");
ok("http aussi", linkHref("http://exemple.fr/portfolio") === "http://exemple.fr/portfolio");
ok("sans protocole mais avec un vrai site : https:// ajouté", linkHref("itch.io") === "https://itch.io" && linkHref("github.com/exemple") === "https://github.com/exemple" && linkHref("www.exemple.fr/a?b=1") === "https://www.exemple.fr/a?b=1");
ok("un mot seul n'est pas une adresse (« Streamlit », « GitHub »)", linkHref("Streamlit") === null && linkHref("GitHub") === null && linkHref("https://Streamlit") === null);
ok("un texte avec espaces n'est pas une adresse", linkHref("mon portfolio en ligne") === null && linkHref("itch.io et plus") === null);
ok("javascript:, mailto:, data: et // sont refusés (jamais dans un href)", linkHref("javascript:alert(1)") === null && linkHref("mailto:a@b.fr") === null && linkHref("data:text/html,x") === null && linkHref("//exemple.fr") === null && linkHref("JAVASCRIPT:alert(1)") === null);
ok("identifiants dans l'adresse refusés", linkHref("https://user:mdp@exemple.fr") === null);
ok("vide ou absent : null", linkHref("") === null && linkHref("   ") === null && linkHref(undefined) === null);

ok("en quittant le champ, « itch.io » devient « https://itch.io »", normalizeLinkUrl("  itch.io ") === "https://itch.io");
ok("une adresse incomplète est seulement nettoyée, pas devinée", normalizeLinkUrl(" Streamlit ") === "Streamlit");

ok("ligne vide : pas de remarque", linkNote({ label: "", url: "" }) === null);
ok("libellé sans adresse : on le dit", linkNote({ label: "GitHub", url: "" }) === "Ajoute l'adresse du lien.");
ok("adresse incomplète : la remarque dit pourquoi et ce que ça change", /Adresse incomplète/.test(linkNote({ label: "Mémoire", url: "Streamlit" }) ?? "") && /n'apparaît pas sur tes CV/.test(linkNote({ label: "x", url: "Streamlit" }) ?? ""));
ok("adresse bonne : pas de remarque", linkNote({ label: "Somnium", url: "https://itch.io" }) === null);

// Ses quatre lignes de la capture
const mine = [
  { label: "GitHub", url: "GitHub" },
  { label: "Mémoire Deepfake (Streamlit)", url: "Streamlit" },
  { label: "Somnium (itch.io)", url: "itch.io" },
  { label: "Cahier de recette JobPilot", url: "https://jobpilot-recette.vercel.app" },
];
const items = linkItems({ ...EMPTY_PROFILE.identity, links: mine }, 4);
ok("sur le CV : seules les adresses valides sont écrites, chacune cliquable", items.length === 2 && items.every((i) => !!i.href && /^https:\/\//.test(i.href)), JSON.stringify(items));
ok("sur le CV : plus de lien mort `https://Streamlit`", !items.some((i) => /streamlit/i.test(i.href ?? "")));
ok("« itch.io » est écrit https://itch.io (texte sans protocole)", items.some((i) => i.href === "https://itch.io" && i.text === "itch.io"));
ok("pickLinks ne garde pas les adresses incomplètes", pickLinks(mine, "", 4).length === 2);
ok("les quatre emplacements sont pour les liens valides (une adresse incomplète ne prend pas de place)", pickLinks([...mine, { label: "A", url: "a.fr" }, { label: "B", url: "b.fr" }], "", 4).length === 4);

/* ---------- Doublons de liens : sa liste du 18 novembre ---------- */
const full = [
  { label: "LinkedIn", url: "https://linkedin.com/in/jniapoh" },
  { label: "Portfolio", url: "https://juliana-niapoh-portfolio.netlify.app" },
  { label: "GitHub", url: "https://github.com/Gnatey" },
  { label: "JobPilot", url: "https://jobpilot-ashy.vercel.app" },
  { label: "LinkedIn", url: "LinkedIn" },
  { label: "GitHub", url: "GitHub" },
  { label: "Mémoire Deepfake (Streamlit)", url: "Streamlit" },
  { label: "Somnium (itch.io)", url: "itch.io" },
  { label: "Cahier de recette JobPilot", url: "https://jobpilot-recette.vercel.app" },
];
ok("« LinkedIn | LinkedIn » et « GitHub | GitHub » sont vus comme doublons de leurs vrais liens (lignes 5 et 6)", [...duplicateIndexes(full)].sort().join() === "4,5", [...duplicateIndexes(full)].join());
const cleaned = dedupeLinks(full);
ok("après nettoyage : 7 liens, les vrais sont gardés dans l'ordre", cleaned.length === 7 && cleaned[0].url === "https://linkedin.com/in/jniapoh" && cleaned[2].url === "https://github.com/Gnatey");
ok("une adresse incomplète SANS jumeau valide reste (à corriger par la personne, signalée dans la liste)", cleaned.some((l) => l.url === "Streamlit"));
ok("même adresse écrite autrement : un seul lien", dedupeLinks([{ label: "A", url: "https://www.exemple.fr/a/" }, { label: "B", url: "exemple.fr/a" }, { label: "C", url: "http://exemple.fr/a" }]).length === 1);
ok("une ligne vide qu'on vient d'ajouter n'est pas un doublon", duplicateIndexes([{ label: "A", url: "a.fr" }, { label: "", url: "" }, { label: "", url: "" }]).size === 0);
ok("deux libellés identiques avec deux vraies adresses ne sont pas des doublons", duplicateIndexes([{ label: "Projet", url: "a.fr" }, { label: "Projet", url: "b.fr" }]).size === 0);

const prof = (links: { label: string; url: string }[]) => ({ ...EMPTY_PROFILE, identity: { ...EMPTY_PROFILE.identity, name: "J", links } }) as Profile;
ok("« Faire le point » retire ces doublons et le dit", dedupeExact(prof(full)).profile.identity.links.length === 7 && dedupeExact(prof(full)).changes.some((c) => /2 liens en double retirés/.test(c)));
ok("un CV qui lit « LinkedIn » comme adresse n'ajoute pas de doublon (fusion)", mergeExtracted(prof(full.slice(0, 4)), prof([{ label: "LinkedIn", url: "LinkedIn" }, { label: "GitHub", url: "GitHub" }])).profile.identity.links.length === 4);
ok("les liens lus dans un CV : seuls ceux qui ont une adresse, écrite en entier", usableLinks([{ label: "LinkedIn", url: "LinkedIn" }, { label: "Somnium", url: "itch.io" }, { label: "Site", url: "https://exemple.fr" }]).map((l) => l.url).join() === "https://itch.io,https://exemple.fr");
const ai = readFileSync("lib/ai.ts", "utf8");
ok("l'extraction d'un CV écarte les liens sans adresse et le prompt le dit", /usableLinks\(labelled\.identity\?\.links\)/.test(ai) && /n'est pas un lien : ne le mets pas/.test(ai));
ok("la liste propose « Retirer les doublons »", /Retirer les \$\{dups\.size\} doublons/.test(readFileSync("components/profile-links.tsx", "utf8")));

// Écran
const page = readFileSync("app/profil/page.tsx", "utf8");
ok("Profil : la zone « Libellé | URL » est remplacée par la liste", /<ProfileLinks /.test(page) && !/Libellé \| URL/.test(page) && !/split\("\|"\)/.test(page));
const comp = readFileSync("components/profile-links.tsx", "utf8");
ok("liste : « Ajouter un lien », « Ouvrir » dans un nouvel onglet, corbeille", /Ajouter un lien/.test(comp) && /target="_blank"/.test(comp) && /rel="noopener noreferrer"/.test(comp) && /Trash2/.test(comp));
ok("liste : le lien ouvert vient de linkHref (jamais de l'adresse brute)", /href=\{href\}/.test(comp) && /linkHref\(l\.url\)/.test(comp));
ok("liste : nom accessible « s'ouvre dans un nouvel onglet » et remarque liée au champ", /s'ouvre dans un nouvel onglet/.test(comp) && /aria-describedby/.test(comp));
done();
