// Reconnexion espacée : durée de session par rôle, appareil de confiance signé pour le code à 6 chiffres.
import { ADMIN_DAYS, USER_DAYS, justVerifiedCode, lastAuthAt, reauthDays, sessionExpired, signTrust, verifyTrust } from "../lib/reauth";
import { ok, done } from "./helpers";

const DAY = 86_400_000;
const env = { OWNER_EMAILS: "Juliana@example.fr" };
const now = Date.parse("2026-11-03T12:00:00Z");
const secs = (ms: number) => Math.floor(ms / 1000);

// ---------- Durées ----------
ok("90 jours pour une personne ordinaire, 30 pour l'admin", USER_DAYS === 90 && ADMIN_DAYS === 30 && reauthDays("ami@example.fr", env) === 90 && reauthDays("juliana@example.fr", env) === 30 && reauthDays(null, env) === 90 && reauthDays(undefined, {}) === 90);

// ---------- Date de dernière authentification ----------
ok("amr : la plus récente, en millisecondes", lastAuthAt([{ method: "password", timestamp: 1000 }, { method: "totp", timestamp: 5000 }]) === 5_000_000);
ok("amr absent, vide ou au format texte : null", lastAuthAt(undefined) === null && lastAuthAt([]) === null && lastAuthAt(["pwd", "otp"]) === null && lastAuthAt("x") === null && lastAuthAt(null) === null);
ok("amr : entrées invalides ignorées", lastAuthAt([{ method: "x", timestamp: "nope" }, { method: "y" }, null, { method: "z", timestamp: -5 }, { method: "ok", timestamp: 2000 }]) === 2_000_000);

// ---------- Session limitée ----------
const login = (daysAgo: number) => [{ method: "password", timestamp: secs(now - daysAgo * DAY) }];
ok("personne ordinaire : 89 jours OK, 91 jours expirée", !sessionExpired(login(89), "ami@example.fr", now, env) && sessionExpired(login(91), "ami@example.fr", now, env));
ok("admin : 29 jours OK, 31 jours expirée", !sessionExpired(login(29), "juliana@example.fr", now, env) && sessionExpired(login(31), "juliana@example.fr", now, env));
ok("31 jours : expirée pour l'admin, pas pour une personne ordinaire", sessionExpired(login(31), "juliana@example.fr", now, env) && !sessionExpired(login(31), "ami@example.fr", now, env));
ok("jeton sans date d'authentification : on ne coupe pas", !sessionExpired(undefined, "juliana@example.fr", now, env) && !sessionExpired([], "ami@example.fr", now, env));
ok("le code saisi plus tard prolonge (c'est la dernière authentification qui compte)", !sessionExpired([...login(100), { method: "totp", timestamp: secs(now - 5 * DAY) }], "ami@example.fr", now, env));

// ---------- Appareil de confiance ----------
const secret = "clé-de-test-0123456789-clé-de-test";
const uid = "00000000-0000-4000-8000-000000000001";
const tok = (await signTrust(uid, now - DAY, secret))!;
ok("cookie valide : accepté", await verifyTrust(tok, uid, "ami@example.fr", now, secret, env));
ok("cookie d'une autre personne : refusé", !(await verifyTrust(tok, "00000000-0000-4000-8000-000000000002", "ami@example.fr", now, secret, env)));
ok("autre secret : refusé", !(await verifyTrust(tok, uid, "ami@example.fr", now, secret + "x", env)));
const [issued, sig] = tok.split(".");
ok("date modifiée : refusé", !(await verifyTrust(`${Number(issued) + 1000}.${sig}`, uid, "ami@example.fr", now, secret, env)));
ok("signature modifiée : refusé", !(await verifyTrust(`${issued}.${sig.slice(0, -2)}AA`, uid, "ami@example.fr", now, secret, env)) && !(await verifyTrust(`${issued}.${sig.slice(1)}`, uid, "ami@example.fr", now, secret, env)));
const old89 = (await signTrust(uid, now - 89 * DAY, secret))!, old91 = (await signTrust(uid, now - 91 * DAY, secret))!;
ok("personne ordinaire : 89 jours OK, 91 jours refusé", (await verifyTrust(old89, uid, "ami@example.fr", now, secret, env)) && !(await verifyTrust(old91, uid, "ami@example.fr", now, secret, env)));
const d31 = (await signTrust(uid, now - 31 * DAY, secret))!;
ok("admin : 31 jours refusé ; la même confiance de 31 jours reste valable pour une personne ordinaire", !(await verifyTrust(d31, uid, "juliana@example.fr", now, secret, env)) && (await verifyTrust(d31, uid, "ami@example.fr", now, secret, env)));
const future = (await signTrust(uid, now + 3_600_000, secret))!;
ok("cookie daté du futur : refusé", !(await verifyTrust(future, uid, "ami@example.fr", now, secret, env)));
const junk = ["", "abc", "1.2.3", "x.y", ".", `${issued}.`, `.${sig}`, `${issued}.${sig}.extra`, "9999999999999999.AAAA", `${issued}.@@@@`];
for (const j of junk) ok(`valeur invalide refusée : ${JSON.stringify(j).slice(0, 40)}`, !(await verifyTrust(j, uid, "ami@example.fr", now, secret, env)));
ok("absent ou null : refusé", !(await verifyTrust(undefined, uid, "ami@example.fr", now, secret, env)) && !(await verifyTrust(null, uid, "ami@example.fr", now, secret, env)));
ok("sans secret configuré : rien n'est signé, rien n'est accepté", (await signTrust(uid, now, "")) === null && !(await verifyTrust(tok, uid, "ami@example.fr", now, "", env)));

// ---------- Le code vient-il d'être saisi ? ----------
const fresh = { aal: "aal2", amr: [{ method: "password", timestamp: secs(now - 60_000) }, { method: "totp", timestamp: secs(now - 10_000) }] };
ok("code saisi il y a quelques secondes : oui", justVerifiedCode(fresh, now));
ok("niveau aal1 : non", !justVerifiedCode({ ...fresh, aal: "aal1" }, now));
ok("code saisi il y a 5 minutes : non", !justVerifiedCode({ aal: "aal2", amr: [{ method: "totp", timestamp: secs(now - 5 * 60_000) }] }, now));
ok("sans méthode totp : non", !justVerifiedCode({ aal: "aal2", amr: [{ method: "password", timestamp: secs(now) }] }, now));
ok("jeton vide ou sans amr : non", !justVerifiedCode(null, now) && !justVerifiedCode({ aal: "aal2" }, now) && !justVerifiedCode({ aal: "aal2", amr: ["totp"] }, now));
ok("horodatage dans le futur : non", !justVerifiedCode({ aal: "aal2", amr: [{ method: "totp", timestamp: secs(now + 10 * 60_000) }] }, now));
done();
