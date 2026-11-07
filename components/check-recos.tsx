"use client";
import { useRef, useState } from "react";
import { ExternalLink, Loader2, SearchCheck, Square } from "lucide-react";
import { useFeedback } from "@/components/ui/feedback";
import { refreshBadges } from "@/components/nav";
import { bulkDecision } from "@/components/reco-actions";
import { linkOf, GONE_REASON } from "@/lib/analyze-skips";
import { checkSummary, tally, type CheckResult } from "@/lib/offer-check";
import { goneIds, rejectedMessage } from "@/lib/reco-check";
import { runChecks } from "@/lib/check-run";

/** Une offre « À trier » à vérifier : de quoi lire son lien et l'afficher dans le bilan. */
export type CheckReco = { id: string; title: string | null; company: string | null; url: string | null };
type Gone = { id: string; title: string; company: string; url: string | null };
type Run = { total: number; done: number; results: CheckResult[]; gone: Gone[]; stopped: string | null; finished: boolean };

/**
 * « Vérifier les annonces » dans Recommandées : lit les liens des offres « À trier » SANS IA (aucune action IA dépensée) pour repérer celles qui ne
 * sont plus en ligne. Six offres par requête, une requête après l'autre. Rien n'est écarté tout seul : les annonces disparues sont listées avec leur lien
 * (à ouvrir pour vérifier), cochées d'office (on décoche celles à garder), puis « Écarter les N cochées » les range dans Écartées avec la raison
 * « Offre plus disponible » (neutre pour l'apprentissage, « Annuler » les remet). Un site qui bloque la lecture ne prouve rien : ses offres sont comptées
 * « impossibles à vérifier », jamais « disparues ».
 */
export function CheckRecos({ recos, onRejected, onRestored }: { recos: CheckReco[]; onRejected: (ids: string[]) => void; onRestored: (ids: string[]) => void }) {
  const { toast } = useFeedback();
  const [run, setRun] = useState<Run | null>(null);
  const [busy, setBusy] = useState(false);
  const [unchecked, setUnchecked] = useState<Set<string>>(new Set()); // décochées : à garder
  const [removing, setRemoving] = useState(false);
  const cancel = useRef(false);

  async function start() {
    if (busy || !recos.length) return;
    const byId = new Map(recos.map((r) => [r.id, r]));
    const ids = recos.map((r) => r.id);
    cancel.current = false;
    setBusy(true);
    setUnchecked(new Set());
    setRun({ total: ids.length, done: 0, results: [], gone: [], stopped: null, finished: false });
    const { results, stopped } = await runChecks({
      endpoint: "/api/recommendations/check", ids, cancelled: () => cancel.current,
      onProgress: (rs) => setRun((r) => r && { ...r, done: rs.length, results: rs }),
    });
    const gone: Gone[] = goneIds(results).map((id) => {
      const r = byId.get(id);
      return { id, title: r?.title || "Offre", company: r?.company || "", url: r?.url ?? null };
    });
    setBusy(false);
    setRun({ total: ids.length, done: results.length, results, gone, stopped, finished: true });
  }

  async function removeChecked() {
    if (!run || removing) return;
    const ids = run.gone.filter((g) => !unchecked.has(g.id)).map((g) => g.id);
    if (!ids.length) return;
    setRemoving(true);
    const res = await bulkDecision(ids, "reject", GONE_REASON);
    setRemoving(false);
    if (!res.ok) return toast(res.error, { tone: "err" });
    onRejected(ids);
    setRun((r) => r && { ...r, gone: r.gone.filter((g) => !ids.includes(g.id)) });
    refreshBadges();
    toast(rejectedMessage(ids.length), {
      action: { label: "Annuler", run: async () => { const u = await bulkDecision(ids, "restore"); if (!u.ok) return toast(u.error, { tone: "err" }); onRestored(ids); refreshBadges(); } },
    });
  }

  const toggle = (id: string) => setUnchecked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const pct = run && run.total ? Math.round((run.done / run.total) * 100) : 0;
  const t = run ? tally(run.results) : null;
  const nChecked = run ? run.gone.filter((g) => !unchecked.has(g.id)).length : 0;
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
            <button type="button" className="btn" onClick={start} disabled={busy || !recos.length}><SearchCheck size={16} /> Vérifier les annonces ({recos.length})</button>
            <p className="min-w-0 flex-1 basis-60 text-sm text-muted">Sans IA, donc rien de dépensé : je regarde quels liens ne sont plus en ligne. Rien n'est écarté sans toi.</p>
          </div>
          {run?.finished && t && (
            <div className="mt-3 border-t border-line pt-3 text-sm" role="status" aria-live="polite">
              <p><strong>{checkSummary(t, Boolean(run.stopped))}</strong></p>
              {run.stopped && <p className="mt-1 text-muted">{run.stopped}</p>}
              {run.gone.length > 0 && (
                <div className="mt-3">
                  <p className="text-muted">Annonces disparues : ouvre le lien pour vérifier, décoche celles que tu veux garder.</p>
                  <ul className="mt-2 divide-y divide-line">
                    {run.gone.map((g) => {
                      const href = linkOf(g.url);
                      return (
                        <li key={g.id} className="flex items-start gap-3 py-2">
                          <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-marigold)]" checked={!unchecked.has(g.id)} onChange={() => toggle(g.id)} aria-label={`Écarter : ${g.title}`} />
                          <p className="min-w-0 flex-1"><span className="font-semibold">{g.title}</span>{g.company && <span className="text-muted">, {g.company}</span>}</p>
                          {href && <a href={href} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-ghost hit"><ExternalLink size={16} /> Annonce</a>}
                        </li>
                      );
                    })}
                  </ul>
                  <button type="button" className="btn btn-sm mt-3" onClick={removeChecked} disabled={removing || nChecked === 0}>
                    {removing ? <><Loader2 size={15} className="animate-spin" /> Je les écarte…</> : <>Écarter les {nChecked} cochée{nChecked > 1 ? "s" : ""}</>}
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
