"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";
import { useFeedback } from "@/components/ui/feedback";
import { refreshBadges } from "@/components/nav";
import { supabaseBrowser } from "@/lib/supabase/client";

/**
 * Corbeille d'une ligne d'Offres & CV.
 * - « offer » : offre analysée. Son analyse et ses documents partent avec elle, ainsi que ses lignes « À postuler » dans Suivi.
 * - « app » : ligne « À analyser » (candidature sans analyse) : seule la ligne du suivi est supprimée.
 */
export function OfferRowDelete({ kind, id, label }: { kind: "offer" | "app"; id: string; label: string }) {
  const router = useRouter();
  const { toast, confirm } = useFeedback();
  const sb = useMemo(() => supabaseBrowser(), []);
  const [busy, setBusy] = useState(false);

  async function remove() {
    const ok = await confirm({
      title: kind === "offer" ? "Supprimer cette offre ?" : "Supprimer cette ligne ?",
      body: kind === "offer"
        ? `${label}. L'analyse et les documents (CV, LM…) seront supprimés, ainsi que la ligne correspondante dans Suivi. Cette action est définitive.`
        : `${label}. Elle n'a pas encore été analysée : seule sa ligne dans Suivi est supprimée.`,
      confirmLabel: "Supprimer", danger: true,
    });
    if (!ok) return;
    setBusy(true);
    let failed = false;
    if (kind === "offer") {
      const res = await fetch(`/api/offers/${id}`, { method: "DELETE" }).catch(() => null);
      failed = !res?.ok;
    } else {
      const { error } = await sb.from("applications").delete().eq("id", id);
      failed = !!error;
    }
    setBusy(false);
    if (failed) return toast("Suppression impossible pour le moment, réessaie.", { tone: "err" });
    refreshBadges();
    toast(kind === "offer" ? "Offre supprimée." : "Ligne supprimée.", { tone: "info" });
    router.refresh();
  }

  return (
    <button type="button" onClick={remove} disabled={busy} className="btn btn-ghost btn-icon mr-2 shrink-0 text-muted hover:text-bad" aria-label={`Supprimer ${label}`} title="Supprimer">
      {busy ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
    </button>
  );
}
