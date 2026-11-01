"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardPaste, Loader2, Sparkles } from "lucide-react";
import { analyzeOffer, isUrl, useSteps } from "@/lib/client/analyze";
import { useFeedback } from "@/components/ui/feedback";

/** Le raccourci des paresseuses : colle un lien ou une annonce, appuie sur Entrée, le score arrive. */
export function QuickPaste({ autoFocus = false }: { autoFocus?: boolean }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [v, setV] = useState("");
  const [busy, setBusy] = useState(false);
  const step = useSteps(busy);
  const ref = useRef<HTMLTextAreaElement>(null);

  async function run(value = v) {
    const s = value.trim();
    if (!s || busy) return;
    setBusy(true);
    const r = await analyzeOffer(isUrl(s) ? { url: s } : { text: s });
    setBusy(false);
    if (r.error) {
      if (r.needsText) {
        toast("Cette page est protégée : colle le texte de l'annonce.", { tone: "info" });
        return router.push(`/offres/nouvelle?needtext=1&url=${encodeURIComponent(s)}`);
      }
      return toast(r.error, { tone: "err" });
    }
    if (r.existing) toast("Cette offre était déjà analysée, la voici.", { tone: "info" });
    router.push(`/offres/${r.id}`);
  }

  async function paste() {
    try {
      const t = await navigator.clipboard.readText();
      if (t) { setV(t); if (isUrl(t)) run(t); else ref.current?.focus(); }
    } catch {
      toast("Le navigateur bloque le presse-papiers : colle avec Ctrl+V dans le champ.", { tone: "info" });
    }
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); run(); }} className="card p-3 shadow-lift">
      <label className="sr-only" htmlFor="quick-paste">Lien ou texte d'une offre</label>
      <div className="flex items-start gap-2">
        <textarea id="quick-paste" ref={ref} rows={1} value={v} autoFocus={autoFocus} disabled={busy}
          onChange={(e) => { setV(e.target.value); e.target.style.height = "auto"; e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`; }}
          onPaste={(e) => { const t = e.clipboardData.getData("text"); if (isUrl(t) && !v.trim()) { e.preventDefault(); setV(t); run(t); } }}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); run(); } }}
          placeholder="Colle un lien d'offre"
          className="min-h-11 flex-1 resize-none bg-transparent px-2 py-2.5 text-base outline-none placeholder:text-muted" />
        <button type="button" onClick={paste} disabled={busy} className="btn btn-ghost btn-icon shrink-0" aria-label="Coller depuis le presse-papiers" title="Coller depuis le presse-papiers"><ClipboardPaste size={19} /></button>
        <button className="btn btn-primary shrink-0" disabled={busy || !v.trim()} aria-label={busy ? "Analyse en cours" : "Analyser l'offre"}>
          {busy ? <Loader2 size={17} className="animate-spin" /> : <Sparkles size={17} />}
          <span className="hidden sm:inline">{busy ? step : "Analyser"}</span>
        </button>
      </div>
      {busy && <p className="px-2 pb-1 pt-1 text-sm text-muted sm:hidden">{step}…</p>}
    </form>
  );
}
