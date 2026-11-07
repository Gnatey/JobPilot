"use client";
import { useImperativeHandle, useRef, useState, type Ref } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles, Square } from "lucide-react";
import { useFeedback } from "@/components/ui/feedback";
import { refreshBadges } from "@/components/nav";
import { SkipReport } from "@/components/analyze-skips";
import { removeSkips, skipKind, type Skip } from "@/lib/analyze-skips";
import { restrictQueue } from "@/lib/selection";
import type { QueueBlocked, QueueItem } from "@/lib/analyze-queue";

type Run = { total: number; done: number; ok: number; estimated: number; current: string; skipped: Skip[]; stopped: string | null; finished: boolean; possible: number | null; noSource: number };

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Ce que l'écran voisin (liste d'Offres & CV) peut déclencher : analyser seulement les lignes cochées. */
export type AnalyzeHandle = { start: (only?: string[]) => void };

/**
 * « Tout analyser » : analyse une par une les lignes « À analyser » d'Offres & CV, les mieux notées d'abord.
 * S'arrête proprement quand les IA gratuites sont à leur limite ou que le budget d'actions du jour est atteint ; la liste se recalcule
 * à chaque fois, donc on reprend plus tard d'un simple clic. Les offres dont l'annonce n'a pu être lue qu'en extrait (Indeed…) sont
 * analysées quand même, avec un pourcentage marqué « estimé ».
 * `start(only)` : seulement les lignes dont l'identifiant est donné (« Analyser la sélection »), même file, mêmes arrêts, même bilan.
 * `locked` : une autre opération (vérification des liens) tourne, on n'en lance pas deux à la fois ; `onBusy` la prévient quand celle-ci démarre ou finit.
 */
export function AnalyzeAll({ count, ref, locked = false, onBusy }: { count: number; ref?: Ref<AnalyzeHandle>; locked?: boolean; onBusy?: (busy: boolean) => void }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [run, setRun] = useState<Run | null>(null);
  const [busy, setBusy] = useState(false);
  const cancel = useRef(false);

  async function start(ids?: string[]) {
    if (busy || locked) return;
    const only = ids ? new Set(ids) : null;
    cancel.current = false;
    setBusy(true);
    onBusy?.(true);
    setRun({ total: 0, done: 0, ok: 0, estimated: 0, current: "Je prépare la liste…", skipped: [], stopped: null, finished: false, possible: null, noSource: 0 });
    const q = await fetch("/api/offers/queue").then((r) => r.json()).catch(() => null);
    if (!q || q.error) {
      setBusy(false); setRun(null); onBusy?.(false);
      return toast(q?.error ?? "Connexion interrompue, réessaie.", { tone: "err" });
    }
    const cut = restrictQueue({ items: q.items as QueueItem[], blocked: (q.blocked ?? []) as QueueBlocked[], skippedIds: (q.skippedIds ?? []) as string[], skipped: Number(q.skipped) || 0 }, only);
    const items = cut.items;
    const noSource = cut.noSource; // lignes sans lien ni texte : jamais analysables d'ici
    const possible = (q.budget?.possible ?? null) as number | null;
    // Lignes d'un site qui refuse la lecture (Indeed), sans texte ni extrait : jamais tentées, listées d'office dans le bilan
    const blocked: Skip[] = cut.blocked.map((b) => ({ appId: b.app_id, title: `${b.title}${b.company ? `, ${b.company}` : ""}`, url: b.url, kind: "unreadable", site: b.site }));
    if (!items.length && !blocked.length) {
      setBusy(false); setRun(null); onBusy?.(false);
      return toast(noSource ? "Ces lignes n'ont ni lien ni texte : ouvre-les une à une pour coller l'annonce." : "Rien à analyser.", { tone: "info" });
    }
    if (!items.length || possible === 0) {
      setBusy(false); onBusy?.(false);
      return setRun({ total: items.length, done: 0, ok: 0, estimated: 0, current: "", skipped: blocked, stopped: items.length ? "Tu as déjà utilisé toutes tes actions IA d'aujourd'hui. Elles repartent de zéro cette nuit : reviens demain." : null, finished: true, possible, noSource });
    }

    let ok = 0, estimated = 0, fails = 0;
    let stopped: string | null = null;
    const skipped: Skip[] = [...blocked];
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
      const kind = skipKind(status);
      skipped.push({ appId: it.app_id, title: label, url: it.url, kind, site: it.site });
      if (kind === "failed" && ++fails >= 3) { stopped = "Plusieurs échecs de suite : je m'arrête, réessaie dans un moment."; break; }
    }
    setBusy(false);
    onBusy?.(false);
    setRun({ total: items.length, done: ok + skipped.length - blocked.length, ok, estimated, current: "", skipped, stopped, finished: true, possible, noSource });
    refreshBadges();
    router.refresh();
  }

  useImperativeHandle(ref, () => ({ start: (only) => { void start(only); } }));

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
            <button type="button" className="btn btn-primary" onClick={() => start()} disabled={busy || locked}><Sparkles size={16} /> Tout analyser ({count})</button>
            <p className="min-w-0 flex-1 basis-60 text-sm text-muted">Une à une, les mieux notées d'abord. Je m'arrête quand les IA gratuites sont à leur limite : tu reprends plus tard d'un clic.</p>
          </div>
          {run?.finished && (
            <div className="mt-3 border-t border-line pt-3 text-sm" role="status" aria-live="polite">
              <p>
                {run.total === 0 ? <strong>Rien à analyser automatiquement.</strong> : <strong>{run.ok} offre{run.ok > 1 ? "s" : ""} analysée{run.ok > 1 ? "s" : ""}</strong>}
                {run.estimated > 0 && <> dont {run.estimated} avec un pourcentage <em>estimé</em> (extrait seulement)</>}.
              </p>
              {run.noSource > 0 && <p className="mt-1 text-muted">{run.noSource} autre{run.noSource > 1 ? "s" : ""} ligne{run.noSource > 1 ? "s n'ont" : " n'a"} ni lien ni texte : ouvre-{run.noSource > 1 ? "les" : "la"} une à une pour coller l'annonce.</p>}
              {run.stopped && <p className="mt-1 text-muted">{run.stopped} Clique à nouveau sur « Tout analyser » plus tard : je reprends là où j'en suis.</p>}
              {run.skipped.length > 0 && (
                <SkipReport skips={run.skipped} onRemoved={(ids) => setRun((r) => r && { ...r, skipped: removeSkips(r.skipped, ids) })} />
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
