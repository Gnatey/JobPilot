// Jetons Gmail chiffrés en base : aller-retour, falsification, autre personne, anciens jetons en clair, clés.
import { SEALED_PREFIX, isSealed, needsSealing, openToken, sealToken, tokenSecret } from "../lib/token-crypto";
import { ok, done } from "./helpers";

const env = { SUPABASE_SERVICE_ROLE_KEY: "service-role-key-de-test-0123456789-abcdef" };
const uid = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const token = "1//0gExampleRefreshToken-abc_DEF-0123456789";
const throws = async (f: () => Promise<unknown>) => f().then(() => false, () => true);

// ---------- Clés ----------
ok("clé : TOKEN_ENCRYPTION_KEY d'abord, sinon la clé de service, sinon rien", tokenSecret({ TOKEN_ENCRYPTION_KEY: "a", SUPABASE_SERVICE_ROLE_KEY: "b" }) === "a" && tokenSecret(env) === env.SUPABASE_SERVICE_ROLE_KEY && tokenSecret({}) === "");

// ---------- Aller-retour ----------
const sealed = await sealToken(token, uid, env);
ok("chiffré : préfixe, rien de lisible", sealed.startsWith(SEALED_PREFIX) && !sealed.includes(token) && !sealed.includes("RefreshToken") && isSealed(sealed));
ok("aller-retour : on retrouve le jeton", (await openToken(sealed, uid, env)) === token);
ok("deux chiffrements du même jeton sont différents (IV aléatoire)", (await sealToken(token, uid, env)) !== sealed);
ok("jeton long (1 000 caractères) : aller-retour", (await openToken(await sealToken("x".repeat(1000), uid, env), uid, env)) === "x".repeat(1000));
ok("accents et caractères spéciaux : aller-retour", (await openToken(await sealToken("é€😀/+=", uid, env), uid, env)) === "é€😀/+=");

// ---------- Ce qui doit échouer ----------
ok("autre personne : refusé (le texte chiffré ne se recopie pas d'un compte à l'autre)", await throws(() => openToken(sealed, other, env)));
ok("autre clé : refusé", await throws(() => openToken(sealed, uid, { SUPABASE_SERVICE_ROLE_KEY: "une-autre-cle-0123456789-abcdef-ghij" })));
ok("sans clé : refusé, avec un message clair", await openToken(sealed, uid, {}).then(() => "", (e: Error) => e.message).then((m) => /reconnecte Gmail/.test(m)));
const [iv, data] = sealed.slice(SEALED_PREFIX.length).split(".");
const flip = (s: string) => s.slice(0, -3) + (s.slice(-3) === "AAA" ? "BBB" : "AAA");
ok("texte falsifié : refusé", await throws(() => openToken(`${SEALED_PREFIX}${iv}.${flip(data)}`, uid, env)));
ok("IV falsifié : refusé", await throws(() => openToken(`${SEALED_PREFIX}${flip(iv)}.${data}`, uid, env)));
for (const j of [SEALED_PREFIX, `${SEALED_PREFIX}abc`, `${SEALED_PREFIX}a.b.c`, `${SEALED_PREFIX}.`, `${SEALED_PREFIX}@@@.@@@`])
  ok(`valeur chiffrée invalide refusée : ${JSON.stringify(j)}`, await throws(() => openToken(j, uid, env)));

// ---------- Anciens jetons en clair et absence de clé ----------
ok("ancien jeton en clair : lu tel quel", (await openToken(token, uid, env)) === token && (await openToken(token, uid, {})) === token);
ok("sans clé : rien n'est chiffré (comportement d'avant)", (await sealToken(token, uid, {})) === token);
ok("jeton vide ou personne inconnue : renvoyé tel quel", (await sealToken("", uid, env)) === "" && (await sealToken(token, "", env)) === token);
ok("à chiffrer : en clair avec une clé, oui ; déjà chiffré, vide ou sans clé, non", needsSealing(token, env) && !needsSealing(sealed, env) && !needsSealing("", env) && !needsSealing(null, env) && !needsSealing(token, {}));
done();
