// Redirection après connexion : jamais vers un autre site.
import { safeNext } from "../lib/safe-next";
import { ok, done } from "./helpers";

const base = "https://jobpilot-ashy.vercel.app/auth/callback";
const where = (n: string | null) => new URL(safeNext(n), base).href;

ok("chemin du site conservé", safeNext("/suivi") === "/suivi" && safeNext("/parametres") === "/parametres");
ok("paramètres conservés", safeNext("/suivi?open=abc&x=1") === "/suivi?open=abc&x=1");
ok("vide ou absent → accueil", safeNext(null) === "/" && safeNext("") === "/" && safeNext(undefined) === "/");
const hostile = ["//evil.com", "/\\evil.com", "/\t/evil.com", "/\n/evil.com", "/\r/evil.com", "https://evil.com", "http://evil.com/x", "javascript:alert(1)", "\\\\evil.com", "/\\/evil.com", "/..//evil.com", "/./\\evil.com", "///evil.com", "evil.com", "@evil.com", "/%5Cevil.com"];
for (const h of hostile) ok(`refusé : ${JSON.stringify(h)}`, new URL(where(h)).origin === "https://jobpilot-ashy.vercel.app" && !where(h).includes("//evil"), where(h));
done();
