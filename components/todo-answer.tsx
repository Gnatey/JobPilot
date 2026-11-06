"use client";
import { useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { useFeedback } from "@/components/ui/feedback";
import { addSettled, answerView, applyOps, normText, previewOps, vetOps, type AnswerOp } from "@/lib/profile-fix";
import type { Profile } from "@/lib/types";

type Props = {
  getProfile: () => Profile;
  onChange: (next: Profile) => void;
};

/** Questions dont la réponse est un nombre : on propose des tranches à un clic. */
const COUNT_Q = /combien|volume|nombre|taux|pourcentage|chiffre|%|fréquence|utilisateurs|dashboards?/i;
const RANGES = ["moins de 100", "entre 100 et 1 000", "plus de 1 000"];

/**
 * `empty` : pourquoi il n'y a rien à valider. none = l'IA n'a rien trouvé d'écrivable ; rejected = elle avait une phrase mais avec un chiffre absent de la réponse.
 * `reply` : sa réponse à la préoccupation (c'est un défaut ou non) ; `settled` : la préoccupation est réglée, la question peut disparaître.
 */
type Draft = { answer: string; busy: boolean; ops: AnswerOp[] | null; empty: null | "none" | "rejected"; reply: string; settled: boolean };
const BLANK: Draft = { answer: "", busy: false, ops: null, empty: null, reply: "", settled: false };

/**
 * « À compléter pour des CV plus forts » : chaque ligne se traite en répondant. L'IA répond d'abord à la préoccupation (est-ce un vrai défaut ?),
 * puis, si ta réponse apporte un fait, réécrit la réalisation concernée : tu vois l'avant / après avant d'accepter. Ou en cliquant sur Fait.
 * L'IA n'écrit que ce que contient ta réponse.
 */
export function TodoAnswer({ getProfile, onChange }: Props) {
  const { toast } = useFeedback();
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(BLANK);
  const profile = getProfile();

  const removeTodo = (t: string, base: Profile = getProfile()) => ({ ...base, todo: base.todo.filter((x) => normText(x) !== normText(t)) });
  /** Retire la question ET la note comme réglée : le prochain diagnostic et le prochain « Faire le point » ne la reposent pas. */
  const settle = (t: string, answer: string, base: Profile = getProfile()): Profile => ({ ...removeTodo(t, base), settled: addSettled(base.settled, t, answer) });
  const reset = () => { setOpen(null); setDraft(BLANK); };

  async function send(t: string) {
    const answer = draft.answer.trim();
    if (answer.length < 2) return;
    setDraft((d) => ({ ...d, busy: true, ops: null, empty: null, reply: "", settled: false }));
    try {
      const res = await fetch("/api/profile/answer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: t, answer }) });
      const j = (await res.json().catch(() => ({}))) as { ops?: AnswerOp[]; proposed?: number; reply?: string; settled?: boolean; error?: string };
      if (!res.ok || j.error) { setDraft((d) => ({ ...d, busy: false })); return toast(j.error ?? "L'IA n'a pas pu répondre, réessaie.", { tone: "err" }); }
      // On revérifie sur le profil affiché (il a pu bouger depuis l'envoi)
      const ops = vetOps(getProfile(), j.ops ?? [], answer);
      const reply = typeof j.reply === "string" ? j.reply : "";
      const view = answerView({ ops, reply, proposed: j.proposed ?? 0 });
      setDraft((d) => ({ ...d, busy: false, ops, reply, settled: !!reply && j.settled === true, empty: view === "rejected" ? "rejected" : view === "none" ? "none" : null }));
    } catch {
      setDraft((d) => ({ ...d, busy: false }));
      toast("Connexion interrompue, réessaie.", { tone: "err" });
    }
  }

  function accept(t: string) {
    const cur = getProfile();
    const ops = vetOps(cur, draft.ops ?? [], draft.answer);
    if (!ops.length) return toast("Ce changement ne s'applique plus : ton profil a bougé entre-temps.", { tone: "err" });
    const applied = applyOps(cur, ops);
    onChange(draft.settled ? settle(t, draft.answer, applied) : removeTodo(t, applied));
    toast("Ton profil est mis à jour. Il sera utilisé dans tes prochains CV.", { tone: "ok" });
    reset();
  }

  if (!profile.todo.length) return null;

  return (
    <div className="mb-8 rounded-2xl border border-marigold/50 bg-marigold/10 p-4">
      <p className="font-semibold">À compléter pour des CV plus forts</p>
      <p className="mt-0.5 text-xs text-muted">Réponds en une phrase : l'IA te répond sur le fond (est-ce un vrai défaut ?) et, si ta réponse apporte un fait, réécrit la bonne ligne de ton profil. Tu valides l'avant / après.</p>
      <ul className="mt-2 space-y-3">
        {profile.todo.map((t) => {
          const isOpen = open === t;
          const preview = isOpen && draft.ops ? previewOps(profile, draft.ops) : [];
          return (
            <li key={t} className="text-sm">
              <div className="flex items-start justify-between gap-3">
                <span>{t}</span>
                <span className="flex shrink-0 gap-3">
                  <button className="hit text-ink underline" onClick={() => (isOpen ? reset() : (setOpen(t), setDraft(BLANK)))}>{isOpen ? "Fermer" : "Répondre"}</button>
                  <button className="hit text-muted underline" onClick={() => { onChange(settle(t, isOpen ? draft.answer : "")); if (isOpen) reset(); }}>Fait</button>
                </span>
              </div>

              {isOpen && (
                <div className="mt-2 rounded-xl border border-line bg-white/60 p-3 dark:bg-black/10">
                  <label className="label" htmlFor="todo-answer">Ta réponse</label>
                  <textarea id="todo-answer" rows={2} className="field mt-1" placeholder="En une ou deux phrases, avec les chiffres que tu connais" value={draft.answer} onChange={(e) => setDraft((d) => ({ ...d, answer: e.target.value, ops: null, empty: null, reply: "", settled: false }))} />
                  {COUNT_Q.test(t) && <p className="mt-1 text-xs text-muted">Un chiffre sans unité ne peut pas aller sur un CV : dis ce qui est compté (lignes, fichiers, utilisateurs, Mo…). Ex. : « environ 300 lignes par jour ».</p>}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {COUNT_Q.test(t) && RANGES.map((r) => (
                      <button key={r} type="button" className="btn btn-sm btn-ghost" onClick={() => setDraft((d) => ({ ...d, answer: d.answer ? `${d.answer} ${r}` : r, ops: null, empty: null, reply: "", settled: false }))}>{r}</button>
                    ))}
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => { onChange(removeTodo(t)); reset(); toast("Question retirée : tu pourras la reprendre en refaisant le point."); }}>Je ne sais pas</button>
                    <button className="btn btn-sm btn-primary ml-auto" disabled={draft.busy || draft.answer.trim().length < 2} onClick={() => send(t)}>
                      {draft.busy ? <><Loader2 size={15} className="animate-spin" /> Je lis ta réponse…</> : "Envoyer ma réponse"}
                    </button>
                  </div>

                  {draft.reply && (
                    <div className="mt-3 rounded-lg border border-line bg-white/70 p-3 text-sm dark:bg-black/20" role="status">
                      <p className="text-xs font-semibold text-muted">Ma réponse</p>
                      <p className="mt-0.5">{draft.reply}</p>
                      {!draft.ops?.length && draft.settled && (
                        <button className="btn btn-sm btn-primary mt-2" onClick={() => { onChange(settle(t, draft.answer)); reset(); toast("Question retirée, et notée comme réglée pour les prochains diagnostics."); }}><Check size={15} /> C'est réglé, retirer la question</button>
                      )}
                      {!draft.ops?.length && !draft.settled && <p className="mt-1 text-xs text-muted">Il manque encore une information : complète ta réponse ci-dessus et renvoie-la. Tant qu'elle n'est pas écrite dans ton profil, tes CV n'en tiennent pas compte.</p>}
                      {!draft.ops?.length && draft.settled && <p className="mt-1 text-xs text-muted">Rien n'est ajouté à ton profil avec cette réponse : la question sera seulement notée comme réglée.</p>}
                    </div>
                  )}

                  {draft.empty === "none" && <p className="mt-2 text-sm text-muted" role="status">Je n'ai pas trouvé de quoi écrire une ligne sans l'inventer. Dis ce que tu as livré et pour qui (équipes, périmètre, outils), ou clique sur « Fait ».</p>}
                  {draft.empty === "rejected" && <p className="mt-2 text-sm text-muted" role="status">J'avais une phrase, mais elle contenait un chiffre que tu n'as pas donné : je l'ai écartée plutôt que de l'inventer. Reformule sans chiffre, ou donne le chiffre exact.</p>}

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
