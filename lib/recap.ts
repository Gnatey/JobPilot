import type { SupabaseClient } from "@supabase/supabase-js";
import { accessToken, appUrl, sendMail } from "./gmail";
import { getProfileById, patchPreferences } from "./profile";
import { addDays, dayDiff, fmtDate, fmtDateTime, plural, today, until, weekStart } from "./format";
import { HttpError } from "./supabase/server";
import { preBand } from "./quick-score";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

type Line = { title: string; sub: string; href?: string };
type Recap = { subject: string; text: string; html: string; empty: boolean };

/** Ce qui compte ce matin : entretiens proches, relances à faire, offres à trier, objectif de la semaine. */
export async function buildRecap(supabase: SupabaseClient, userId: string): Promise<Recap> {
  const base = appUrl();
  const t = today();
  const [{ data: apps }, { data: recos, count }, profile] = await Promise.all([
    supabase.from("applications").select("company, title, status, applied_at, next_action_at, interview_at").eq("user_id", userId).limit(500),
    supabase.from("recommendations").select("title, company, location, quick_score, url", { count: "exact" }).eq("user_id", userId).eq("status", "new").order("quick_score", { ascending: false }).limit(5),
    getProfileById(supabase, userId),
  ]);

  const soon = addDays(3);
  const interviews: Line[] = (apps ?? [])
    .filter((a) => a.interview_at && ["entretien", "test"].includes(a.status) && a.interview_at.slice(0, 10) >= t && a.interview_at.slice(0, 10) <= soon)
    .sort((a, b) => a.interview_at.localeCompare(b.interview_at))
    .map((a) => ({ title: `${a.company} : ${a.title}`, sub: fmtDateTime(a.interview_at) }));

  const followups: Line[] = (apps ?? [])
    .filter((a) => a.next_action_at && ["postule", "relance"].includes(a.status) && a.next_action_at.slice(0, 10) <= t)
    .sort((a, b) => a.next_action_at.localeCompare(b.next_action_at))
    .map((a) => ({ title: `${a.company} : ${a.title}`, sub: `relance ${until(a.next_action_at)}${a.applied_at ? `, postulé le ${fmtDate(a.applied_at)}` : ""}` }));

  const offers: Line[] = (recos ?? []).map((r) => ({ title: `${r.title}${r.company ? `, ${r.company}` : ""}`, sub: `${r.location ?? ""}${r.quick_score != null ? ` · ${preBand(r.quick_score).label.toLowerCase()}` : ""}`.replace(/^ · /, ""), href: r.url ?? undefined }));
  const toSort = count ?? offers.length;

  const goal = profile.preferences?.weekly_goal ?? 5;
  const ws = weekStart();
  const sent = (apps ?? []).filter((a) => a.applied_at && dayDiff(ws, a.applied_at.slice(0, 10)) >= 0).length;

  const bits = [
    interviews.length ? plural(interviews.length, "entretien proche", "entretiens proches") : "",
    followups.length ? plural(followups.length, "relance à faire", "relances à faire") : "",
    toSort ? plural(toSort, "offre à trier", "offres à trier") : "",
  ].filter(Boolean);
  const empty = bits.length === 0;
  const subject = empty ? "JobPilot : rien d'urgent ce matin" : `JobPilot : ${bits.join(", ")}`;

  const sections: { title: string; lines: Line[]; more?: string; link?: string }[] = [
    { title: "Entretiens et épreuves dans les 3 jours", lines: interviews },
    { title: "Relances à faire", lines: followups.slice(0, 8), more: followups.length > 8 ? `et ${followups.length - 8} autres dans le Suivi` : undefined, link: `${base}/suivi` },
    { title: `Offres à trier (${toSort})`, lines: offers, more: toSort > offers.length ? `et ${toSort - offers.length} autres dans Recommandées` : undefined, link: `${base}/recommandees` },
  ].filter((s) => s.lines.length);

  const week = `Cette semaine : ${plural(sent, "candidature envoyée", "candidatures envoyées")} sur un objectif de ${goal}.`;
  const text = [
    "Bonjour,",
    "",
    ...sections.flatMap((s) => [s.title.toUpperCase(), ...s.lines.map((l) => `- ${l.title}${l.sub ? ` (${l.sub})` : ""}${l.href ? `\n  ${l.href}` : ""}`), ...(s.more ? [`  ${s.more}`] : []), s.link ? `  ${s.link}` : "", ""]),
    ...(empty ? ["Aucun entretien proche, aucune relance en attente, aucune offre à trier.", ""] : []),
    week,
    "",
    `Ouvrir JobPilot : ${base}`,
    "",
    "Ce message est envoyé par ton propre JobPilot, à toi seul. Pour l'arrêter : Réglages > Gmail.",
  ].join("\n");

  const html = `<!doctype html><html><body style="margin:0;background:#f4f5f9;font-family:Arial,Helvetica,sans-serif;color:#141a33">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
<p style="font-size:20px;font-weight:bold;margin:0 0 16px">Ton récap du matin</p>
${sections.map((s) => `<div style="background:#fff;border-radius:12px;padding:14px 16px;margin:0 0 12px">
<p style="font-weight:bold;margin:0 0 8px">${esc(s.title)}</p>
${s.lines.map((l) => `<p style="margin:0 0 8px;line-height:1.35">${l.href ? `<a href="${esc(l.href)}" style="color:#141a33;font-weight:bold">${esc(l.title)}</a>` : `<b>${esc(l.title)}</b>`}${l.sub ? `<br><span style="color:#667;font-size:13px">${esc(l.sub)}</span>` : ""}</p>`).join("")}
${s.more ? `<p style="margin:4px 0 0;font-size:13px;color:#667">${esc(s.more)}${s.link ? ` · <a href="${esc(s.link)}" style="color:#141a33">ouvrir</a>` : ""}</p>` : ""}
</div>`).join("")}
${empty ? `<div style="background:#fff;border-radius:12px;padding:14px 16px;margin:0 0 12px">Aucun entretien proche, aucune relance en attente, aucune offre à trier.</div>` : ""}
<p style="margin:12px 0;color:#445">${esc(week)}</p>
<p style="margin:16px 0"><a href="${esc(base)}" style="background:#f5b800;color:#141a33;text-decoration:none;font-weight:bold;padding:10px 18px;border-radius:999px;display:inline-block">Ouvrir JobPilot</a></p>
<p style="font-size:12px;color:#889">Message envoyé par ton propre JobPilot, à toi seul. Pour l'arrêter : Réglages &gt; Gmail.</p>
</div></body></html>`;
  return { subject, text, html, empty };
}

