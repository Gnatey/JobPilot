"use client";
import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { Check, X, Undo2, ExternalLink, Sparkles, Zap, Eraser, Search, Loader2, EyeOff, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { ScorePill, isClose } from "./ui/score";
import { Empty } from "./ui/page-title";
import { ReasonChips } from "./reason-chips";
import { bulkDecision, useRecoDecision } from "./reco-actions";
import { useFeedback } from "./ui/feedback";
import { refreshBadges } from "./nav";
import { rejectLabel, rejectLabelInline } from "@/lib/types";
import { PRE_FILTERS } from "@/lib/quick-score";
import { fmtDate } from "@/lib/format";
import { FIT_LABELS, isFitReason } from "@/lib/fit";

export type Reco = {
  id: string; title: string | null; company: string | null; location: string | null; url: string | null;
  source: string | null; origin: string | null; status: string; reject_reason: string | null;
  received_at: string | null; offer_id: string | null; score: number; ai: boolean; matched: string[];
  senior: boolean; years: number | null; penalties: string[]; read?: boolean; excerpt?: string;
};

const TABS = [
  { id: "todo", label: "À trier", match: (s: string) => s === "new" || s === "analyzed" },
  { id: "accepted", label: "Acceptées", match: (s: string) => s === "accepted" },
  { id: "rejected", label: "Écartées", match: (s: string) => s === "rejected" },
  { id: "hidden", label: "Masquées", match: (s: string) => s === "filtered" },
] as const;

export function RecoList({ recos, rules, decided, reasons }: { recos: Reco[]; rules: string[]; decided: number; reasons: Record<string, number> }) {
  const { toast, confirm } = useFeedback();
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("todo");
  const [fitOnly, setFitOnly] = useState(true);
  const [minScore, setMinScore] = useState(0);
  const [source, setSource] = useState("");
  const [q, setQ] = useState("");
  const [items, setItems] = useState(recos);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [diag, setDiag] = useState<string | null>(null);
  const router = useRouter();

  const patch = useCallback((id: string, p: Partial<Reco>) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...p } : x))), []);
  const undo = useCallback((id: string) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, status: x.offer_id ? "analyzed" : "new", reject_reason: null } : x))), []);
  const { decide, busy } = useRecoDecision(undo);

  const sources = useMemo(() => [...new Set(recos.map((r) => r.source).filter(Boolean))] as string[], [recos]);
  const t = TABS.find((x) => x.id === tab)!;
  const inTab = items.filter((r) => t.match(r.status));
  const matchesText = (r: Reco) => !q || `${r.title} ${r.company} ${r.location}`.toLowerCase().includes(q.toLowerCase());
  const base = inTab.filter((r) => (!source || r.source === source) && matchesText(r) && (tab !== "todo" || !fitOnly || !r.senior));
  const list = base
    .filter((r) => tab !== "todo" || r.score >= minScore)
    .sort((a, b) => (tab === "todo" ? b.score - a.score : (b.received_at ?? "").localeCompare(a.received_at ?? "")));
  const hiddenSenior = inTab.filter((r) => r.senior).length;
  const belowMin = tab === "todo" && minScore > 0 ? base.filter((r) => r.score < minScore) : [];
  const todoCount = items.filter((r) => TABS[0].match(r.status)).length;

  async function act(r: Reco, d: "accept" | "reject" | "restore", reason?: string) {
    const res = await decide(r, d, reason);
    if (!res) return;
    setRejecting(null);
    patch(r.id, { status: d === "accept" ? "accepted" : d === "reject" ? "rejected" : r.offer_id ? "analyzed" : "new", reject_reason: reason ?? null, offer_id: res.offer_id ?? r.offer_id });
  }

  /** « Garder » une offre masquée : elle revient dans À trier et le filtre ne la masque plus. */
  async function keep(r: Reco) {
    const res = await bulkDecision([r.id], "keep");
    if (!res.ok) return toast(res.error, { tone: "err" });
    patch(r.id, { status: "new", reject_reason: "garde" });
    refreshBadges();
    toast("Remise dans ta liste à trier.", { tone: "info" });
  }

  /** Lance la vraie analyse (IA) de l'offre, puis ouvre le diagnostic. Sans texte d'annonce, on propose de le coller. */
  async function diagnose(r: Reco) {
    setDiag(r.id);
    try {
      const res = await fetch(`/api/recommendations/${r.id}/diagnostic`, { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.offer_id) { router.push(`/offres/${j.offer_id}`); return; }
      if (res.status === 410) { // annonce retirée : le serveur l'a déjà rangée dans les Écartées
        patch(r.id, { status: "rejected", reject_reason: "expiree" });
        refreshBadges();
        toast(j.error ?? "Cette offre n'est plus disponible.", { tone: "info", ms: 8000 });
        setDiag(null);
        return;
      }
      if (res.status === 422) { toast(j.error ?? "Il me faut le texte de l'annonce.", { tone: "info", ms: 7000 }); router.push(`/offres/nouvelle?reco=${r.id}&needtext=1`); return; }
      toast(j.error ?? "L'analyse a échoué, réessaie.", { tone: "err" });
    } catch {
      toast("Connexion interrompue, réessaie.", { tone: "err" });
    }
    setDiag(null);
  }

  async function clearBelow() {
    const ids = belowMin.map((r) => r.id);
    const ok = await confirm({ title: `Écarter ${ids.length} offre${ids.length > 1 ? "s" : ""} ${minScore >= 70 ? "hors bonnes pistes" : "peu probable" + (ids.length > 1 ? "s" : "")} ?`, body: "Elles passent dans les Écartées avec la raison « score trop bas ». Tu peux annuler juste après.", confirmLabel: "Écarter", danger: true });
    if (!ok) return;
    const r = await bulkDecision(ids, "reject");
    if (!r.ok) return toast(r.error, { tone: "err" });
    setItems((xs) => xs.map((x) => (ids.includes(x.id) ? { ...x, status: "rejected", reject_reason: "score_bas" } : x)));
    refreshBadges();
    toast(`${ids.length} offre${ids.length > 1 ? "s" : ""} écartée${ids.length > 1 ? "s" : ""}`, {
      action: { label: "Annuler", run: async () => { await bulkDecision(ids, "restore"); setItems((xs) => xs.map((x) => (ids.includes(x.id) ? { ...x, status: x.offer_id ? "analyzed" : "new", reject_reason: null } : x))); refreshBadges(); } },
    });
  }

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-full border border-line bg-surface p-1" role="tablist">
          {TABS.map((x) => {
            const n = items.filter((r) => x.match(r.status)).length;
            return (
              <button key={x.id} role="tab" aria-selected={tab === x.id} onClick={() => setTab(x.id)}
                className={`rounded-full px-4 py-1.5 text-sm transition-colors ${tab === x.id ? "bg-ink font-semibold text-paper" : "text-muted hover:text-ink"}`}>
                {x.label} <span className={tab === x.id ? "opacity-70" : ""}>{n}</span>
              </button>
            );
          })}
        </div>
        {todoCount > 0 && <Link href="/recommandees/tri" className="btn btn-primary btn-sm ml-auto"><Zap size={16} /> Tri rapide</Link>}
      </div>

      {tab === "todo" && (
        <div className="mb-5 grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-center">
          <label className="relative block">
            <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
            <input className="field !pl-10" placeholder="Filtrer par poste, entreprise, ville…" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <select className="field sm:w-48" aria-label="Source" value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">Toutes les sources</option>
            {sources.map((s) => <option key={s}>{s}</option>)}
          </select>
          <select className="field sm:w-52" aria-label="Niveau minimum" value={minScore} onChange={(e) => setMinScore(Number(e.target.value))}>
            {PRE_FILTERS.map((f) => <option key={f.min} value={f.min}>{f.label}</option>)}
          </select>
          <label className="flex items-start gap-2 text-sm sm:col-span-3">
            <input type="checkbox" checked={fitOnly} onChange={(e) => setFitOnly(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-marigold)]" />
            <span>
              Adaptées à mon expérience
              {fitOnly && hiddenSenior > 0 && <span className="text-muted"> : {hiddenSenior} offre{hiddenSenior > 1 ? "s" : ""} trop senior{hiddenSenior > 1 ? "s" : ""} masquée{hiddenSenior > 1 ? "s" : ""}</span>}
            </span>
          </label>
          {belowMin.length > 0 && (
            <div className="sm:col-span-3">
              <button className="btn btn-sm" onClick={clearBelow}><Eraser size={15} /> Écarter les {belowMin.length} offres {minScore >= 70 ? "qui ne sont pas des bonnes pistes" : "peu probables"}</button>
            </div>
          )}
        </div>
      )}

      {tab === "hidden" && (
        <p className="mb-4 flex max-w-[70ch] items-start gap-2 text-sm text-muted">
          <EyeOff size={16} className="mt-0.5 shrink-0" />
          <span>Ces offres ne correspondent pas à ce que tu as demandé : stages et alternances si tu n'as pas coché ces contrats, métiers éloignés de tes postes visés. Rien n'est supprimé : « Garder dans ma liste » les remet à trier.</span>
        </p>
      )}
      {!list.length ? (
        <Empty icon={<Sparkles />}>
          {tab === "todo"
            ? q || source || minScore ? "Aucune offre ne correspond à ces filtres." : <>Rien à trier. <Link href="/parametres#gmail" className="link font-semibold text-ink">Connecte Gmail</Link> pour lire tes alertes emploi, ou <Link href="/recherche" className="link font-semibold text-ink">sauvegarde une recherche</Link> : elle tournera chaque matin.</>
            : tab === "accepted" ? "Aucune offre acceptée pour l'instant." : tab === "hidden" ? "Aucune offre masquée : tout ce qui arrive correspond à ce que tu as demandé." : "Aucune offre écartée."}
        </Empty>
      ) : (
        <ul className="list 2xl:grid 2xl:grid-cols-2 2xl:gap-3 2xl:!border-0 2xl:!bg-transparent 2xl:!overflow-visible">
          {list.map((r) => (
            <li key={r.id} className="px-4 py-4 2xl:rounded-2xl 2xl:border 2xl:border-line 2xl:bg-surface">
              <div className="flex items-start gap-3.5">
                {(r.ai || isClose(r.score)) && (
                  <div className="w-[5.6rem] shrink-0 pt-0.5 text-center">
                    <ScorePill value={r.score} estimate={!r.ai} />
                    <p className="mt-0.5 text-[0.65rem] text-muted">{r.ai ? "analyse complète" : r.read ? "pré-tri, annonce lue" : "pré-tri, titre seul"}</p>
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold leading-snug">{r.title}</p>
                  <p className="text-sm text-muted">{[r.company, r.location].filter(Boolean).join(", ")}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {r.source}{r.origin === "email" ? " (alerte email)" : ""}, {fmtDate(r.received_at)}
                    {r.years != null ? `, ${r.years === 0 ? "débutant accepté" : `${r.years} an${r.years > 1 ? "s" : ""} demandé${r.years > 1 ? "s" : ""}`}` : ""}
                  </p>
                  {r.matched.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {r.matched.map((m) => <span key={m} className="tag tag-good">{m}</span>)}
                    </div>
                  )}
                  {r.penalties.length > 0 && tab === "todo" && <p className="mt-1.5 text-xs text-bad">{r.penalties.join(" ; ")}</p>}
                  {r.status === "rejected" && <p className="mt-1.5 text-sm">Raison : {rejectLabel(r.reject_reason)}</p>}
                  {r.status === "filtered" && <p className="mt-1.5 text-sm text-muted">Masquée : {isFitReason(r.reject_reason) ? FIT_LABELS[r.reject_reason] : "ne correspond pas à ton profil"}</p>}
                </div>
              </div>

              <div className={`mt-3 flex flex-wrap gap-2 ${r.ai || isClose(r.score) ? "md:pl-[6.5rem]" : ""}`}>
                {tab === "todo" && (
                  <>
                    <button className="btn btn-sm border-ink" disabled={busy === r.id} onClick={() => act(r, "accept")}><Check size={16} className="text-good" /> Je candidate</button>
                    <button className="btn btn-sm" onClick={() => setRejecting(rejecting === r.id ? null : r.id)}><X size={16} /> Pas pour moi</button>
                    {r.offer_id
                      ? <Link href={`/offres/${r.offer_id}`} className="btn btn-sm btn-ghost"><Sparkles size={16} /> Voir l'analyse</Link>
                      : <button className="btn btn-sm btn-ghost" disabled={diag === r.id} onClick={() => diagnose(r)}>
                          {diag === r.id ? <><Loader2 size={16} className="animate-spin" /> Analyse en cours…</> : <><Sparkles size={16} /> Voir le diagnostic</>}
                        </button>}
                  </>
                )}
                {tab === "accepted" && (r.offer_id
                  ? <Link href={`/offres/${r.offer_id}`} className="btn btn-sm">Ouvrir l'offre et le CV</Link>
                  : <Link href={`/offres/nouvelle?reco=${r.id}&then=cv${r.url ? `&url=${encodeURIComponent(r.url)}&auto=1` : "&needtext=1"}`} className="btn btn-sm btn-primary">Faire le CV</Link>)}
                {tab === "hidden" && <button className="btn btn-sm" onClick={() => keep(r)}><RotateCcw size={16} /> Garder dans ma liste</button>}
                {(tab === "accepted" || tab === "rejected") && <button className="btn btn-sm btn-ghost" onClick={() => act(r, "restore")}><Undo2 size={16} /> Remettre à trier</button>}
                {r.url && <a href={r.url} target="_blank" rel="noreferrer" className="btn btn-sm btn-ghost"><ExternalLink size={16} /> Annonce</a>}
              </div>

              {rejecting === r.id && (
                <div className={`rise mt-3 ${r.ai || isClose(r.score) ? "md:pl-[6.5rem]" : ""}`}>
                  <p className="mb-1.5 text-sm text-muted">Pourquoi ? L'app s'en sert pour mieux trier les prochaines.</p>
                  <ReasonChips disabled={busy === r.id} onPick={(reason) => act(r, "reject", reason)} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <details className="mt-8 rounded-2xl border border-line p-4">
        <summary className="cursor-pointer font-semibold">Ce que l'app a appris de tes choix ({decided} offre{decided > 1 ? "s" : ""} triée{decided > 1 ? "s" : ""})</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">{rules.map((r) => <li key={r}>{r}</li>)}</ul>
        {Object.keys(reasons).length > 0 && (
          <p className="mt-3 text-sm">
            Raisons d'écart : {Object.entries(reasons).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${rejectLabelInline(k)} (${n})`).join(", ")}.
          </p>
        )}
        {decided < 10 && <p className="mt-2 text-sm text-muted">Les règles se précisent à partir d'une dizaine d'offres triées.</p>}
      </details>
    </>
  );
}
