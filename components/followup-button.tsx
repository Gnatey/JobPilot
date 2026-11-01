"use client";
import { useState } from "react";
import { Mail, Copy, Check, Loader2 } from "lucide-react";
import { useFeedback } from "@/components/ui/feedback";

/** Rédige l'email de relance, prêt à copier ou à ouvrir dans la messagerie. */
export function FollowupButton({ id, contact, compact = false }: { id: string; contact?: string | null; compact?: boolean }) {
  const { toast } = useFeedback();
  const [draft, setDraft] = useState<{ subject: string; body: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const email = contact?.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0];

  async function gen() {
    setBusy(true);
    const r = await fetch(`/api/applications/${id}/followup`, { method: "POST" }).then((r) => r.json()).catch(() => ({ error: "Connexion interrompue, réessaie." }));
    setBusy(false);
    if (r.error) return toast(r.error, { tone: "err" });
    setDraft(r);
  }

  if (!draft)
    return (
      <button className={`btn shrink-0 ${compact ? "btn-sm" : ""}`} onClick={gen} disabled={busy}>
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} />} {busy ? "Rédaction…" : "Rédiger la relance"}
      </button>
    );

  return (
    <div className="rise mt-2 w-full basis-full rounded-xl border border-line bg-paper p-3.5">
      <p className="text-sm font-semibold">{draft.subject}</p>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{draft.body}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="btn btn-sm" onClick={() => { navigator.clipboard.writeText(`${draft.subject}\n\n${draft.body}`); setCopied(true); setTimeout(() => setCopied(false), 1800); }}>
          {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? "Copié" : "Copier"}
        </button>
        <a className="btn btn-primary btn-sm" href={`mailto:${email ?? ""}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`}>
          Ouvrir dans ma messagerie
        </a>
        {!email && <span className="self-center text-xs text-muted">Pas d'adresse enregistrée : ajoute le contact dans la candidature.</span>}
      </div>
    </div>
  );
}
