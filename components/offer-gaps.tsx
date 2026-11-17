"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, HelpCircle, Loader2, X } from "lucide-react";
import { useFeedback } from "@/components/ui/feedback";
import type { AnswerOp } from "@/lib/profile-fix";
import { canAddAsSkill } from "@/lib/offer-gaps";

type Preview = { where: string; before: string; after: string };
type Draft = { answer: string; busy: boolean; ops: AnswerOp[] | null; preview: Preview[]; reply: string; empty: boolean };
const BLANK: Draft = { answer: "", busy: false, ops: null, preview: [], reply: "", empty: false };

/**
 * « Écarts avec l'offre » : ce que l'annonce demande et que ton profil ne dit pas, présenté comme la carte des mots-clés
 * (`SkillSuggestions` : une question, « Oui » en bouton jaune, « Non » discret). Pour chaque point :
 * - « Oui, je connais » : un clic, rien à écrire (jamais obligatoire). Un mot-clé court entre dans tes compétences ; pour une phrase de l'annonce (« Rigueur,
 *   réactivité et sens de l'organisation »), le point est seulement noté « réglé » sur l'offre, le profil ne change pas ;
 * - « Oui, avec un détail » : tu écris une phrase, l'IA propose la ligne de ton profil (avant / après), tu valides ; elle sera dans tes prochains CV ;
 * - « Non » : noté sur l'offre, le CV et la lettre ne le revendiquent pas.
 * Rien n'est écrit sans ta validation, et l'IA n'écrit que ce que contient ta réponse.
 */
