"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { AutoRefresh } from "./auto-refresh";
import { useT } from "@/components/i18n";
import { tx } from "@/lib/i18n/translate";

const STEPS = [
  { at: 0, text: tx("Lecture de ton CV") },
  { at: 12, text: tx("Repérage des points faibles et des incohérences") },
  { at: 30, text: tx("Comparaison avec ce que demandent les recruteurs") },
  { at: 50, text: tx("Rédaction du diagnostic et du plan d'action") },
];

/** Écran d'attente de l'analyse : avance seul, se remplace par le diagnostic dès qu'il est prêt. */
export function AnalysisProgress({ startedAt }: { startedAt: string }) {
  const t = useT();
  const [sec, setSec] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setSec(Math.max(0, Math.round((Date.now() - new Date(startedAt).getTime()) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [startedAt]);

  const s = sec ?? 0;
  const current = STEPS.reduce((n, st, i) => (s >= st.at ? i : n), 0);
  return (
    <div className="card p-6 md:p-8" role="status" aria-live="polite">
      <AutoRefresh active />
      <div className="flex items-center gap-3">
        <Loader2 size={22} className="animate-spin text-marigold-deep" />
        <p className="font-semibold">{t("Ça avance, tu n'as rien à faire.")}</p>
        {sec !== null && <span className="ml-auto text-sm tabular-nums text-muted" aria-label={t("Temps écoulé")}>{Math.floor(s / 60)}:{t(String(s % 60).padStart(2, "0"))}</span>}
      </div>
      <ol className="mt-5 space-y-2.5">
        {STEPS.map((st, i) => (
          <li key={st.text} className={`flex items-center gap-3 ${i > current ? "text-muted/60" : i < current ? "text-muted" : "font-semibold"}`}>
            <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${i < current ? "bg-good text-on-solid" : i === current ? "bg-marigold text-ink" : "border border-line"}`}>
              {i < current ? <Check size={13} /> : i === current ? <Loader2 size={12} className="animate-spin" /> : null}
            </span>
            {t(st.text)}
          </li>
        ))}
      </ol>
      <p className="mt-6 max-w-[60ch] text-sm text-muted">
        {s > 150
          ? t("C'est plus long que d'habitude : l'IA de Google est lente en ce moment. Tu peux fermer cette page, l'analyse continue et apparaîtra dans « Mon CV ».")
          : t("Compte environ une minute. Tu peux quitter cette page : l'analyse continue et sera dans « Mon CV ».")}
      </p>
    </div>
  );
}

/** Analyse échouée : message clair et nouvelle tentative en un clic. */
export function AnalysisFailed({ id, message, canRetry, detail }: { id: string; message: string; canRetry: boolean; detail?: string }) {
  const t = useT();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function retry() {
    setBusy(true);
    setErr(null);
    const r = await fetch("/api/cv/retry", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) })
      .then((x) => x.json()).catch(() => ({ error: "Connexion interrompue, réessaie." }));
    setBusy(false);
    if (r.error) return setErr(r.error);
    router.refresh();
  }

  return (
    <div className="rounded-2xl border border-bad/40 bg-bad/10 p-6" role="alert">
      <p className="max-w-[60ch]">{t(message)}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {canRetry && (
          <button type="button" className="btn btn-primary" disabled={busy} onClick={retry}>
            {busy ? <><Loader2 size={16} className="animate-spin" /> {t("Relance…")}</> : t("Relancer l'analyse")}
          </button>
        )}
        <Link href="/mon-cv" className={canRetry ? "btn" : "btn btn-primary"}>{canRetry ? t("Retour à Mon CV") : t("Déposer à nouveau mon CV")}</Link>
      </div>
      {err && <p className="mt-3 text-sm text-bad">{t(err)}</p>}
      {detail && (
        <details className="mt-4 text-sm text-muted">
          <summary className="cursor-pointer">{t("Détail technique")}</summary>
          <p className="mt-1.5 max-w-[70ch] break-words font-mono text-xs">{t(detail)}</p>
        </details>
      )}
    </div>
  );
}
