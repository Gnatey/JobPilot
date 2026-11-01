"use client";
import { useState } from "react";
import { Check, Lightbulb, Loader2, Sparkles, X } from "lucide-react";
import { useFeedback } from "@/components/ui/feedback";
import type { SkillSuggestion } from "@/lib/types";

type Props = {
  /** Suggestions déjà connues (page d'une offre). Sans cette liste, un bouton lance la recherche (page Profil). */
  initial?: SkillSuggestion[];
  /** Sur la page Profil, le profil est en mémoire : on le modifie par ici au lieu de passer par le serveur. */
  onAccept?: (s: SkillSuggestion) => void;
  onDismiss?: (s: SkillSuggestion) => void;
  title?: string;
  intro?: string;
};

/** L'IA propose ce que tu sais probablement déjà ; rien n'entre dans ton profil sans ton « Oui, je sais le faire ». */
export function SkillSuggestions({ initial, onAccept, onDismiss, title = "Tu sais peut-être déjà le faire", intro }: Props) {
  const { toast } = useFeedback();
  const [items, setItems] = useState<SkillSuggestion[] | null>(initial ?? null);
  const [busy, setBusy] = useState(false);
  const [scanned, setScanned] = useState(false);

  async function scan() {
    setBusy(true);
    try {
      const res = await fetch("/api/profile/suggest", { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) return toast(j.error ?? "La recherche a échoué, réessaie.", { tone: "err" });
      setItems(j.suggestions ?? []);
      setScanned(true);
    } catch {
      toast("Connexion interrompue, réessaie.", { tone: "err" });
    } finally {
      setBusy(false);
    }
  }

  async function decide(s: SkillSuggestion, accept: boolean) {
    setItems((cur) => (cur ?? []).filter((x) => x.skill !== s.skill));
    if (accept) {
      if (onAccept) onAccept(s);
      else {
        const r = await fetch("/api/profile/skills", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ add: [{ category: s.category, skill: s.skill }] }) }).catch(() => null);
        if (!r?.ok) return toast("Je n'ai pas pu l'ajouter à ton profil, réessaie.", { tone: "err" });
      }
      toast(`« ${s.skill} » ajouté à ton profil. Il sera utilisé dans tes prochains CV.`, { tone: "ok" });
    } else {
      if (onDismiss) onDismiss(s);
      else await fetch("/api/profile/skills", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dismiss: [s.skill] }) }).catch(() => null);
    }
  }

  if (initial && !items?.length) return null; // page d'une offre : rien à confirmer, rien à afficher

  return (
    <section className="card mb-8 p-4 md:p-5" aria-labelledby="skills-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="skills-title" className="heading flex items-center gap-2 text-lg"><Lightbulb size={18} className="text-marigold-deep" /> {title}</h2>
          <p className="mt-1 max-w-[62ch] text-sm text-muted">
            {intro ?? "Ces compétences découlent de ce que tu as déjà écrit. Réponds « Oui » seulement si tu pourrais en parler deux minutes en entretien : sinon, « Non »."}
          </p>
        </div>
        {!initial && (
          <button className="btn btn-primary" onClick={scan} disabled={busy}>
            {busy ? <><Loader2 size={16} className="animate-spin" /> Je relis ton profil…</> : <><Sparkles size={16} /> {scanned ? "Chercher encore" : "Chercher ce que je sais déjà"}</>}
          </button>
        )}
      </div>

      {items && items.length === 0 && scanned && <p className="mt-4 text-sm text-muted" role="status">Rien de nouveau à te proposer pour l'instant. Ton profil est déjà bien rempli.</p>}

      {items && items.length > 0 && (
        <ul className="mt-4 divide-y divide-line">
          {items.map((s) => (
            <li key={s.skill} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0">
              <div className="min-w-0 flex-1 basis-64">
                <p className="font-semibold">
                  {s.skill} <span className="ml-1 text-sm font-normal text-muted">dans « {s.category} »</span>
                  {s.confidence === "forte" && <span className="tag tag-good ml-2">Très probable</span>}
                </p>
                <p className="text-sm text-muted">Parce que : {s.evidence}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button className="btn btn-sm btn-primary" onClick={() => decide(s, true)} aria-label={`Oui, je sais faire ${s.skill}`}><Check size={15} /> Oui, je sais</button>
                <button className="btn btn-sm btn-ghost" onClick={() => decide(s, false)} aria-label={`Non, ne plus proposer ${s.skill}`}><X size={15} /> Non</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
