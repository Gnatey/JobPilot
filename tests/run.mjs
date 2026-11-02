// Lance tous les tests de tests/*.test.ts : chaque fichier est compilé avec esbuild (alias @/ du tsconfig) puis exécuté dans son propre processus.
// Aucun réseau, aucune vraie IA, aucune vraie base : tout est simulé. Usage : npm test
import { build } from "esbuild";
import { readdirSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const out = join(root, "node_modules", ".cache", "jobpilot-tests");
mkdirSync(out, { recursive: true });
const only = process.argv[2];
const files = readdirSync(join(root, "tests")).filter((f) => f.endsWith(".test.ts") && (!only || f.includes(only)));

// lib/supabase/server charge Next.js : inutile (et impossible hors serveur) pour tester la logique pure, on en garde seulement HttpError
const stub = {
  name: "stub-supabase-server",
  setup(b) {
    b.onResolve({ filter: /supabase\/server$/ }, () => ({ path: "stub", namespace: "stub" }));
    b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
      contents: "export class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }",
      loader: "js",
    }));
  },
};

let failed = 0;
for (const f of files) {
  const outfile = join(out, f.replace(/\.ts$/, ".mjs"));
  await build({
    entryPoints: [join(root, "tests", f)], bundle: true, platform: "node", format: "esm", outfile, logLevel: "error",
    tsconfig: join(root, "tsconfig.json"), packages: "external", plugins: [stub],
  });
  console.log(`\n=== ${f}`);
  const r = spawnSync(process.execPath, [outfile], { stdio: "inherit", cwd: root });
  if (r.status !== 0) failed++;
}
console.log(failed ? `\n${failed} fichier(s) de test en échec` : `\n${files.length} fichier(s) de test : tout passe`);
process.exit(failed ? 1 : 0);
