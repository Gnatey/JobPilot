type Week = { week: string; sent: number; responses: number };

/** Histogramme hebdomadaire en CSS pur : aucune bibliothèque, aucun JavaScript côté navigateur. */
export function WeeklyChart({ weeks }: { weeks: Week[] }) {
  const max = Math.max(...weeks.map((w) => w.sent), 1);
  const total = weeks.reduce((n, w) => n + w.sent, 0);
  return (
    <figure>
      <figcaption className="mb-7 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-chart-1" /> Envoyées</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-chart-2" /> Avec réponse</span>
        <span className="ml-auto">{total} sur 12 semaines</span>
      </figcaption>
      <div className="flex h-48 items-end gap-1.5 border-b border-line sm:gap-2" role="img" aria-label={`Candidatures par semaine : ${weeks.map((w) => `${w.week} ${w.sent} envoyées, ${w.responses} réponses`).join(" ; ")}`}>
        {weeks.map((w) => (
          <div key={w.week} className="group relative flex h-full min-w-0 flex-1 items-end justify-center gap-0.5" title={`Semaine du ${w.week} : ${w.sent} envoyées, ${w.responses} réponses`}>
            <div className="w-full max-w-4 rounded-t bg-chart-1" style={{ height: `${w.sent ? Math.max(4, (w.sent / max) * 100) : 0}%` }} />
            <div className="w-full max-w-4 rounded-t bg-chart-2" style={{ height: `${w.responses ? Math.max(4, (w.responses / max) * 100) : 0}%` }} />
            {w.sent > 0 && <span className="pointer-events-none absolute -top-5 text-xs font-semibold tabular-nums">{w.sent}</span>}
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-1.5 text-[0.68rem] text-muted sm:gap-2" aria-hidden>
        {weeks.map((w, i) => <span key={w.week} className="min-w-0 flex-1 text-center">{i % 2 === (weeks.length - 1) % 2 ? w.week.slice(0, 5) : ""}</span>)}
      </div>
    </figure>
  );
}

/** Couleurs des statuts (mêmes teintes que les pastilles du Suivi). */
const STATUS_HEX: Record<string, string> = {
  a_postuler: "#94a3b8", postule: "#0ea5e9", relance: "#6366f1", entretien: "#f59e0b",
  test: "#f97316", offre: "#10b981", refuse: "#f43f5e", abandonne: "#a1a1aa", expiree: "#c4bfb5",
};

/** Camembert (anneau) de la répartition des candidatures par statut, en SVG pur. */
export function StatusDonut({ parts }: { parts: { id: string; label: string; value: number }[] }) {
  const total = parts.reduce((n, p) => n + p.value, 0);
  const shown = parts.filter((p) => p.value > 0);
  const R = 15.915; // circonférence = 100 : les longueurs d'arc sont directement des pourcentages
  let offset = 0;
  return (
    <figure className="flex flex-col items-center gap-6 sm:flex-row sm:gap-10">
      <div className="relative h-44 w-44 shrink-0">
        <svg viewBox="0 0 42 42" className="h-full w-full -rotate-90" role="img" aria-label={`Candidatures par statut : ${shown.map((p) => `${p.label} ${p.value}`).join(", ")}`}>
          <circle cx="21" cy="21" r={R} fill="none" stroke="var(--color-line)" strokeWidth="6" />
          {shown.map((p) => {
            const len = (p.value / total) * 100;
            const el = (
              <circle key={p.id} cx="21" cy="21" r={R} fill="none" stroke={STATUS_HEX[p.id] ?? "#999"} strokeWidth="6"
                strokeDasharray={`${Math.max(len - (shown.length > 1 ? 0.6 : 0), 0.1)} ${100 - len + (shown.length > 1 ? 0.6 : 0)}`} strokeDashoffset={-offset} />
            );
            offset += len;
            return el;
          })}
        </svg>
        <div className="absolute inset-0 grid place-content-center text-center">
          <span className="display text-4xl tabular-nums leading-none">{total}</span>
          <span className="mt-1 text-xs text-muted">{total > 1 ? "candidatures" : "candidature"}</span>
        </div>
      </div>
      <ul className="w-full max-w-sm space-y-1.5 text-sm">
        {parts.map((p) => (
          <li key={p.id} className={`flex items-center gap-2.5 ${p.value ? "" : "text-muted"}`}>
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: STATUS_HEX[p.id] ?? "#999" }} />
            <span className="flex-1">{p.label}</span>
            <span className="font-semibold tabular-nums">{p.value}</span>
            <span className="w-11 text-right tabular-nums text-muted">{total ? Math.round((p.value / total) * 100) : 0} %</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

type Group = { key: string; sent: number; responses: number; interviews: number; response_rate: number };

/** Une comparaison en phrases : « 2 réponses sur 8 envoyées », avec une barre pour le taux de réponse. */
export function RateList({ rows }: { rows: Group[] }) {
  if (!rows.length) return <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">Pas encore de candidature envoyée.</p>;
  const s = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;
  return (
    <ul className="space-y-4">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span className="font-semibold">{r.key}</span>
            <span className="text-sm text-muted">{r.responses ? s(r.responses, "réponse", "réponses") : "aucune réponse"} sur {s(r.sent, "envoyée", "envoyées")}</span>
          </div>
          <div className="mt-1.5 flex items-center gap-2.5">
            <div className="h-2.5 flex-1 rounded-full bg-line" role="img" aria-label={`Taux de réponse ${r.response_rate} %`}>
              <div className="h-2.5 rounded-full bg-chart-1" style={{ width: `${r.response_rate ? Math.max(4, r.response_rate) : 0}%` }} />
            </div>
            <span className="w-10 text-right text-sm font-semibold tabular-nums">{r.response_rate} %</span>
          </div>
          {r.interviews > 0 && <p className="mt-1 text-xs text-muted">dont {s(r.interviews, "entretien", "entretiens")}</p>}
        </li>
      ))}
    </ul>
  );
}
