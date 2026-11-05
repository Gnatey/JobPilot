// Titres des onglets : chaque page a le sien (historique, onglets multiples, lecteurs d'écran annoncent le titre à l'arrivée).
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { ok, done } from "./helpers";

function pages(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) pages(p, out);
    else if (f === "page.tsx") out.push(p);
  }
  return out;
}
const hasTitle = (file: string) => {
  const src = readFileSync(file, "utf8");
  if (/export (const metadata|async function generateMetadata|function generateMetadata)/.test(src)) return true;
  const layout = join(dirname(file), "layout.tsx"); // un composant du navigateur ne peut pas exporter de titre : son gabarit le fait
  return existsSync(layout) && /export (const metadata|async function generateMetadata)/.test(readFileSync(layout, "utf8"));
};
const all = pages("app").sort();
ok(`${all.length} pages analysées`, all.length > 15);
const missing = all.filter((f) => !hasTitle(f));
ok("chaque page a un titre d'onglet", missing.length === 0, missing.join(" | "));

// Une page qui n'est pas l'accueil ne doit pas se contenter du nom du site : les titres sont uniques
const titles = new Map<string, string[]>();
for (const f of all) {
  const src = readFileSync(f, "utf8") + (existsSync(join(dirname(f), "layout.tsx")) ? readFileSync(join(dirname(f), "layout.tsx"), "utf8") : "");
  const m = src.match(/metadata = \{[^}]*title: "([^"]+)"/);
  if (m) titles.set(m[1], [...(titles.get(m[1]) ?? []), f]);
}
const dup = [...titles].filter(([, v]) => v.length > 1).map(([t, v]) => `${t}: ${v.join(", ")}`);
ok("deux pages différentes n'ont pas le même titre", dup.length === 0, dup.join(" | "));
done();
