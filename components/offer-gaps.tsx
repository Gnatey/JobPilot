"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, X } from "lucide-react";
import { useFeedback } from "@/components/ui/feedback";
import type { AnswerOp } from "@/lib/profile-fix";

type Preview = { where: string; before: string; after: string };
type Draft = { answer: string; busy: boolean; ops: AnswerOp[] | null; preview: Preview[]; reply: string; empty: boolean };
const BLANK: Draft = { answer: "", busy: false, ops: null, preview: [], reply: "", empty: false };

/**
 * « Écarts avec l'offre » : ce que l'annonce demande et que ton profil ne dit pas. Pour chacun :
 * - « Je l'ai fait » : tu écris une phrase, l'IA propose la ligne de ton profil (avant / après), tu valides ; elle sera dans tes prochains CV ;
 * - « Pas fait » : noté sur l'offre, le CV et la lettre ne le revendiquent pas.
 * Rien n'est écrit sans ta validation, et l'IA n'écrit que ce que contient ta réponse.
 */
export function OfferGaps({ offerId, gaps }: { offerId: string; gaps: { term: string }[] }) {
  const { toast } = useFeedback();
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(BLANK);
  const [busyNo, setBusyNo] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  const url = `/api/offers/${offerId}/gaps`;
  const call = async (payload: Record<string, unknown>) => {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const j = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: string };
    if (!res.ok || j.error) throw new Error(j.error ?? "Je n'ai pas pu faire ça, réessaie.");
    return j;
  };
  const reset = () => { setOpen(null); setDraft(BLANK); };

  async function send(term: string) {
    const answer = draft.answer.trim();
    if (answer.length < 2) return;
    setDraft((d) => ({ ...d, busy: true, ops: null, preview: [], reply: "", empty: false }));
    try {
      const j = await call({ action: "answer", term, answer });
      const ops = Array.isArray(j.ops) ? (j.ops as AnswerOp[]) : [];
      const preview = Array.isArray(j.preview) ? (j.preview as Preview[]) : [];
      const reply = typeof j.reply === "string" ? j.reply : "";
      setDraft((d) => ({ ...d, busy: false, ops, preview, reply, empty: !ops.length && !reply }));
    } catch (e) {
      setDraft((d) => ({ ...d, busy: false }));
      toast(e instanceof Error ? e.message : "Connexion interrompue, réessaie.", { tone: "err" });
    }
  }

  async function apply(term: string) {
    if (!draft.ops?.length || applying) return;
    setApplying(true);
    try {
      await call({ action: "apply", term, answer: draft.answer.trim(), ops: draft.ops });
      toast("Ajouté à ton profil. Génère un nouveau CV (« Autre version ») pour qu'il l'utilise.", { tone: "ok" });
      reset();
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Connexion interrompue, réessaie.", { tone: "err" });
    } finally {
      setApplying(false);
    }
  }

  async function notDone(term: string) {
    setBusyNo(term);
    try {
      await call({ action: "no", term });
      toast("Noté : le CV et la lettre ne le revendiqueront pas pour cette offre.", { tone: "ok" });
      if (open === term) reset();
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Connexion interrompue, réessaie.", { tone: "err" });
    } finally {
      setBusyNo(null);
    }
  }

  if (!gaps.length) return null;

  return (
    <ul className="space-y-3">
      {gaps.map(({ term }) => {
        const isOpen = open === term;
        const id = `gap-${term.replace(/[^a-z0-9]+/gi, "-").slice(0, 40)}`;
        return (
          <li key={term} className="text-sm">
            <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
              <span className="min-w-0 flex-1 font-semibold">{term}</span>
              <span className="flex shrink-0 gap-3">
                <button className="hit text-ink underline" aria-expanded={isOpen} aria-controls={id} onClick={() => (isOpen ? reset() : (setOpen(term), setDraft(BLANK)))}>{isOpen ? "Fermer" : "Je l'ai fait"}</button>
                <button className="hit text-muted underline" disabled={busyNo === term} onClick={() => notDone(term)}>{busyNo === term ? "…" : "Pas fait"}</button>
              </span>
            </div>

            {isOpen && (
              <div id={id} className="mt-2 rounded-xl border border-line bg-surface p-3">
                <label className="label" htmlFor={`${id}-answer`}>Où, pour qui, avec quels outils ?</label>
                <textarea id={`${id}-answer`} rows={2} className="field mt-1" placeholder="En une ou deux phrases, avec les chiffres que tu connais" value={draft.answer}
                  onChange={(e) => setDraft((d) => ({ ...d, answer: e.target.value, ops: null, preview: [], reply: "", empty: false }))} />
                <div className="mt-2 flex justify-end">
                  <button className="btn btn-sm btn-primary" disabled={draft.busy || draft.answer.trim().length < 2} onClick={() => send(term)}>
                    {draft.busy ? <><Loader2 size={15} className="animate-spin" /> Je lis ta réponse…</> : "Envoyer ma réponse"}
                  </button>
                </div>

                {draft.reply && (
                  <div className="mt-3 rounded-lg border border-line p-3" role="status">
                    <p className="text-xs font-semibold text-muted">Ma réponse</p>
                    <p className="mt-0.5">{draft.reply}</p>
                  </div>
                )}
                {draft.empty && <p className="mt-2 text-muted" role="status">Je n'ai pas trouvé de quoi écrire une ligne sans l'inventer. Dis ce que tu as livré, pour qui et avec quels outils, ou clique sur « Pas fait ».</p>}

                {draft.preview.length > 0 && (
                  <div className="mt-3 space-y-3" role="status">
                    {draft.preview.map((p, i) => (
                      <div key={i}>
                        <p className="text-xs font-semibold text-muted">{p.where}</p>
                        {p.before && <p className="mt-0.5 text-muted line-through">{p.before}</p>}
                        <p className="mt-0.5 font-medium">{p.after}</p>
                      </div>
                    ))}
                    <div className="flex gap-2">
                      <button className="btn btn-sm btn-primary" disabled={applying} onClick={() => apply(term)}><Check size={15} /> Ajouter à mon profil</button>
                      <button className="btn btn-sm btn-ghost" onClick={() => setDraft((d) => ({ ...d, ops: null, preview: [] }))}><X size={15} /> Refuser</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