export function OfferGaps({ offerId, gaps }: { offerId: string; gaps: { term: string; from?: "keyword" | "must_have" }[] }) {
  const { toast } = useFeedback();
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(BLANK);
  const [busyNo, setBusyNo] = useState<string | null>(null);
  const [busyYes, setBusyYes] = useState<string | null>(null);
  const [busyDone, setBusyDone] = useState<string | null>(null);
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

  /**
   * « Oui, je connais » sans rien écrire. Un mot-clé court entre dans les compétences du profil (`skill`) ; une phrase de l'annonce ne peut pas devenir une
   * compétence : le point est noté « réglé » sur l'offre (`done`) et le profil ne change pas (le toast le dit : « Oui, avec un détail » l'écrit dans le profil).
   */
  async function plainYes(term: string, asSkill: boolean) {
    setBusyYes(term);
    try {
      await call({ action: asSkill ? "skill" : "done", term });
      toast(asSkill
        ? `« ${term} » ajouté à tes compétences. Génère un nouveau CV (« Autre version ») pour qu'il l'utilise.`
        : "Noté : tu le connais. Ton profil n'a pas changé, donc le CV n'en parlera que s'il le dit déjà. « Oui, avec un détail » l'ajoute à ton profil.", { tone: "ok", ms: asSkill ? undefined : 8000 });
      if (open === term) reset();
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Connexion interrompue, réessaie.", { tone: "err" });
    } finally {
      setBusyYes(null);
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

  /** « C'est réglé, rien à ajouter » : le point sort de la liste, rien n'est écrit dans le profil. */
  async function settle(term: string) {
    setBusyDone(term);
    try {
      await call({ action: "done", term });
      toast("Noté : c'est réglé pour cette offre. Ton profil n'a pas changé.", { tone: "ok" });
      if (open === term) reset();
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Connexion interrompue, réessaie.", { tone: "err" });
    } finally {
      setBusyDone(null);
    }
  }

  if (!gaps.length) return null;

  return (
    <section className="card mb-8 p-4 md:p-5" aria-labelledby="gaps-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="gaps-title" className="heading flex items-center gap-2 text-lg"><HelpCircle size={18} className="text-marigold-deep" /> Ces points de l'offre, tu les connais ?</h2>
          <p className="mt-1 max-w-[62ch] text-sm text-muted">
            L'annonce les demande et ton profil ne les dit nulle part, donc ton CV ne peut pas en parler. « Oui, je connais » : un clic, rien à écrire (un mot-clé entre dans tes compétences, une phrase de l'annonce est seulement notée comme réglée). « Oui, avec un détail » te laisse l'expliquer en une phrase, et tu vois la ligne avant qu'elle entre dans ton profil. « Non » : le CV et la lettre ne le revendiqueront pas pour cette offre.
          </p>
        </div>
        <span className="tag">{gaps.length} à confirmer</span>
      </div>

      <ul className="mt-4 divide-y divide-line">
        {gaps.map(({ term, from }) => {
          const isOpen = open === term;
          const plain = canAddAsSkill(term, from ?? "must_have");
          const id = `gap-${term.replace(/[^a-z0-9]+/gi, "-").slice(0, 40)}`;
          return (
            <li key={term} className="py-3 text-sm first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <p className="min-w-0 flex-1 basis-64 font-semibold">{term}</p>
                <div className="flex max-w-full flex-wrap gap-2">
                  <button className="btn btn-sm btn-primary" disabled={busyYes === term} onClick={() => plainYes(term, plain)} aria-label={`Oui, je connais : ${term}`}>
                    {busyYes === term ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Oui, je connais
                  </button>
                  {isOpen
                    ? <button className="btn btn-sm btn-ghost" aria-expanded aria-controls={id} onClick={reset}>Fermer</button>
                    : <button className="btn btn-sm btn-ghost" aria-expanded={false} aria-controls={id} onClick={() => { setOpen(term); setDraft(BLANK); }} aria-label={`Oui, avec un détail : ${term}`}>
                        Oui, avec un détail
                      </button>}
                  <button className="btn btn-sm btn-ghost" disabled={busyNo === term} onClick={() => notDone(term)} aria-label={`Non, ne pas le revendiquer : ${term}`}>
                    {busyNo === term ? <Loader2 size={15} className="animate-spin" /> : <X size={15} />} Non
                  </button>
                </div>
              </div>

              {isOpen && (
                <div id={id} className="mt-3 rounded-xl border border-line bg-paper p-3">
                  <label className="label" htmlFor={`${id}-answer`}>Où, pour qui, avec quels outils ? (en une ou deux phrases)</label>
                  <textarea id={`${id}-answer`} rows={2} className="field mt-1" placeholder="Avec les chiffres que tu connais, si tu en as" value={draft.answer}
                    onChange={(e) => setDraft((d) => ({ ...d, answer: e.target.value, ops: null, preview: [], reply: "", empty: false }))} />
                  <div className="mt-2 flex justify-end">
                    <button className="btn btn-sm btn-primary" disabled={draft.busy || draft.answer.trim().length < 2} onClick={() => send(term)}>
                      {draft.busy ? <><Loader2 size={15} className="animate-spin" /> Je lis ta réponse…</> : "Envoyer ma réponse"}
                    </button>
                  </div>

                  {draft.reply && (
                    <div className="mt-3 rounded-lg border border-line bg-surface p-3" role="status">
                      <p className="text-xs font-semibold text-muted">Ma réponse</p>
                      <p className="mt-0.5">{draft.reply}</p>
                    </div>
                  )}
                  {draft.empty && <p className="mt-2 text-muted" role="status">Je n'ai pas trouvé de quoi écrire une ligne sans l'inventer. Tu peux préciser, {plain ? "l'ajouter simplement à tes compétences, " : ""}fermer ce point si c'est réglé, ou cliquer sur « Non ».</p>}
                  {!draft.preview.length && (draft.reply || draft.empty) && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {plain && <button className="btn btn-sm btn-primary" disabled={busyYes === term} onClick={() => plainYes(term, true)}><Check size={15} /> Ajouter « {term} » sans détail</button>}
                      <button className={`btn btn-sm ${plain ? "btn-ghost" : "btn-primary"}`} disabled={busyDone === term} onClick={() => settle(term)} title="Ferme ce point pour cette offre, sans rien ajouter à ton profil">
                        {busyDone === term ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} C'est réglé, rien à ajouter
                      </button>
                    </div>
                  )}

                  {draft.preview.length > 0 && (
                    <div className="mt-3 space-y-3" role="status">
                      {draft.preview.map((p, i) => (
                        <div key={i} className="rounded-lg border border-line bg-surface p-3">
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
    </section>
  );
}
