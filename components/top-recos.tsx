"use client";
import { useCallback, useState } from "react";
import Link from "next/link";
import { Check, X, ExternalLink } from "lucide-react";
import { ScorePill } from "@/components/ui/score";
import { ReasonChips } from "@/components/reason-chips";
import { useRecoDecision } from "@/components/reco-actions";

export type TopReco = { id: string; title: string | null; company: string | null; location: string | null; source: string | null; url: string | null; score: number; matched: string[]; ai?: boolean };

/** Les meilleures offres à trier, directement sur la page d'accueil. */
export function TopRecos({ recos }: { recos: TopReco[] }) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [rejecting, setRejecting] = useState<string | null>(null);
  const undo = useCallback((id: string) => setHidden((h) => { const n = new Set(h); n.delete(id); return n; }), []);
  const { decide, busy } = useRecoDecision(undo);
  const list = recos.filter((r) => !hidden.has(r.id));

  async function act(r: TopReco, d: "accept" | "reject", reason?: string) {
    const res = await decide(r, d, reason);
    if (res) { setHidden((h) => new Set(h).add(r.id)); setRejecting(null); }
  }

  if (!list.length) return <p className="rounded-2xl border border-dashed border-line px-4 py-5 text-center text-muted">Tout est trié. Bien joué.</p>;
  return (
    <ul className="list">
      {list.map((r) => (
        <li key={r.id} className="px-4 py-3.5">
          <div className="flex items-start gap-3">
            <div className="w-[5.6rem] shrink-0 pt-0.5 text-center"><ScorePill value={r.score} estimate={!r.ai} /></div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold leading-snug">{r.title}</p>
              <p className="truncate text-sm text-muted">{[r.company, r.location, r.source].filter(Boolean).join(", ")}</p>
              {r.matched.length > 0 && <p className="mt-1 truncate text-xs text-good">{r.matched.slice(0, 5).join(", ")}</p>}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {r.url && <a href={r.url} target="_blank" rel="noreferrer" className="btn btn-ghost btn-icon" aria-label="Ouvrir l'annonce" title="Ouvrir l'annonce"><ExternalLink size={17} /></a>}
              <button className="btn btn-icon" disabled={busy === r.id} onClick={() => setRejecting(rejecting === r.id ? null : r.id)} aria-label="Pas pour moi" title="Pas pour moi"><X size={18} /></button>
              <button className="btn btn-primary btn-icon" disabled={busy === r.id} onClick={() => act(r, "accept")} aria-label="Je candidate" title="Je candidate"><Check size={18} /></button>
            </div>
          </div>
          {rejecting === r.id && (
            <div className="mt-3 rise">
              <p className="mb-1.5 text-sm text-muted">Pourquoi pas ?</p>
              <ReasonChips disabled={busy === r.id} onPick={(reason) => act(r, "reject", reason)} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

export function SeeAll({ n }: { n: number }) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <Link href="/recommandees/tri" className="btn btn-sm">Tri rapide ({n})</Link>
      <Link href="/recommandees" className="btn btn-ghost btn-sm">Tout voir</Link>
    </div>
  );
}
