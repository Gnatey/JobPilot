"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, X, FileText, Loader2, ClipboardPaste } from "lucide-react";
import type { OnboardingAnswers } from "@/lib/types";

type Props = {
  kind: "onboarding" | "refresh";
  answers?: OnboardingAnswers;
  submitLabel: string;
  /** Appelé juste avant d'ouvrir le diagnostic (nettoyage du brouillon, par exemple) */
  onDone?: () => void;
  /** Permet de passer cette étape ; doit lancer une erreur (message affiché) si l'enregistrement échoue */
  onSkip?: () => Promise<void>;
  skipLabel?: string;
};

export function CvUpload({ kind, answers, submitLabel, onDone, onSkip, skipLabel = "Passer cette étape" }: Props) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [text, setText] = useState("");
  const [showText, setShowText] = useState(false);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function add(list: FileList | null) {
    if (!list) return;
    const ok = [...list].filter((f) => /\.(pdf|docx|txt)$/i.test(f.name));
    if (ok.length < list.length) setErr("Formats acceptés : PDF, Word (.docx) ou .txt.");
    setFiles((xs) => [...xs, ...ok].slice(0, 6));
  }

  async function submit() {
    setBusy(true);
    setErr(null);
    const fd = new FormData();
    fd.set("kind", kind);
    if (answers) fd.set("answers", JSON.stringify(answers));
    files.forEach((f) => fd.append("files", f));
    if (text.trim()) fd.set("text", text);
    const r = await fetch("/api/cv/diagnose", { method: "POST", body: fd }).then((r) => r.json()).catch(() => ({ error: "Connexion interrompue, réessaie." }));
    if (r.error) { setBusy(false); return setErr(r.error); }
    onDone?.();
    router.push(`/diagnostic/${r.id}`);
  }

  async function skip() {
    if (!onSkip) return;
    setSkipping(true);
    setErr(null);
    try { await onSkip(); } catch (e) { setSkipping(false); setErr(e instanceof Error ? e.message : "Impossible de passer cette étape, réessaie."); }
  }

  return (
    <div>
      <button type="button" onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); add(e.dataTransfer.files); }}
        className={`flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-10 text-center ${drag ? "border-marigold bg-marigold/10" : "border-line bg-surface hover:border-muted"}`}>
        <Upload size={28} className="text-muted" />
        <span className="font-semibold">Dépose tes CV ici ou clique pour les choisir</span>
        <span className="text-sm text-muted">PDF, Word ou texte. Plusieurs versions acceptées : l'app les fusionne et repère les incohérences.</span>
      </button>
      <input ref={input} type="file" multiple accept=".pdf,.docx,.txt" className="hidden" onChange={(e) => { add(e.target.files); e.target.value = ""; }} />

      {files.length > 0 && (
        <ul className="list mt-3">
          {files.map((f, i) => (
            <li key={i} className="flex items-center gap-2 px-3 py-2 text-sm">
              <FileText size={16} className="shrink-0 text-muted" /><span className="min-w-0 flex-1 truncate">{f.name}</span>
              <span className="text-muted">{Math.round(f.size / 1024)} Ko</span>
              <button type="button" aria-label={`Retirer ${f.name}`} className="p-1 text-muted hover:text-bad" onClick={() => setFiles((xs) => xs.filter((_, j) => j !== i))}><X size={16} /></button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3">
        <button type="button" aria-expanded={showText} className="btn btn-sm btn-ghost -ml-2" onClick={() => setShowText((v) => !v)}>
          <ClipboardPaste size={15} /> {showText ? "Masquer le champ de texte" : "Coller le texte à la place (CV en image ou scan)"}
        </button>
        {showText && <textarea rows={8} className="field mt-2 text-sm" placeholder="Colle ici le texte de ton CV…" value={text} onChange={(e) => setText(e.target.value)} />}
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <button type="button" className="btn btn-primary btn-xl w-full sm:w-auto" disabled={busy || skipping || (!files.length && text.trim().length < 200)} onClick={submit}>
          {busy ? <><Loader2 size={18} className="animate-spin" /> Envoi du CV…</> : submitLabel}
        </button>
        {onSkip && (
          <button type="button" className="btn btn-xl w-full sm:w-auto" disabled={busy || skipping} onClick={skip}>
            {skipping ? <><Loader2 size={18} className="animate-spin" /> Un instant…</> : skipLabel}
          </button>
        )}
      </div>
      {onSkip && !busy && <p className="mt-3 text-sm text-muted">Tu peux passer : dépose ton CV quand tu veux depuis « Mon CV ». Sans lui, l'app ne peut ni juger ton CV ni en préparer pour les offres.</p>}
      {!busy && <p className="mt-3 text-sm text-muted">L'analyse se fait en arrière-plan (environ une minute) : tu peux quitter la page ensuite.</p>}
      {err && <p className="mt-3 rounded-xl bg-bad/10 p-3 text-sm text-bad" role="alert">{err}{onSkip ? " Tu peux aussi passer cette étape et déposer ton CV plus tard." : ""}</p>}
    </div>
  );
}
