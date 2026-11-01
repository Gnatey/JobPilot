"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2 } from "lucide-react";
import { useFeedback } from "@/components/ui/feedback";

export function InsightsButton() {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const { toast } = useFeedback();
  async function run() {
    setBusy(true);
    const r = await fetch("/api/insights", { method: "POST" }).then((r) => r.json()).catch(() => ({ error: "Connexion interrompue, réessaie." }));
    setBusy(false);
    if (r.error) return toast(r.error, { tone: "err" });
    toast("Analyse à jour.");
    router.refresh();
  }
  return (
    <button className="btn btn-primary" disabled={busy} onClick={run}>
      {busy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />} {busy ? "Analyse en cours…" : "Analyser mes résultats"}
    </button>
  );
}
