"use client";
import { useRef, useState } from "react";
import { Check, ClipboardCheck, Loader2, Undo2, X } from "lucide-react";
import { useFeedback } from "@/components/ui/feedback";
import { applyProposal, dedupeExact, normText, urlIn, withoutUrl, type Proposal } from "@/lib/profile-fix";
import type { Profile } from "@/lib/types";

type Item = Proposal & { auto?: boolean };
type Result = { proposals: Item[]; questions: string[]; notes: string[] };

type Props = {
  /** Le profil en mémoire sur la page Profil (modifications non enregistrées comprises). */
  getProfile: () => Profile;
  /** Remplace le profil de la page : la page l'enregistre toute seule. */
  onChange: (next: Profile) => void;
};

const quote = (s: string, n = 170) => `« ${s.length > n ? `${s.slice(0, n - 1)}…` : s} »`;

/**
 * « Faire le point » : l'IA relit le profil. Ce qui est évident et sans risque (doublons de mots, liens répétés) est réglé tout de suite,
 * avec un bouton Annuler. Tout ce qui change le sens (ranger une réalisation dans Projets, fusionner deux phrases qui n'ont pas les
 * mêmes informations) attend un clic. Les questions arrivent dans « À compléter ».
 */
export function ProfileAudit({ getProfile, onChange }: Props) {
  const { toast } = useFeedback();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [settled, setSettled] = useState<string[]>([]);
  const [ask, setAsk] = useState<Item[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const before = useRef<Profile | null>(null);

  async function run() {
    setBusy(true);
    try {
      const res = await fetch("/api/profile/audit", { method: "POST" });
      const j = (await res.json().catch(() => ({}))) as Partial<Result> & { error?: string };
      if (!res.ok || j.error) return toast(j.error ?? "La relecture a échoué, réessaie.", { tone: "err" });

      const start = getProfile();
      before.current = start;
      const lines: string[] = [];

      // 1. Ménage exact (aucune IA) : réalisations identiques, projets en double, liens répétés
      const ex = dedupeExact(start);
      let next = ex.profile;
      lines.push(...ex.changes);

      // 2. Fusions sans perte : on garde une phrase telle quelle, elle porte déjà tout
      const toAsk: Item[] = [];
      for (const p of j.proposals ?? []) {
        if (p.auto && p.kind === "merge") {
          const applied = applyProposal(next, p);
          if (applied !== next) { next = applied; lines.push(`Fusionné : ${quote(p.keep)} (${p.drop.length} phrase${p.drop.length > 1 ? "s" : ""} identique${p.drop.length > 1 ? "s" : ""} retirée${p.drop.length > 1 ? "s" : ""})`); }
        } else toAsk.push(p);
      }

      // 3. Les questions rejoignent « À compléter » (sans doublon)
      const known = new Set(next.todo.map(normText));
      const newQ = (j.questions ?? []).filter((q) => q.trim() && !known.has(normText(q)));
      if (newQ.length) next = { ...next, todo: [...next.todo, ...newQ] };

      if (next !== start) onChange(next);
      setSettled(lines);
      setAsk(toAsk.filter((p) => applyProposal(next, p) !== next));
      setNotes(j.notes ?? []);
      setDone(true);
      if (newQ.length) toast(`${newQ.length} question${newQ.length > 1 ? "s" : ""} ajoutée${newQ.length > 1 ? "s" : ""} dans « À compléter ».`);
    } catch {
      toast("Connexion interrompue, réessaie.", { tone: "err" });
    } finally {
      setBusy(false);
    }
  }

  function undo() {
    if (!before.current) return;
    onChange(before.current);
    before.current = null;
    setSettled([]);
    toast("Retour à ton profil d'avant.");
  }

  function decide(p: Item, yes: boolean) {
    setAsk((cur) => cur.filter((x) => x.id !== p.id));
    if (!yes) return;
    const cur = getProfile();
    const next = applyProposal(cur, p);
    if (next === cur) return toast("Ce changement ne s'applique plus : ton profil a bougé entre-temps.", { tone: "err" });
    onChange(next);
    toast(p.kind === "to_project" ? `« ${p.project.name} » est maintenant dans tes projets.` : "C'est fait.");
  }

  const nothing = done && !settled.length && !ask.length && !notes.length;

  return (
    <section className="card mb-8 p-4 md:p-5" aria-labelledby="audit-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="audit-title" className="heading flex items-center gap-2 text-lg"><ClipboardCheck size={18} className="text-marigold-deep" /> Faire le point sur mon profil</h2>
          <p className="mt-1 max-w-[62ch] text-sm text-muted">
            L'IA relit tout : elle retire seule les doublons évidents (avec un bouton Annuler) et te propose le reste en un clic : projets rangés en expérience, phrases à fusionner. Rien n'est inventé.
          </p>
        </div>
        <button className="btn btn-primary" onClick={run} disabled={busy}>
          {busy ? <><Loader2 size={16} className="animate-spin" /> Je relis ton profil…</> : <><ClipboardCheck size={16} /> {done ? "Relire encore" : "Faire le point"}</>}
        </button>
      </div>

      {nothing && <p className="mt-4 text-sm text-muted" role="status">Rien à corriger : ton profil est propre.</p>}

      {settled.length > 0 && (
        <div className="mt-4 rounded-xl border border-line bg-good/5 p-3" role="status">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-semibold">Réglé pour toi</p>
            <button className="btn btn-sm btn-ghost shrink-0" onClick={undo}><Undo2 size={14} /> Annuler</button>
          </div>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-muted">{settled.map((l, i) => <li key={i}>{l}</li>)}</ul>
        </div>
      )}

      {ask.length > 0 && (
        <ul className="mt-4 divide-y divide-line">
          {ask.map((p) => (
            <li key={p.id} className="flex flex-wrap items-start gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0">
              <div className="min-w-0 flex-1 basis-72 text-sm">
                {p.kind === "merge" && (
                  <>
                    <p className="font-semibold">Ces phrases disent la même chose</p>
                    <p className="mt-1 text-muted">Garder : {quote(p.merged ?? p.keep)}</p>
                    {p.drop.map((d, i) => <p key={i} className="text-muted">Retirer : {quote(d)}</p>)}
                  </>
                )}
                {p.kind === "to_project" && (
                  <>
                    <p className="font-semibold">Plutôt un projet qu'une expérience : « {p.project.name} »</p>
                    <p className="mt-1 text-muted">Retirer de l'expérience : {quote(p.text)}</p>
                    <p className="text-muted">Dans Projets : {withoutUrl(p.project.description) || withoutUrl(p.text)}{urlIn(p.text) ? ` (lien repris : ${urlIn(p.text)})` : ""}</p>
                  </>
                )}
                {p.kind === "duplicate" && (
                  <>
                    <p className="font-semibold">Déjà dans tes projets : « {p.project_name} »</p>
                    <p className="mt-1 text-muted">Retirer de l'expérience : {quote(p.text)}</p>
                  </>
                )}
                {p.why && <p className="mt-1 text-xs text-muted">{p.why}</p>}
              </div>
              <div className="flex shrink-0 gap-2">
                <button className="btn btn-sm btn-primary" onClick={() => decide(p, true)}><Check size={15} /> Oui</button>
                <button className="btn btn-sm btn-ghost" onClick={() => decide(p, false)}><X size={15} /> Non</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {notes.length > 0 && (
        <div className="mt-4 text-sm">
          <p className="font-semibold">À savoir</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted">{notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </div>
      )}
    </section>
  );
}
