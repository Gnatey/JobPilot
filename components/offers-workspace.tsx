"use client";
import { useMemo, useRef, useState } from "react";
import { SearchCheck, Sparkles, X } from "lucide-react";
import { AnalyzeAll, type AnalyzeHandle } from "@/components/analyze-all";
import { CheckAds, type CheckHandle, type CheckLine } from "@/components/check-ads";
import { OfferDups } from "@/components/offer-dups";
import { OffersList, type Selection } from "@/components/offers-list";
import type { ListItem } from "@/lib/offers-filter";
import { checkedLabel, pruneSelection, setMany, toggleId } from "@/lib/selection";

/**
 * Offres & CV côté navigateur : « Tout analyser », « Vérifier les annonces » et la liste, reliés par la sélection.
 * On coche des lignes « À analyser » dans la liste, et une barre collée en bas propose « Analyser la sélection » (2 actions IA par offre) ou
 * « Vérifier les liens » (sans IA). Seul le choix des lignes change : la file, les arrêts et le bilan sont ceux de « Tout analyser ».
 */
export function OffersWorkspace({ items, lines, offerLines = [] }: { items: ListItem[]; lines: CheckLine[]; offerLines?: CheckLine[] }) {
  const analyze = useRef<AnalyzeHandle>(null);
  const check = useRef<CheckHandle>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState<"analyze" | "check" | null>(null);
  // Une ligne analysée ou supprimée entre-temps quitte la sélection toute seule
  const ids = useMemo(() => pruneSelection(picked, lines.map((l) => l.id)), [picked, lines]);
  const selection: Selection = {
    ids: useMemo(() => new Set(ids), [ids]),
    toggle: (id) => setPicked((s) => toggleId(s, id)),
    setMany: (list, on) => setPicked((s) => setMany(s, list, on)),
  };
  // « Vérifier les annonces » porte sur les lignes « À analyser » ET sur les offres déjà analysées (une annonce peut disparaître après son analyse)
  const checkLines = useMemo(() => [...lines, ...offerLines], [lines, offerLines]);
  const dupItems = useMemo(() => items.map((it) => ({ ...it, company: it.company ?? "" })), [items]);
  const scrollUp = () => window.scrollTo({ top: 0, behavior: "smooth" });

  return (
    <>
      {lines.length > 0 && <AnalyzeAll count={lines.length} ref={analyze} locked={running === "check"} onBusy={(b) => setRunning(b ? "analyze" : null)} />}
      {checkLines.length > 0 && (
        <CheckAds lines={checkLines} ref={check} locked={running === "analyze"} onBusy={(b) => setRunning(b ? "check" : null)} onAnalyze={(ids) => { scrollUp(); analyze.current?.start(ids); }} />
      )}
      <OfferDups items={dupItems} />
      <OffersList items={items} selection={lines.length > 0 ? selection : undefined} />
      {ids.length > 0 && (
        <div
          className="no-print sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface p-3 shadow-lift md:bottom-4"
          role="region" aria-label="Lignes cochées"
        >
          <p className="min-w-0 flex-1 basis-32 text-sm font-semibold">{checkedLabel(ids.length)}</p>
          <button type="button" className="btn btn-primary btn-sm" disabled={running !== null} onClick={() => { scrollUp(); analyze.current?.start(ids); }}>
            <Sparkles size={15} aria-hidden /> Analyser la sélection
          </button>
          <button type="button" className="btn btn-sm" disabled={running !== null} onClick={() => { scrollUp(); check.current?.start(ids); }}>
            <SearchCheck size={15} aria-hidden /> Vérifier les liens
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPicked(new Set())} aria-label="Tout décocher"><X size={15} aria-hidden /> Décocher</button>
        </div>
      )}
    </>
  );
}
