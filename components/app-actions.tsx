"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { today } from "@/lib/format";
import { useFeedback } from "@/components/ui/feedback";
import { refreshBadges } from "@/components/nav";

/** « J'ai envoyé ma candidature » : passe en Postulé et date l'envoi, annulable. Pas de relance programmée : on ne relance qu'après un entretien. */
export function MarkSentButton({ id, label = "Envoyée", primary = false, onDone }: { id: string; label?: string; primary?: boolean; onDone?: () => void }) {
  const sb = supabaseBrowser();
  const router = useRouter();
  const { toast } = useFeedback();
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    const { error } = await sb.from("applications").update({ status: "postule", applied_at: today(), next_action_at: null }).eq("id", id);
    setBusy(false);
    if (error) return toast("Impossible de mettre à jour la candidature.", { tone: "err" });
    refreshBadges();
    router.refresh();
    onDone?.();
    toast("Candidature envoyée. Elle est dans Suivi, à « Postulé ».", {
      action: { label: "Annuler", run: async () => { await sb.from("applications").update({ status: "a_postuler", applied_at: null, next_action_at: null }).eq("id", id); refreshBadges(); router.refresh(); } },
    });
  }
  return <button className={`btn ${primary ? "btn-primary" : ""}`} onClick={run} disabled={busy}><Send size={16} /> {busy ? "…" : label}</button>;
}
