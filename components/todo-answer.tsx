"use client";
import { useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { useFeedback } from "@/components/ui/feedback";
import { applyOps, normText, previewOps, vetOps, type AnswerOp } from "@/lib/profile-fix";
import type { Profile } from "@/lib/types";

type Props = {
  getProfile: () => Profile;
  onChange: (next: Profile) => void;
};

/** Questions dont la réponse est un nombre : on propose des tranches à un clic. */
const COUNT_Q = /combien|volume|nombre|taux|pourcentage|chiffre|%|fréquence|utilisateurs|dashboards?/i;
const RANGES = ["moins de 100", "entre 100 et 1 000", "plus de 1 000"];

type Draft = { answer: string; busy: boolean; ops: AnswerOp[] | null; empty: boolean };

/**
 * « À compléter pour des CV plus forts » : chaque ligne se traite en répondant (l'IA réécrit la réalisation concernée, tu vois
 * l'avant / après avant d'accepter), ou en cliquant sur Fait. L'IA n'écrit que ce que contient ta réponse.
 */
export function TodoAnswer({ getProfile, onChange }: Props) {
  const { toast } = useFeedback();
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({ answer: "", busy: false, ops: null, empty: false });
  const profile = getProfile();

  const removeTodo = (t: string, base: Profile = getProfile()) => ({ ...base, todo: base.todo.filter((x) => normText(x) !== normText(t)) });
  const reset = () => { setOpen(null); setDraft({ answer: "", busy: false, ops: null, empty: false }); };

  async function send(t: string) {
    const answer = draft.answer.trim();
    if (answer.length < 2) return;
    setDraft((d) => ({ ...d, busy: true, ops: null, empty: false }));
    try {
      const res = await fetch("/api/profile/answer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: t, answer }) });
      const j = (await res.json().catch(() => ({}))) as { ops?: AnswerOp[]; error?: string };
      if (!res.ok || j.error) { setDraft((d) => ({ ...d, busy: false })); return toast(j.error ?? "L'IA n'a pas pu répondre, réessaie.", { tone: "err" }); }
      // On revérifie sur le profil affiché (il a pu bouger depuis l'envoi)
      const ops = vetOps(getProfile(), j.ops ?? [], answer);
      setDraft((d) => ({ ...d, busy: false, ops, empty: ops.length === 0 }));
    } catch {
      setDraft((d) => ({ ...d, busy: false }));
      toast("Connexion interrompue, réessaie.", { tone: "err" });
    }
  }

  function accept(t: string) {
    const cur = getProfile();
    const ops = vetOps(cur, draft.ops ?? [], draft.answer);
    if (!ops.length) return toast("Ce changement ne s'applique plus : ton profil a bougé entre-temps.", { tone: "err" });
    onChange(removeTodo(t, applyOps(cur, ops)));
    toast("Ton profil est mis à jour. Il sera utilisé dans tes prochains CV.", { tone: "ok" });
    reset();
  }

  if (!profile.todo.length) return null;

  return (
    <div className="mb-8 rounded-2xl border border-marigold/50 bg-marigold/10 p-4">
      <p className="font-semibold">À compléter pour des CV plus forts</p>
      <p className="mt-0.5 text-xs text-muted">Réponds en une phrase : l'IA réécrit la bonne ligne de ton profil, tu valides l'avant / après.</p>
      <ul className="mt-2 space-y-3">
        {profile.todo.map((t) => {
          const isOpen = open === t;
          const preview = isOpen && draft.ops ? previewOps(profile, draft.ops) : [];
          return (
            <li key={t} className="text-sm">
              <div className="flex items-start justify-between gap-3">
                <span>{t}</span>
                <span className="flex shrink-0 gap-3">
                  <button className="text-ink underline" onClick={() => (isOpen ? reset() : (setOpen(t), setDraft({ answer: "", busy: false, ops: null, empty: false })))}>{isOpen ? "Fermer" : "Répondre"}</button>
                  <button className="text-muted underline" onClick={() => { onChange(removeTodo(t)); if (isOpen) reset(); }}>Fait</button>
                </span>
              </div>

              {isOpen && (
                <div className="mt-2 rounded-xl border border-line bg-white/60 p-3 dark:bg-black/10">
                  <label className="label" htmlFor="todo-answer">Ta réponse</label>
                  <textarea id="todo-answer" rows={2} className="field mt-1" placeholder="En une ou deux phrases, avec les chiffres que tu connais" value={draft.answer} onChange={(e) => setDraft((d) => ({ ...d, answer: e.target.value, ops: null, empty: false }))} />
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {COUNT_Q.test(t) && RANGES.map((r) => (
                      <button key={r} type="button" className="btn btn-sm btn-ghost" onClick={() => setDraft((d) => ({ ...d, answer: d.answer ? `${d.answer} ${r}` : r, ops: null, empty: false }))}>{r}</button>
                    ))}
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => { onChange(removeTodo(t)); reset(); toast("Question retirée : tu pourras la reprendre en refaisant le point."); }}>Je ne sais pas</button>
                    <button className="btn btn-sm btn-primary ml-auto" disabled={draft.busy || draft.answer.trim().length < 2} onClick={() => send(t)}>
                      {draft.busy ? <><Loader2 size={15} className="animate-spin" /> Je réécris…</> : "Réécrire avec ma réponse"}
                    </button>
                  </div>

                  {draft.empty && <p className="mt-2 text-sm text-muted" role="status">Je n'ai rien à modifier avec cette réponse. Précise-la (le chiffre, le contexte) ou clique sur « Fait ».</p>}

                  {preview.length > 0 && (
                    <div className="mt-3 space-y-3" role="status">
                      {preview.map((p, i) => (
                        <div key={i} className="text-sm">
                          <p className="text-xs font-semibold text-muted">{p.where}</p>
                          {p.before && <p className="mt-0.5 text-muted line-through">{p.before}</p>}
                          <p className="mt-0.5 font-medium">{p.after}</p>
                        </div>
                      ))}
                      <div className="flex gap-2">
                        <button className="btn btn-sm btn-primary" onClick={() => accept(t)}><Check size={15} /> Appliquer</button>
                        <button className="btn btn-sm btn-ghost" onClick={() => setDraft((d) => ({ ...d, ops: null }))}><X size={15} /> Refuser</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
