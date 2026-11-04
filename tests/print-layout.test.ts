// Impression des CV : la zone mesurée par FitPage et le CSS d'impression doivent rester d'accord.
import { readFileSync } from "node:fs";
import { PAGE_MARGIN_MM, PRINT_HEIGHT_MM, PRINT_WIDTH_MM } from "../lib/print-layout";
import { ok, done } from "./helpers";

const css = readFileSync("app/globals.css", "utf8");
const fit = readFileSync("components/fit-page.tsx", "utf8");
const doc = readFileSync("components/document-view.tsx", "utf8");
const print = css.slice(css.indexOf("@media print"));

ok("zone imprimée : A4 moins la même marge partout", PAGE_MARGIN_MM === 13 && PRINT_WIDTH_MM === 184 && PRINT_HEIGHT_MM === 271);
ok("@page : A4, la même marge sur les quatre côtés (valeur des constantes)", print.includes(`@page { size: A4; margin: ${PAGE_MARGIN_MM}mm; }`));
ok("la feuille imprimée a une largeur minimale égale à la largeur mesurée par FitPage", new RegExp(`\\.print-sheet\\s*\\{\\s*min-width:\\s*${PRINT_WIDTH_MM}mm;\\s*\\}`).test(print));
ok("FitPage mesure sur cette même largeur et cette même hauteur", fit.includes("PRINT_WIDTH_MM") && fit.includes("PRINT_HEIGHT_MM") && !/\b182mm\b/.test(fit));
ok("la feuille à l'écran garde la même marge intérieure que la page imprimée sur ordinateur", doc.includes(`md:p-[${PAGE_MARGIN_MM}mm]`));
ok("rien d'autre ne fixe une ancienne marge de 12 ou 14 mm pour l'impression", !/@page[^}]*(12mm|14mm)/.test(css));
done();
