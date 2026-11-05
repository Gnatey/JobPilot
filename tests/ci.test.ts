// Vérification automatique sur GitHub : le fichier existe et lance bien types, tests et construction ; aucun secret n'y est écrit.
import { readFileSync } from "node:fs";
import { ok, done } from "./helpers";

const yml = readFileSync(".github/workflows/verifications.yml", "utf8");
ok("se lance à chaque envoi sur main et sur les demandes de fusion", /push:\s*\n\s*branches: \[main\]/.test(yml) && /\n  pull_request:/.test(yml));
ok("installe exactement ce que verrouille package-lock.json (npm ci)", /run: npm ci/.test(yml));
ok("lance les types, les tests et la construction", ["npm run typecheck", "npm test", "npm run build"].every((c) => yml.includes(`run: ${c}`)));
ok("contrôle les failles connues des dépendances, dans une tâche à part", /failles:/.test(yml) && /npm audit --audit-level=high/.test(yml));
ok("droits minimaux : lecture seule du dépôt", /permissions:\s*\n\s*contents: read/.test(yml));
ok("aucun secret : la construction reçoit des valeurs de test, jamais ${{ secrets.* }}", !/secrets\./.test(yml) && /valeur-de-test/.test(yml));
ok("la même version de Node que Vercel (24, réglage du projet)", (yml.match(/node-version: 24/g) ?? []).length === 2);
done();
