"use client";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Application } from "@/lib/types";
import { today } from "@/lib/format";

type Kind = "entretien" | "relance" | "envoi";
type Ev = { kind: Kind; app: Application; time?: string; late?: boolean };

const KINDS: Record<Kind, { label: string; dot: string; chip: string }> = {
  entretien: { label: "Entretien ou épreuve", dot: "bg-marigold", chip: "bg-marigold/25 text-ink" },
  relance: { label: "Relance à faire", dot: "bg-sky-500", chip: "bg-sky-500/15 text-ink" },
  envoi: { label: "Candidature envoyée", dot: "bg-muted", chip: "bg-line text-muted" },
};
const DAYS = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."];
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Calendrier du mois : entretiens, relances à faire et candidatures envoyées, un clic ouvre la fiche. */
export function SuiviCalendar({ apps, onOpen }: { apps: Application[]; onOpen: (a: Application) => void }) {
  const now = new Date();
  const [cursor, setCursor] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));
  const [picked, setPicked] = useState<string>(today());
  const todayKey = today();

  const byDay = useMemo(() => {
    const m = new Map<string, Ev[]>();
    const add = (k: string, e: Ev) => m.set(k, [...(m.get(k) ?? []), e]);
    for (const a of apps) {
      if (a.interview_at && ["entretien", "test"].includes(a.status)) {
        const d = new Date(a.interview_at);
        add(ymd(d), { kind: "entretien", app: a, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` });
      }
      if (a.next_action_at && ["postule", "relance"].includes(a.status)) add(a.next_action_at.slice(0, 10), { kind: "relance", app: a, late: a.next_action_at.slice(0, 10) < todayKey });
      if (a.applied_at) add(a.applied_at.slice(0, 10), { kind: "envoi", app: a });
    }
    for (const list of m.values()) list.sort((x, y) => (x.time ?? "99").localeCompare(y.time ?? "99") || x.kind.localeCompare(y.kind));
    return m;
  }, [apps, todayKey]);

  const y = cursor.getFullYear();
  const mo = cursor.getMonth();
  const lead = (new Date(y, mo, 1).getDay() + 6) % 7; // semaine commençant le lundi
  const total = Math.ceil((lead + new Date(y, mo + 1, 0).getDate()) / 7) * 7;
  const cells = Array.from({ length: total }, (_, i) => new Date(y, mo, 1 - lead + i));
  const title = cap(cursor.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }));
  const go = (n: number) => setCursor(new Date(y, mo + n, 1));
  const pickedEvents = byDay.get(picked) ?? [];
  const pickedLabel = cap(new Date(`${picked}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }));

  return (
    <section aria-label="Calendrier des candidatures">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="heading mr-auto text-xl" aria-live="polite">{title}</h2>
        <button className="btn btn-sm" onClick={() => { setCursor(new Date(now.getFullYear(), now.getMonth(), 1)); setPicked(todayKey); }}>Aujourd'hui</button>
        <div className="flex gap-1">
          <button className="btn btn-sm btn-icon" onClick={() => go(-1)} aria-label="Mois précédent"><ChevronLeft size={18} /></button>
          <button className="btn btn-sm btn-icon" onClick={() => go(1)} aria-label="Mois suivant"><ChevronRight size={18} /></button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="grid grid-cols-7 border-b border-line bg-paper text-center text-xs font-semibold text-muted">
          {DAYS.map((d) => <div key={d} className="py-2">{d}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((d, i) => {
            const k = ymd(d);
            const evs = byDay.get(k) ?? [];
            const out = d.getMonth() !== mo;
            const isToday = k === todayKey;
            const sel = k === picked;
            return (
              <button key={k} onClick={() => { setPicked(k); if (out) setCursor(new Date(d.getFullYear(), d.getMonth(), 1)); }}
                aria-pressed={sel}
                aria-label={`${d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}${evs.length ? `, ${evs.length} ${evs.length > 1 ? "événements" : "événement"}` : ""}`}
                className={`min-h-16 border-line p-1.5 text-left align-top transition-colors hover:bg-paper sm:min-h-24 ${i % 7 ? "border-l" : ""} ${i >= 7 ? "border-t" : ""} ${out ? "bg-paper/60 text-muted/60" : ""} ${sel ? "bg-marigold/10 ring-2 ring-inset ring-marigold" : ""}`}>
                <span className={`inline-grid h-6 min-w-6 place-items-center rounded-full px-1 text-sm tabular-nums ${isToday ? "bg-ink font-semibold text-paper" : ""}`}>{d.getDate()}</span>
                <span className="mt-1 hidden space-y-0.5 sm:block">
                  {evs.slice(0, 3).map((e, j) => (
                    <span key={j} className={`block truncate rounded px-1 py-0.5 text-[0.7rem] leading-tight ${KINDS[e.kind].chip} ${e.late ? "!bg-bad/15 font-semibold !text-bad" : ""}`}>
                      {e.time ? `${e.time} ` : ""}{e.app.company}
                    </span>
                  ))}
                  {evs.length > 3 && <span className="block px-1 text-[0.7rem] text-muted">+ {evs.length - 3} autres</span>}
                </span>
                {evs.length > 0 && (
                  <span className="mt-1 flex flex-wrap gap-0.5 sm:hidden" aria-hidden>
                    {evs.slice(0, 4).map((e, j) => <span key={j} className={`h-1.5 w-1.5 rounded-full ${e.late ? "bg-bad" : KINDS[e.kind].dot}`} />)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {(Object.keys(KINDS) as Kind[]).map((k) => <span key={k} className="inline-flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-full ${KINDS[k].dot}`} /> {KINDS[k].label}</span>)}
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-bad" /> Relance en retard</span>
      </p>

      <div className="mt-5">
        <h3 className="heading">{pickedLabel}</h3>
        {pickedEvents.length === 0 ? (
          <p className="mt-1 text-sm text-muted">Rien de prévu ce jour-là.</p>
        ) : (
          <ul className="list mt-2">
            {pickedEvents.map((e, i) => (
              <li key={i}>
                <button onClick={() => onOpen(e.app)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-paper">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${e.late ? "bg-bad" : KINDS[e.kind].dot}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{e.app.title}</span>
                    <span className="block truncate text-sm text-muted">{e.app.company}</span>
                  </span>
                  <span className={`shrink-0 text-sm ${e.late ? "font-semibold text-bad" : "text-muted"}`}>{e.time ? `${e.time} · ` : ""}{e.late ? "Relance en retard" : KINDS[e.kind].label}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
