"use client";
import { useImperativeHandle, useRef, useState, type Ref } from "react";
import { useRouter } from "next/navigation";
import { Loader2, SearchCheck, Square } from "lucide-react";
import { useFeedback } from "@/components/ui/feedback";
import { refreshBadges } from "@/components/nav";
import { SkipReport } from "@/components/analyze-skips";
import { removeSkips, type Skip } from "@/lib/analyze-skips";
import { CHECK_BATCH, checkSummary, chunk, postedNote, tally, unclearSkips, type CheckResult } from "@/lib/offer-check";

/**
 * Une ligne à vérifier (poste, lien) : une ligne « À analyser » (`kind` « app », par défaut) ou une offre déjà analysée (`kind` « offer », avec le nombre
 * de CV générés : ils partent avec elle si on la supprime). De quoi vérifier son lien et l'afficher dans le bilan.
 */
export type CheckLine = { id: string; title: string; url: string | null; kind?: "app" | "offer"; cv?: number };
export type CheckHandle = { start: (only?: string[]) => void };

type Run = { total: number; done: number; results: CheckResult[]; gone: Skip[]; unclear: Skip[]; stopped: string | null; finished: boolean };

/**
 * « Vérifier les annonces » : lit les liens des lignes « À analyser » ET des offres déjà analysées SANS IA (aucune action IA dépensée) pour repérer celles qui ne sont plus en ligne.
 * Six lignes par requête, une requête après l'autre. Rien n'est supprimé tout seul : les annonces disparues sont listées dans le même bilan que
 * « Tout analyser » (liens à ouvrir pour vérifier, cases à décocher, « Supprimer les N cochées »). Un site qui bloque la lecture ne prouve rien :
 * ses lignes sont comptées « impossibles à vérifier », jamais « disparues ».
 */
export function CheckAds({ lines, ref, locked = false, onBusy, onAnalyze }: { lines: CheckLine[]; ref?: Ref<CheckHandle>; locked?: boolean; onBusy?: (busy: boolean) => void; onAnalyze?: (ids: string[]) => void }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [run, setRun] = useState<Run | null>(null);
  const [busy, setBusy] = useState(false);
  const cancel = useRef(false);

  async function start(ids?: string[]) {
    if (busy || locked) return;
    const byId = new Map(lines.map((l) => [l.id, l]));
    const wanted = (ids ?? lines.map((l) => l.id)).filter((id) => byId.has(id));
    if (!wanted.length) return toast("Aucune ligne à vérifier.", { tone: "info" });
    cancel.current = false;
    setBusy(true);
    onBusy?.(true);
    setRun({ total: wanted.length, done: 0, results: [], gone: [], unclear: [], stopped: null, finished: false });
    const results: CheckResult[] = [];
    let stopped: string | null = null;
    let fails = 0;
    for (const batch of chunk(wanted, CHECK_BATCH)) {
      if (cancel.current) { stopped = "Arrêté à ta demande."; break; }
      const isOffer = (id: string) => byId.get(id)?.kind === "offer";
      const res = await fetch("/api/offers/check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ app_ids: batch.filter((id) => !isOffer(id)), offer_ids: batch.filter(isOffer) }) }).catch(() => null);
      const j = res ? await res.json().catch(() => ({})) : {};
      if (res?.ok && Array.isArray(j.results)) {
        fails = 0;
        results.push(...(j.results as CheckResult[]));
        setRun((r) => r && { ...r, done: results.length, results: [...results] });
        continue;
      }
      if (res?.status === 401) { stopped = "Ta session a expiré : reconnecte-toi, puis relance."; break; }
      if (res?.status === 429) { stopped = j.error ?? "Trop de vérifications en peu de temps : réessaie dans un moment."; break; }
      if (++fails >= 3) { stopped = "Plusieurs échecs de suite : je m'arrête, réessaie dans un moment."; break; }
    }
    const gone: Skip[] = results
      .filter((r) => r.verdict === "gone")
      .map((r): Skip => {
        const l = byId.get(r.id);
        return { appId: r.id, title: l?.title ?? "Annonce", url: l?.url ?? null, kind: "gone", site: r.site, why: r.why, ...(l?.kind === "offer" ? { target: "offer" as const, cv: l.cv ?? 0 } : {}) };
      });
    // Les lignes qu'on n'a pas pu lire (site qui bloque, pas de lien, lien de connexion) : listées avec leur lien pour vérifier à la main, jamais déclarées disparues
    const unclear = unclearSkips(results, byId);
    setBusy(false);
    onBusy?.(false);
    setRun({ total: wanted.length, done: results.length, results, gone, unclear, stopped, finished: true });
    refreshBadges();
    router.refresh();
  }

  useImperativeHandle(ref, () => ({ start: (only) => { void start(only); } }));

  const pct = run && run.total ? Math.round((run.done / run.total) * 100) : 0;
  const t = run ? tally(run.results) : null;
  return (
    <div className="mb-4 rounded-2xl border border-line bg-surface p-4">
      {busy && run ? (
        <div role="status" aria-live="polite">
          <div className="flex flex-wrap items-center gap-3">
            <Loader2 size={18} className="animate-spin text-muted" />
            <p className="min-w-0 flex-1 text-sm"><strong>{Math.min(run.done, run.total)} / {run.total}</strong> <span className="text-muted">liens vérifiés</span></p>
            <button type="button" className="btn btn-sm" onClick={() => { cancel.current = true; }}><Square size={14} /> Arrêter</button>
          </div>
          <div className="mt-3 h-1.5 rounded-full bg-line"><div className="h-1.5 rounded-full bg-marigold transition-[width]" style={{ width: `${Math.max(3, pct)}%` }} /></div>
          <p className="mt-2 text-xs text-muted">Sans IA : je regarde seulement si chaque page existe encore. Garde cette page ouverte.</p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn" onClick={() => start()} disabled={busy || locked}><SearchCheck size={16} /> Vérifier les annonces ({lines.length})</button>
            <p className="min-w-0 flex-1 basis-60 text-sm text-muted">Sans IA, donc rien de dépensé : je regarde quels liens ne sont plus en ligne, y compris pour les offres déjà analysées. Rien n'est supprimé sans toi.</p>
          </div>
          {run?.finished && t && (
            <div className="mt-3 border-t border-line pt-3 text-sm" role="status" aria-live="polite">
              <p><strong>{checkSummary(t, Boolean(run.stopped))}</strong></p>
              {postedNote(run.results) && <p className="mt-1 text-muted">{postedNote(run.results)}</p>}
              {run.stopped && <p className="mt-1 text-muted">{run.stopped}</p>}
              {run.gone.length + run.unclear.length > 0 && (
                <SkipReport skips={[...run.gone, ...run.unclear]} onRemoved={(ids) => setRun((r) => r && { ...r, gone: removeSkips(r.gone, ids), unclear: removeSkips(r.unclear, ids) })} onAnalyze={onAnalyze} />
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
