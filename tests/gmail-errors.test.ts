// Gmail « accès expiré » : tri des refus de Google, marque laissée dans le profil, bouton « Reconnecter » toujours disponible.
import { readFileSync } from "node:fs";
import { GMAIL_EXPIRED_MSG, TOKEN_MESSAGE, TOKEN_STATUS, classifyTokenFailure, isExpiredMessage, reconnectHref } from "../lib/gmail-errors";
import { accessToken } from "../lib/gmail";
import { gmailAccessToken } from "../lib/gmail-token";
import { sealToken } from "../lib/token-crypto";
import { ok, done } from "./helpers";

process.env.GOOGLE_CLIENT_ID = "client-id-de-test.apps.googleusercontent.com";
process.env.GOOGLE_CLIENT_SECRET = "SECRET-de-test-0123456789";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key-de-test-0123456789-abcdef";
delete process.env.TOKEN_ENCRYPTION_KEY;
const uid = "00000000-0000-4000-8000-000000000001";
const REFRESH = "1//0gRefreshToken-de-test-abc_DEF-0123456789";

// ---------- Tri des refus de Google ----------
ok("invalid_grant : accès retiré ou expiré, reconnecter règle tout", classifyTokenFailure(400, "invalid_grant") === "expired");
ok("invalid_client / unauthorized_client : la clé de l'application a changé, reconnecter n'y changerait rien", classifyTokenFailure(401, "invalid_client") === "config" && classifyTokenFailure(400, "unauthorized_client") === "config");
ok("Google en panne ou qui limite (429, 5xx, temporarily_unavailable) : réessayer, rien à reconnecter", classifyTokenFailure(503, null) === "unavailable" && classifyTokenFailure(500, "") === "unavailable" && classifyTokenFailure(429, undefined) === "unavailable" && classifyTokenFailure(400, "temporarily_unavailable") === "unavailable");
ok("une panne de Google (502, 504, sans code) ne se déguise plus en « accès expiré » (avant : reconnexion demandée pour rien)", classifyTokenFailure(502, null) === "unavailable" && classifyTokenFailure(504, "") === "unavailable");
ok("refus sans explication : on propose de reconnecter", classifyTokenFailure(400, null) === "expired" && classifyTokenFailure(403, "access_denied") === "expired");
ok("le code de Google se lit sans tenir compte des majuscules", classifyTokenFailure(400, "INVALID_GRANT") === "expired" && classifyTokenFailure(400, "Invalid_Client") === "config");

// ---------- Messages et statuts ----------
ok("accès expiré : le message historique, reconnaissable par le navigateur", TOKEN_MESSAGE.expired === GMAIL_EXPIRED_MSG && GMAIL_EXPIRED_MSG === "Accès Gmail expiré : reconnecte ton compte Gmail." && isExpiredMessage(GMAIL_EXPIRED_MSG));
ok("seul « accès expiré » ouvre « Reconnecter » (pas la panne de Google, pas la clé)", !isExpiredMessage(TOKEN_MESSAGE.unavailable) && !isExpiredMessage(TOKEN_MESSAGE.config) && !isExpiredMessage(undefined) && !isExpiredMessage(null) && !isExpiredMessage(42));
ok("jamais 429 ni 503 : le reste de l'app les lit comme « IA saturée » et s'arrête pour tout le monde", Object.values(TOKEN_STATUS).every((s) => s !== 429 && s !== 503) && TOKEN_STATUS.expired === 401);
ok("aucun message ne contient de secret", Object.values(TOKEN_MESSAGE).every((m) => !m.includes(process.env.GOOGLE_CLIENT_SECRET!) && !m.includes(REFRESH)));
ok("reconnexion : garde l'envoi du récap quand il est activé (sinon il se désactiverait sans bruit)", reconnectHref(true) === "/api/gmail/connect?recap=1" && reconnectHref(false) === "/api/gmail/connect");

