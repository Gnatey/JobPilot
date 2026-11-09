"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, CornerUpRight, ExternalLink, Loader2, PartyPopper, X } from "lucide-react";
import { Gauge, ScorePill, isClose } from "./ui/score";
import { useRecoDecision } from "./reco-actions";
import { useFeedback } from "./ui/feedback";
import { OTHER_REASON, REJECT_REASONS } from "@/lib/types";
import { OtherNote } from "@/components/reason-chips";
import { recoWhen, whenLabel } from "@/lib/posted";
import type { Reco } from "./reco-list";

type Leaving = "left" | "right" | "skip" | null;

/** `day` : tri de la liste du jour (page Recherche › Préparer ma journée). `accepted` : offres de la liste déjà retenues avant cette visite. */
export type DayInfo = { total: number; accepted: number; quota: number };

/** Une offre à la fois. → je candidate, ← pas pour moi, ↓ plus tard. Au doigt : glisser la carte. */
export function TriageDeck({ initial, day }: { initial: Reco[]; day?: DayInfo }) {
  const { toast } = useFeedback();
  const [queue, setQueue] = useState(initial);
  const [handled, setHandled] = useState(0);
  const [yes, setYes] = useState(0);
  const [moreBusy, setMoreBusy] = useState(false);
  const [reasonFor, setReasonFor] = useState<Reco | null>(null);
  const [other, setOther] = useState(false); // « Autre » : on demande le pourquoi libre (facultatif)
  const [leaving, setLeaving] = useState<Leaving>(null);
  const [drag, setDrag] = useState<{ x: number; start: number; active: boolean }>({ x: 0, start: 0, active: false });
  const byId = useMemo(() => new Map(initial.map((r) => [r.id, r])), [initial]);

  const undo = useCallback((id: string) => {
    const r = byId.get(id);
    if (r) { setQueue((q) => [r, ...q.filter((x) => x.id !== id)]); setHandled((h) => Math.max(0, h - 1)); }
  }, [byId]);
  const { decide } = useRecoDecision(undo, { toSuivi: true }); // un « non » range l'offre dans Suivi › Abandonné

  const cur = queue[0];
  const next = queue[1];
  const total = initial.length;

  const advance = useCallback((kind: Exclude<Leaving, null>, after: () => void) => {
    setLeaving(kind);
    setTimeout(() => { after(); setLeaving(null); setDrag({ x: 0, start: 0, active: false }); }, 190);
  }, []);

  const accept = useCallback(() => {
    if (!cur || leaving) return;
    const r = cur;
    advance("right", () => { setQueue((q) => q.filter((x) => x.id !== r.id)); setHandled((h) => h + 1); setYes((n) => n + 1); });
    decide(r, "accept").then((res) => { if (!res) { setQueue((q) => [r, ...q]); setHandled((h) => Math.max(0, h - 1)); setYes((n) => Math.max(0, n - 1)); } });
  }, [cur, leaving, advance, decide]);

  const pickReason = useCallback((reason: string) => {
    if (!reasonFor) return;
    const r = reasonFor;
    setReasonFor(null);
    setOther(false);
    advance("left", () => { setQueue((q) => q.filter((x) => x.id !== r.id)); setHandled((h) => h + 1); });
    decide(r, "reject", reason).then((res) => { if (!res) setQueue((q) => [r, ...q]); });
  }, [reasonFor, advance, decide]);

  const chooseReason = useCallback((id: string) => (id === OTHER_REASON ? setOther(true) : pickReason(id)), [pickReason]);

  /** « Voir d'autres offres du même type » : un nouveau lot pour les mêmes critères, puis on recharge le tri. */
  async function more() {
    setMoreBusy(true);
    const r = await fetch("/api/day", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ more: true }) })
      .then((x) => x.json()).catch(() => ({ error: "Connexion interrompue, réessaie." }));
    if (r.error) { setMoreBusy(false); return toast(r.error, { tone: "err" }); }
    if (!r.added) { setMoreBusy(false); return toast(r.message ?? "Pas d'autres offres pour ces critères pour l'instant.", { tone: "info", ms: 9000 }); }
    window.location.assign("/recommandees/tri?jour=1");
  }

  const skip = useCallback(() => {
    if (!cur || leaving || queue.length < 2) return;
    advance("skip", () => setQueue((q) => [...q.slice(1), q[0]]));
  }, [cur, leaving, queue.length, advance]);

  // Clavier
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, select") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (reasonFor) {
        if (e.key === "Escape") { setReasonFor(null); setOther(false); }
        // 1 à 9 pour les neuf premiers motifs, 0 pour le dixième
        if (/^[0-9]$/.test(e.key)) {
          const r = REJECT_REASONS[e.key === "0" ? 9 : Number(e.key) - 1];
          if (r) { e.preventDefault(); chooseReason(r.id); }
        }
        return;
      }
      if (e.key === "ArrowRight" || e.key.toLowerCase() === "a") { e.preventDefault(); accept(); }
      else if (e.key === "ArrowLeft" || e.key.toLowerCase() === "x") { e.preventDefault(); if (cur) setReasonFor(cur); }
      else if (e.key === "ArrowDown" || e.key.toLowerCase() === "s" || e.key === " ") { e.preventDefault(); skip(); }
      else if (e.key.toLowerCase() === "o" && cur?.url) window.open(cur.url, "_blank", "noopener");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reasonFor, cur, accept, skip, chooseReason]);

  const pointer = {
    onPointerDown: (e: React.PointerEvent) => { if (reasonFor || leaving || (e.target as HTMLElement).closest("a,button")) return; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); setDrag({ x: 0, start: e.clientX, active: true }); },
    onPointerMove: (e: React.PointerEvent) => { if (drag.active) setDrag((d) => ({ ...d, x: e.clientX - d.start })); },
    onPointerUp: () => {
      if (!drag.active) return;
      const x = drag.x;
      setDrag({ x: 0, start: 0, active: false });
      if (x > 110) accept();
      else if (x < -110 && cur) setReasonFor(cur);
    },
    onPointerCancel: () => setDrag({ x: 0, start: 0, active: false }),
  };

  const x = leaving === "right" ? 420 : leaving === "left" ? -420 : drag.x;
  const style: React.CSSProperties = {
    transform: leaving === "skip" ? "translateY(40px) scale(.96)" : `translateX(${x}px) rotate(${x / 28}deg)`,
    opacity: leaving ? 0 : 1,
    transition: drag.active ? "none" : "transform .19s ease-out, opacity .19s ease-out",
    touchAction: "pan-y",
  };

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-5 flex items-center gap-3">
        <Link href={day ? "/recherche" : "/recommandees"} className="btn btn-ghost btn-sm -ml-3"><ArrowLeft size={16} /> {day ? "Recherche" : "Recommandées"}</Link>
        {total > 0 && <p className="ml-auto text-sm text-muted tabular-nums">{queue.length > 0 ? `${day ? "Ma journée, " : ""}${queue.length} restante${queue.length > 1 ? "s" : ""}` : "Terminé"}</p>}
      </div>
      {total > 0 && <div className="mb-6 h-1.5 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-marigold transition-[width] duration-300" style={{ width: `${(handled / total) * 100}%` }} /></div>}

      {!cur ? (
        <div className="rounded-3xl border border-dashed border-line px-6 py-14 text-center">
          <PartyPopper className="pop mx-auto text-marigold-deep" size={40} />
          <h1 className="display mt-4 text-3xl">{day ? "Ta liste du jour est triée." : total ? "Tout est trié." : "Rien à trier."}</h1>
          <p className="mt-2 text-muted">
            {day
              ? `${day.accepted + yes} offre${day.accepted + yes > 1 ? "s" : ""} retenue${day.accepted + yes > 1 ? "s" : ""} sur ${day.quota} visée${day.quota > 1 ? "s" : ""} aujourd'hui. Elles t'attendent dans Offres & CV et dans le suivi.`
              : total ? `${handled} offre${handled > 1 ? "s" : ""} traitée${handled > 1 ? "s" : ""}. Celles que tu as retenues t'attendent dans le suivi.` : "Les nouvelles offres arrivent avec ta synchronisation du matin."}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {day && <button className="btn btn-primary" onClick={more} disabled={moreBusy}>{moreBusy ? <><Loader2 size={16} className="animate-spin" /> Recherche…</> : "Voir d'autres offres du même type"}</button>}
            {day ? <Link href="/offres" className="btn">Ouvrir Offres & CV</Link> : <Link href="/" className="btn btn-primary">Retour à l'accueil</Link>}
            <Link href="/suivi" className="btn">Voir le suivi</Link>
          </div>
        </div>
      ) : (
        <>
          <div className="relative">
            {next && (
              <div className="absolute inset-x-3 top-3 -z-0 h-full rounded-3xl border border-line bg-surface opacity-70" aria-hidden>
                <p className="truncate px-6 pt-5 text-sm text-muted">{next.title}</p>
              </div>
            )}
            <article {...pointer} style={style} aria-live="polite"
              className="relative cursor-grab select-none rounded-3xl border border-line bg-surface p-6 shadow-lift active:cursor-grabbing md:p-7">
              <span className="pointer-events-none absolute right-5 top-5 rotate-6 rounded-xl border-2 border-good px-3 py-1 font-display text-lg font-bold text-good" style={{ opacity: Math.max(0, Math.min(1, drag.x / 110)) }}>Je candidate</span>
              <span className="pointer-events-none absolute left-5 top-5 -rotate-6 rounded-xl border-2 border-bad px-3 py-1 font-display text-lg font-bold text-bad" style={{ opacity: Math.max(0, Math.min(1, -drag.x / 110)) }}>Pas pour moi</span>

              <div className="flex items-start gap-4">
                {cur.ai
                  ? <Gauge value={cur.score} size={92} label="analysé" />
                  : isClose(cur.score) && <div className="grid w-[92px] shrink-0 place-items-center pt-2 text-center"><ScorePill value={cur.score} estimate /><span className="mt-1.5 text-[0.7rem] leading-tight text-muted">pré-tri, avant analyse</span></div>}
                <div className="min-w-0 flex-1 pt-1">
                  <h1 className="heading text-[1.35rem] leading-tight">{cur.title}</h1>
                  <p className="mt-1 text-muted">{[cur.company, cur.location].filter(Boolean).join(", ")}</p>
                  <p className="mt-0.5 text-sm text-muted">{[cur.source, whenLabel(recoWhen(cur))].filter(Boolean).join(", ")}{cur.years != null ? `, ${cur.years === 0 ? "débutant accepté" : `${cur.years} an${cur.years > 1 ? "s" : ""} demandé${cur.years > 1 ? "s" : ""}`}` : ""}</p>
                </div>
              </div>

              {cur.matched.length > 0 && <div className="mt-4 flex flex-wrap gap-1.5">{cur.matched.map((m) => <span key={m} className="tag tag-good">{m}</span>)}</div>}
              {cur.penalties.length > 0 && <p className="mt-3 text-sm text-bad">{cur.penalties.join(" ; ")}</p>}
              {cur.excerpt && <p className="mt-4 line-clamp-5 text-[0.95rem] leading-relaxed text-ink/80">{cur.excerpt}</p>}
              {cur.url && <a href={cur.url} target="_blank" rel="noreferrer" className="link mt-4 inline-flex items-center gap-1.5 text-sm font-semibold"><ExternalLink size={15} /> Lire l'annonce</a>}
            </article>
          </div>

          {reasonFor ? (
            <div className="rise mt-6">
              <p className="mb-2 text-sm font-semibold">Pourquoi pas ? <span className="font-normal text-muted">Un clic, ou le chiffre au clavier. L'app s'en sert pour mieux trier.</span></p>
              <div className="flex flex-wrap gap-2">
                {REJECT_REASONS.map((r, i) => (
                  <button key={r.id} className="chip !px-3.5 !py-2" aria-pressed={r.id === OTHER_REASON ? other : undefined} onClick={() => chooseReason(r.id)}><span className="kbd">{(i + 1) % 10}</span>{r.label}</button>
                ))}
              </div>
              {other && <OtherNote onDone={pickReason} onCancel={() => setOther(false)} />}
              <button className="btn btn-ghost btn-sm mt-3" onClick={() => { setReasonFor(null); setOther(false); }}>Annuler</button>
            </div>
          ) : (
            <div className="mt-7 flex items-center justify-center gap-5">
              <button onClick={() => setReasonFor(cur)} className="grid h-16 w-16 place-items-center rounded-full border border-line bg-surface text-bad shadow-lift transition-transform hover:scale-105 active:scale-95" aria-label="Pas pour moi" title="Pas pour moi (←)"><X size={28} /></button>
              <button onClick={skip} disabled={queue.length < 2} className="grid h-12 w-12 place-items-center rounded-full border border-line bg-surface text-muted transition-transform hover:scale-105 active:scale-95 disabled:opacity-40" aria-label="Plus tard" title="Plus tard (↓)"><CornerUpRight size={20} /></button>
              <button onClick={accept} className="grid h-16 w-16 place-items-center rounded-full bg-marigold text-chrome shadow-lift transition-transform hover:scale-105 active:scale-95" aria-label="Je candidate" title="Je candidate (→)"><Check size={30} strokeWidth={2.6} /></button>
            </div>
          )}
          <p className="mt-6 hidden text-center text-sm text-muted md:block">
            <span className="kbd">←</span> pas pour moi <span className="mx-2" /> <span className="kbd">↓</span> plus tard <span className="mx-2" /> <span className="kbd">→</span> je candidate <span className="mx-2" /> <span className="kbd">O</span> ouvrir l'annonce
          </p>
          <p className="mt-6 text-center text-sm text-muted md:hidden">Glisse la carte : à droite je candidate, à gauche pas pour moi.</p>
        </>
      )}
    </div>
  );
}
