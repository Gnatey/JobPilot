"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles, Square } from "lucide-react";
import { useFeedback } from "@/components/ui/feedback";
import { refreshBadges } from "@/components/nav";
import type { QueueItem } from "@/lib/analyze-queue";

type Skip = { title: string; why: string };
type Run = { total: number; done: number; ok: number; estimated: number; current: string; skipped: Skip[]; stopped: string | null; finished: boolean; possible: number | null };

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * « Tout analyser » : analyse une par une les lignes « À analyser » d'Offres & CV, les mieux notées d'abord.
 * S'arrête proprement quand les IA gratuites sont à leur limite ou que le budget d'actions du jour est atteint ; la liste se recalcule
 * à chaque fois, donc on reprend plus tard d'un simple clic. Les offres dont l'annonce n'a pu être lue qu'en extrait (Indeed…) sont
 * analysées quand même, avec un pourcentage marqué « estimé ».
 */
export function AnalyzeAll({ count }: { count: number }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [run, setRun] = useState<Run | null>(null);
  const [busy, setBusy] = useState(false);
  const cancel = useRef(false);

  async function start() {
    cancel.current = false;
    setBusy(true);
    setRun({ total: 0, done: 0, ok: 0, estimated: 0, current: "Je prépare la liste…", skipped: [], stopped: null, finished: false, possible: null });
    const q = await fetch("/api/offers/queue").then((r) => r.json()).catch(() => null);
    if (!q || q.error) {
      setBusy(false); setRun(null);
      return toast(q?.error ?? "Connexion interrompue, réessaie.", { tone: "err" });
    }
    const items = q.items as QueueItem[];
    const possible = (q.budget?.possible ?? null) as number | null;
    if (!items.length) {
      setBusy(false); setRun(null);
      return toast(q.skipped ? "Ces lignes n'ont ni lien ni texte : ouvre-les une à une pour coller l'annonce." : "Rien à analyser.", { tone: "info" });
    }
    if (possible === 0) {
      setBusy(false);
      return setRun({ total: items.length, done: 0, ok: 0, estimated: 0, current: "", skipped: [], stopped: "Tu as déjà utilisé toutes tes actions IA d'aujourd'hui. Elles repartent de zéro cette nuit : reviens demain.", finished: true, possible });
    }

    let ok = 0, estimated = 0, fails = 0;
    let stopped: string | null = null;
    const skipped: Skip[] = [];
    for (let i = 0; i < items.length; i++) {
      if (cancel.current) { stopped = "Arrêté à ta demande."; break; }
      const it = items[i];
      const label = `${it.title}${it.company ? `, ${it.company}` : ""}`;
      setRun((r) => r && { ...r, total: items.length, done: i, current: label, possible });
      const res = await fetch("/api/offers/analyze", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ app_id: it.app_id, reco_id: it.reco_id ?? undefined, url: it.url ?? undefined, allow_partial: true }),
      }).catch(() => null);
      const j = res ? await res.json().catch(() => ({})) : {};
      if (res?.ok && j.id) {
        ok++; fails = 0;
        if (j.estimated) estimated++;
        router.refresh();
        await pause(400);
        continue;
      }
      const status = res?.status ?? 0;
      // Limite d'actions du jour, ou toutes les IA saturées / à leur limite : inutile d'insister, on reprendra plus tard
      if (status === 429 || status === 503) { stopped = j.error ?? "Les IA gratuites sont à leur limite pour le moment."; break; }
      if (status === 401) { stopped = "Ta session a expiré : reconnecte-toi, puis relance."; break; }
      if (status === 410) skipped.push({ title: label, why: "annonce plus disponible" });
      else if (status === 422 || status === 400) skipped.push({ title: label, why: "annonce illisible : ouvre sa fiche et colle le texte" });
      else {
        skipped.push({ title: label, why: "n'a pas pu être analysée, à relancer" });
        if (++fails >= 3) { stopped = "Plusieurs échecs de suite : je m'arrête, réessaie dans un moment."; break; }
      }
    }
    setBusy(false);
    setRun({ total: items.length, done: ok + skipped.length, ok, estimated, current: "", skipped, stopped, finished: true, possible });
    refreshBadges();
    router.refresh();
  }

  const pct = run && run.total ? Math.round((run.done / run.total) * 100) : 0;
  return (
    <div className="mb-4 rounded-2xl border border-line bg-surface p-4">
      {busy && run ? (
        <div role="status" aria-live="polite">
          <div className="flex flex-wrap items-center gap-3">
            <Loader2 size={18} className="animate-spin text-muted" />
            <p className="min-w-0 flex-1 text-sm"><strong>{run.total ? `${Math.min(run.done + 1, run.total)} / ${run.total}` : "…"}</strong> <span className="text-muted">{run.current}</span></p>
            <button type="button" className="btn btn-sm" onClick={() => { cancel.current = true; }}><Square size={14} /> Arrêter</button>
          </div>
          <div className="mt-3 h-1.5 rounded-full bg-line"><div className="h-1.5 rounded-full bg-marigold transition-[width]" style={{ width: `${Math.max(3, pct)}%` }} /></div>
          <p className="mt-2 text-xs text-muted">{run.ok} analysée{run.ok > 1 ? "s" : ""}{run.possible != null ? `, environ ${run.possible} possibles aujourd'hui` : ""}. Garde cette page ouverte.</p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn btn-primary" onClick={start} disabled={busy}><Sparkles size={16} /> Tout analyser ({count})</button>
            <p className="min-w-0 flex-1 basis-60 text-sm text-muted">Une à une, les mieux notées d'abord. Je m'arrête quand les IA gratuites sont à leur limite : tu reprends plus tard d'un clic.</p>
          </div>
          {run?.finished && (
            <div className="mt-3 border-t border-line pt-3 text-sm" role="status" aria-live="polite">
              <p>
                <strong>{run.ok} offre{run.ok > 1 ? "s" : ""} analysée{run.ok > 1 ? "s" : ""}</strong>
                {run.estimated > 0 && <> dont {run.estimated} avec un pourcentage <em>estimé</em> (extrait seulement)</>}.
              </p>
              {run.stopped && <p className="mt-1 text-muted">{run.stopped} Clique à nouveau sur « Tout analyser » plus tard : je reprends là où j'en suis.</p>}
              {run.skipped.length > 0 && (
                <ul className="mt-2 list-disc space-y-0.5 pl-5 text-muted">
                  {run.skipped.slice(0, 8).map((s, i) => <li key={i}><span className="text-ink">{s.title}</span> : {s.why}</li>)}
                  {run.skipped.length > 8 && <li>… et {run.skipped.length - 8} autres.</li>}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