// ---------- accessToken : ce que Google répond → ce que l'app dit (réseau simulé) ----------
const realFetch = globalThis.fetch;
let sent: { url: string; body: string } | null = null;
const google = (status: number, body: unknown) => {
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    sent = { url: String(url), body: String(init?.body ?? "") };
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  }) as typeof fetch;
};
const failure = async (f: () => Promise<unknown>) => f().then(() => null, (e: { status?: number; message: string }) => e);

google(200, { access_token: "ya29.jeton-d-acces" });
ok("réponse normale : le jeton d'accès", (await accessToken(REFRESH)) === "ya29.jeton-d-acces" && sent!.url === "https://oauth2.googleapis.com/token");

google(400, { error: "invalid_grant", error_description: "Token has been expired or revoked." });
let e = await failure(() => accessToken(REFRESH));
ok("invalid_grant : 401 « Accès Gmail expiré »", e?.status === 401 && e.message === GMAIL_EXPIRED_MSG);

google(401, { error: "invalid_client", error_description: "The OAuth client was not found." });
e = await failure(() => accessToken(REFRESH));
ok("invalid_client : 502, on parle de la clé de l'application, pas d'une reconnexion", e?.status === 502 && /GOOGLE_CLIENT_ID/.test(e.message) && !isExpiredMessage(e.message));

google(503, "<html>Service Unavailable</html>");
e = await failure(() => accessToken(REFRESH));
ok("Google en panne (page HTML) : 502 « réessaie dans quelques minutes », pas 503", e?.status === 502 && /réessaie/.test(e.message) && !isExpiredMessage(e.message));

google(400, {});
e = await failure(() => accessToken(REFRESH));
ok("refus vide : on propose de reconnecter", e?.status === 401 && isExpiredMessage(e.message));

google(400, { error: "invalid_grant", error_description: `refresh_token=${REFRESH} client_secret=${process.env.GOOGLE_CLIENT_SECRET}` });
e = await failure(() => accessToken(REFRESH));
ok("ce que Google écrit dans sa description n'est jamais recopié dans le message", !!e && !e.message.includes(REFRESH) && !e.message.includes(process.env.GOOGLE_CLIENT_SECRET!));

// ---------- gmailAccessToken : la marque « Gmail à reconnecter » dans le profil ----------
function fakeDb() {
  const db = { profile: { preferences: { weekly_goal: 5 } } as Record<string, unknown>, upserts: 0, sealed: 0 };
  const sb = {
    from(table: string) {
      const q: Record<string, unknown> = {
        select: () => q, eq: () => q,
        update: () => { if (table === "gmail_accounts") db.sealed++; return q; },
        maybeSingle: async () => ({ data: table === "profiles" ? { data: db.profile } : null }),
        upsert: async (row: { data: Record<string, unknown> }) => { db.upserts++; db.profile = row.data; return {}; },
        then: (resolve: (v: unknown) => void) => resolve({}),
      };
      return q;
    },
  };
  return { db, sb: sb as never };
}
const issueOf = (db: { profile: Record<string, unknown> }) => (db.profile.preferences as { gmail_issue?: { at: string } }).gmail_issue;