/**
 * Envoie le récap du matin à l'adresse Gmail connectée (donc à soi-même).
 * `force` : envoi de test depuis Réglages (même s'il n'y a rien de neuf, même si le récap est coupé).
 */
export async function sendDailyRecap(supabase: SupabaseClient, userId: string, opts: { force?: boolean } = {}) {
  const profile = await getProfileById(supabase, userId);
  const prefs = profile.preferences ?? ({} as typeof profile.preferences);
  if (!opts.force && !prefs.daily_recap) return { skipped: "récap désactivé" };
  if (!prefs.recap_send_ok) {
    if (opts.force) throw new HttpError(403, "Google n'a pas encore autorisé l'envoi : clique sur « Activer le récap du matin ».");
    return { skipped: "permission d'envoi manquante" };
  }
  const { data: acc } = await supabase.from("gmail_accounts").select("email, refresh_token").eq("user_id", userId).maybeSingle();
  if (!acc?.email) throw new HttpError(400, "Gmail n'est pas connecté.");

  try {
    const recap = await buildRecap(supabase, userId);
    if (recap.empty && !opts.force) return { skipped: "rien à signaler" };
    const token = await accessToken(acc.refresh_token);
    await sendMail(token, { to: acc.email, subject: recap.subject, text: recap.text, html: recap.html });
    await patchPreferences(supabase, userId, { recap_last: { at: new Date().toISOString(), ok: true } });
    return { sent: true, to: acc.email };
  } catch (e) {
    const note = e instanceof Error ? e.message : "erreur";
    await patchPreferences(supabase, userId, { recap_last: { at: new Date().toISOString(), ok: false, note } }).catch(() => {});
    throw e;
  }
}
