import { createClient } from "@supabase/supabase-js";
import { appUrl } from "@/lib/gmail";
import { followupOn, followupDue } from "@/lib/followup";
import { today } from "@/lib/format";

export const dynamic = "force-dynamic";

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r\n|\r|\n/g, "\\n");
/** Les lignes d'un fichier .ics ne dépassent pas 75 caractères : on replie les plus longues. */
const fold = (line: string) => line.match(/.{1,72}/g)?.join("\r\n ") ?? line;
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const day = (d: string) => d.replace(/-/g, "").slice(0, 8);
const nextDay = (d: string) => day(new Date(Date.parse(`${d.slice(0, 10)}T12:00:00Z`) + 864e5).toISOString().slice(0, 10));

/**
 * Agenda à s'abonner dans Google Agenda / Apple Calendrier / Outlook : relances à faire et entretiens.
 * L'adresse contient un jeton secret (Réglages > Agenda) ; on peut le régénérer à tout moment.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const token = (await ctx.params).token.replace(/\.ics$/i, "");
  if (!/^[a-f0-9]{32,64}$/.test(token)) return new Response("Introuvable", { status: 404 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Agenda indisponible : SUPABASE_SERVICE_ROLE_KEY n'est pas configurée dans Vercel.");
    return new Response("Agenda indisponible pour le moment.", { status: 501 });
  }

  const admin = createClient(url, key, { auth: { persistSession: false } });
  const { data: prof } = await admin.from("profiles").select("user_id").eq("data->preferences->>ics_token", token).maybeSingle();
  if (!prof) return new Response("Introuvable", { status: 404 });
  const { data: apps } = await admin.from("applications").select("*").eq("user_id", prof.user_id).in("status", ["entretien", "test"]);

  const now = stamp(new Date());
  const todayKey = today();
  const base = appUrl();
  const out = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//JobPilot//FR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "X-WR-CALNAME:JobPilot", "X-WR-TIMEZONE:Europe/Paris", "REFRESH-INTERVAL;VALUE=DURATION:PT6H", "X-PUBLISHED-TTL:PT6H",
  ];
  for (const a of apps ?? []) {
    const link = a.offer_id ? `${base}/offres/${a.offer_id}` : `${base}/suivi`;
    if (a.interview_at && ["entretien", "test"].includes(a.status)) {
      const start = new Date(a.interview_at);
      out.push(
        "BEGIN:VEVENT", `UID:${a.id}-entretien@jobpilot`, `DTSTAMP:${now}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(new Date(start.getTime() + 3600e3))}`,
        fold(`SUMMARY:${esc(`${a.status === "test" ? "Test" : "Entretien"} : ${a.company}`)}`),
        fold(`DESCRIPTION:${esc(`${a.title}\nPréparation : ${link}#prep`)}`),
        "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:Entretien dans 1 heure", "TRIGGER:-PT1H", "END:VALARM",
        "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:Entretien demain", "TRIGGER:-P1D", "END:VALARM",
        "END:VEVENT"
      );
    }
    // Relance : seulement après un entretien ou une épreuve (lib/followup.ts) ; plus d'événement pour une candidature sans entretien
    const on = followupOn(a);
    if (on && (on >= todayKey || followupDue(a, todayKey))) {
      out.push(
        "BEGIN:VEVENT", `UID:${a.id}-relance@jobpilot`, `DTSTAMP:${now}`, `DTSTART;VALUE=DATE:${day(on)}`, `DTEND;VALUE=DATE:${nextDay(on)}`,
        fold(`SUMMARY:${esc(`Relancer ${a.company} après l'entretien`)}`),
        fold(`DESCRIPTION:${esc(`${a.title}\nRédiger la relance : ${base}/suivi?open=${a.id}`)}`),
        "TRANSP:TRANSPARENT", "END:VEVENT"
      );
    }
  }
  out.push("END:VCALENDAR");
  return new Response(out.join("\r\n") + "\r\n", {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "private, max-age=600", "Content-Disposition": 'inline; filename="jobpilot.ics"' },
  });
}