{
  const { db, sb } = fakeDb();
  google(200, { access_token: "ya29.ok" });
  const t = await gmailAccessToken(sb, uid, REFRESH);
  ok("accès valide : jeton rendu, rien n'est marqué", t === "ya29.ok" && db.upserts === 0 && !issueOf(db));
}
{
  const { db, sb } = fakeDb();
  google(400, { error: "invalid_grant" });
  const err = await failure(() => gmailAccessToken(sb, uid, REFRESH));
  const at = issueOf(db)?.at;
  ok("accès retiré : 401, et le profil est marqué (Réglages et l'accueil proposent alors « Reconnecter »)", err?.status === 401 && isExpiredMessage(err.message) && !!at && !Number.isNaN(Date.parse(at)));
  ok("la marque ne touche pas aux autres réglages", (db.profile.preferences as { weekly_goal?: number }).weekly_goal === 5);
}
{
  const { db, sb } = fakeDb();
  google(503, "oups");
  const err = await failure(() => gmailAccessToken(sb, uid, REFRESH));
  ok("panne de Google : l'erreur remonte telle quelle (502) et RIEN n'est marqué (pas de fausse alerte « reconnecte »)", err?.status === 502 && !issueOf(db) && db.upserts === 0);
}
{
  const { db, sb } = fakeDb();
  google(401, { error: "invalid_client" });
  const err = await failure(() => gmailAccessToken(sb, uid, REFRESH));
  ok("clé de l'application refusée : 502 et rien n'est marqué (reconnecter ne servirait à rien)", err?.status === 502 && !issueOf(db));
}
{
  const { db, sb } = fakeDb();
  google(200, { access_token: "ya29.jamais" });
  // jeton chiffré avec une clé qui n'existe plus (clé de chiffrement changée)
  const sealedOld = await sealToken(REFRESH, uid, { SUPABASE_SERVICE_ROLE_KEY: "une-ancienne-cle-0123456789-abcdef-ghij" });
  const err = await failure(() => gmailAccessToken(sb, uid, sealedOld));
  ok("jeton devenu illisible : 401 « reconnecte » et le profil est marqué", err?.status === 401 && isExpiredMessage(err.message) && !!issueOf(db));
}
{
  const { db, sb } = fakeDb();
  google(200, { access_token: "ya29.ok" });
  const sealed = await sealToken(REFRESH, uid);
  const t = await gmailAccessToken(sb, uid, sealed);
  ok("jeton chiffré lisible : jeton d'accès rendu, rien n'est marqué", t === "ya29.ok" && !issueOf(db) && new URLSearchParams(sent!.body).get("refresh_token") === REFRESH);
}
globalThis.fetch = realFetch;

// ---------- Branchement ----------
const read = (f: string) => readFileSync(f, "utf8");
ok("Réglages : « Reconnecter Gmail » est toujours là quand Gmail est connecté, en bouton principal si l'accès est perdu", /reconnectHref\(recap\)/.test(read("components/settings-controls.tsx")) && /issue \? "btn-primary"/.test(read("components/settings-controls.tsx")));
ok("Réglages : bandeau rouge « Google a coupé l'accès » avec la date, et le lien garde le récap", read("app/parametres/page.tsx").includes("Google a coupé l'accès à ta boîte mail") && read("app/parametres/page.tsx").includes("recap={recapOn}"));
ok("accueil : bandeau « Reconnecter Gmail » quand l'accès est perdu", read("app/page.tsx").includes("profile.preferences.gmail_issue") && read("app/page.tsx").includes("reconnectHref("));
ok("« Tout synchroniser » : le message d'accès expiré propose « Reconnecter » (12 s) vers Réglages", /isExpiredMessage\(r\.error\)/.test(read("components/sync-button.tsx")) && read("components/sync-button.tsx").includes('router.push("/parametres#gmail")'));
ok("la reconnexion efface la marque, la déconnexion aussi", /gmail_issue: undefined/.test(read("app/api/gmail/callback/route.ts")) && /gmail_issue: undefined/.test(read("app/api/gmail/disconnect/route.ts")));
ok("la synchro lit le jeton par gmailAccessToken et efface la marque après un succès", read("lib/sync.ts").includes("gmailAccessToken(") && /preferences\?\.gmail_issue\) await patchPreferences\(supabase, userId, \{ gmail_issue: undefined \}\)/.test(read("lib/sync.ts")));
ok("le récap du matin passe aussi par gmailAccessToken (la marque est posée même quand c'est lui qui découvre la perte)", read("lib/recap.ts").includes("gmailAccessToken("));
ok("plus aucun appel direct à accessToken(readRefreshToken(…)) hors gmail-token", !/accessToken\(\s*await readRefreshToken/.test(read("lib/sync.ts") + read("lib/recap.ts")) && !read("lib/sync.ts").includes("readRefreshToken"));

done();
