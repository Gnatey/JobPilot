import { preBand } from "@/lib/quick-score";

/** Cadran de score : l'élément signature de l'app (un arc de 270° gradué comme un instrument de bord). */
export function Gauge({ value, size = 132, label = "compatibilité", unit = "%", max = 100, className = "", tone: mode = "score" }: { value: number; size?: number; label?: string; unit?: string; max?: number; className?: string; tone?: "score" | "progress" }) {
  const r = 40;
  const arc = 0.75 * 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const tone = mode === "progress" ? (pct >= 100 ? "var(--color-good)" : "var(--color-marigold)") : pct >= 70 ? "var(--color-good)" : pct >= 50 ? "var(--color-marigold)" : "var(--color-bad)";
  const ticks = Array.from({ length: 11 }, (_, i) => {
    const a = ((135 + i * 27) * Math.PI) / 180;
    const r2 = i % 5 === 0 ? 49.5 : 48;
    // arrondi : Node et le navigateur ne calculent pas cos/sin au dernier chiffre près, ce qui casserait l'hydratation
    const f = (n: number) => Math.round(n * 100) / 100;
    return { x1: f(50 + Math.cos(a) * 45.5), y1: f(50 + Math.sin(a) * 45.5), x2: f(50 + Math.cos(a) * r2), y2: f(50 + Math.sin(a) * r2) };
  });
  return (
    <div className={`relative grid shrink-0 place-items-center ${className}`} style={{ width: size, height: size }} role="img" aria-label={`${label} : ${value}${unit}`}>
      <svg viewBox="0 0 100 100" className="absolute inset-0">
        {ticks.map((t, i) => <line key={i} {...t} stroke="var(--color-line)" strokeWidth="1.2" strokeLinecap="round" />)}
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--color-line)" strokeWidth="7" strokeLinecap="round" strokeDasharray={`${arc} 999`} transform="rotate(135 50 50)" />
        {pct > 0 && (
          <circle className="gauge-fill" cx="50" cy="50" r={r} fill="none" stroke={tone} strokeWidth="7" strokeLinecap="round"
            strokeDasharray={`${(arc * pct) / 100} 999`} transform="rotate(135 50 50)" />
        )}
      </svg>
      <div className="text-center leading-none">
        <div className="display" style={{ fontSize: size * 0.3 }}>{value}<span style={{ fontSize: size * 0.14 }}>{unit}</span></div>
        {size >= 100 && label && <div className="mt-1 text-[0.72rem] text-muted">{label}</div>}
      </div>
    </div>
  );
}
export const ScoreRing = Gauge;

/**
 * Un seul pourcentage par offre : celui de l'analyse complète (IA).
 * `estimate` : l'offre n'a pas encore été analysée, on affiche son niveau de pré-tri (titre, mots-clés) sans chiffre,
 * en pointillés, pour que personne ne le prenne pour un diagnostic.
 */
export function ScorePill({ value, estimate = false }: { value: number | null | undefined; estimate?: boolean }) {
  if (value == null) return <span className="text-xs text-muted">—</span>;
  if (estimate) {
    const b = preBand(value);
    const cls = b.id === "top" ? "tag-good" : b.id === "maybe" ? "tag-warn" : "tag-bad";
    return (
      <span className={`tag ${cls} justify-center whitespace-nowrap border border-dashed border-current !px-2 !py-0.5 !text-xs font-semibold`}
        title={`${b.hint}. Le pourcentage s'affiche après l'analyse complète.`}>
        {b.label}
      </span>
    );
  }
  const cls = value >= 70 ? "tag-good" : value >= 50 ? "tag-warn" : "tag-bad";
  return <span className={`tag ${cls} min-w-11 justify-center !px-2 !py-0.5 !text-sm font-bold tabular-nums`}>{value}%</span>;
}

export function Bar({ value }: { value: number }) {
  const tone = value >= 70 ? "bg-good" : value >= 50 ? "bg-marigold" : "bg-bad";
  return (
    <div className="h-1.5 w-full rounded-full bg-line">
      <div className={`h-1.5 rounded-full ${tone}`} style={{ width: `${Math.max(3, value)}%` }} />
    </div>
  );
}
