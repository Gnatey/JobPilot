import { HttpError } from "./supabase/server";

const SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
/** Le jeton Google donne-t-il le droit d'envoyer ? (demandé seulement quand on active le récap du matin) */
export const canSend = (scope?: string | null) => (scope ?? "").split(" ").includes(SEND_SCOPE);
export const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const redirectUri = () => `${appUrl()}/api/gmail/callback`;

function creds() {
  const id = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!id || !secret) throw new HttpError(501, "Gmail non configuré (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).");
  return { id, secret };
}

export function authUrl(state: string, withSend = false) {
  const { id } = creds();
  const p = new URLSearchParams({
    client_id: id,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: `${SCOPE}${withSend ? ` ${SEND_SCOPE}` : ""} openid email`,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

export async function exchangeCode(code: string) {
  const { id, secret } = creds();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: id, client_secret: secret, redirect_uri: redirectUri(), grant_type: "authorization_code" }),
  });
  if (!res.ok) throw new HttpError(400, "Échec de la connexion Google");
  return (await res.json()) as { access_token: string; refresh_token?: string; id_token?: string; scope?: string };
}

export async function accessToken(refresh: string) {
  const { id, secret } = creds();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ refresh_token: refresh, client_id: id, client_secret: secret, grant_type: "refresh_token" }),
  });
  if (!res.ok) throw new HttpError(401, "Accès Gmail expiré : reconnecte ton compte Gmail.");
  return ((await res.json()) as { access_token: string }).access_token;
}

export async function gmailEmail(token: string) {
  const r = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", { headers: { Authorization: `Bearer ${token}` } });
  return r.ok ? ((await r.json()) as { emailAddress: string }).emailAddress : null;
}

export type GmailMeta = { id: string; threadId: string; from: string; subject: string; snippet: string; date: string; labels: string[] };

const JOB_QUERY =
  '(candidature OR postuler OR postulé OR entretien OR recrutement OR recruteur OR "votre profil" OR "votre candidature" OR application OR interview OR poste OR "offre d\'emploi" OR "job" OR "talent")';

export async function listJobEmails(token: string, sinceDays: number, max = 150): Promise<GmailMeta[]> {
  const q = `${JOB_QUERY} newer_than:${sinceDays}d -in:sent -category:promotions -category:social`;
  const ids: { id: string; threadId: string }[] = [];
  let pageToken: string | undefined;
  do {
    const p = new URLSearchParams({ q, maxResults: "100" });
    if (pageToken) p.set("pageToken", pageToken);
    const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${p}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new HttpError(502, `Gmail : lecture impossible (${r.status})`);
    const j = (await r.json()) as { messages?: { id: string; threadId: string }[]; nextPageToken?: string };
    ids.push(...(j.messages ?? []));
    pageToken = j.nextPageToken;
  } while (pageToken && ids.length < max);
  return ids.slice(0, max).map((m) => ({ id: m.id, threadId: m.threadId, from: "", subject: "", snippet: "", date: "", labels: [] }));
}

export async function fetchMeta(token: string, id: string): Promise<GmailMeta | null> {
  const p = new URLSearchParams({ format: "metadata" });
  ["From", "Subject", "Date"].forEach((h) => p.append("metadataHeaders", h));
  const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?${p}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  const j = (await r.json()) as { id: string; threadId: string; snippet: string; internalDate: string; labelIds?: string[]; payload: { headers: { name: string; value: string }[] } };
  const h = (n: string) => j.payload.headers.find((x) => x.name.toLowerCase() === n.toLowerCase())?.value ?? "";
  return { id: j.id, threadId: j.threadId, from: h("From"), subject: h("Subject"), snippet: j.snippet, date: new Date(Number(j.internalDate)).toISOString(), labels: j.labelIds ?? [] };
}

const b64 = (t: string) => Buffer.from(t, "utf8").toString("base64");
const wrap = (t: string) => b64(t).replace(/.{76}/g, "$&\r\n");

/** Envoie un email (texte + HTML) depuis le compte Gmail connecté. Sert uniquement au récap du matin, vers soi-même. */
export async function sendMail(token: string, m: { to: string; subject: string; text: string; html: string }) {
  const boundary = `jp_${crypto.randomUUID()}`;
  const raw = [
    `To: ${m.to}`,
    `Subject: =?UTF-8?B?${b64(m.subject)}?=`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrap(m.text),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrap(m.html),
    `--${boundary}--`,
    "",
  ].join("\r\n");
  const r = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: Buffer.from(raw, "utf8").toString("base64url") }),
  });
  if (!r.ok) {
    if (r.status === 403) throw new HttpError(403, "Google n'a pas autorisé l'envoi : réactive le récap dans Réglages pour redonner la permission.");
    throw new HttpError(502, `Gmail : envoi impossible (${r.status})`);
  }
}
