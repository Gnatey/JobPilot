"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";
import { useFeedback } from "@/components/ui/feedback";
import { refreshBadges } from "@/components/nav";
import { ReasonChips } from "@/components/reason-chips";

/**
 * Corbeille d'une ligne d'Offres & CV. Un clic ouvre une fenêtre : la même liste de raisons que « Je ne postule pas » (trop senior, autre…).
 * Choisir une raison supprime tout de suite, et la raison aide JobPilot à mieux trier ; « Supprimer sans préciser » supprime sans raison.
 * - « offer » : offre analysée. Son analyse et ses documents partent avec elle, ainsi que ses lignes « À postuler » dans Suivi.
 * - « app » : ligne « À analyser » (candidature sans analyse) : seule la ligne du suivi est supprimée.
 */
export function OfferRowDelete({ kind, id, label }: { kind: "offer" | "app"; id: string; label: string }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (open && el && !el.open) el.showModal();
  }, [open]);

  function close() {
    if (busy) return;
    ref.current?.close();
    setOpen(false);
  }

  async function remove(reason?: string) {
    setBusy(true);
    const res = await fetch(kind === "offer" ? `/api/offers/${id}` : `/api/applications/${id}`, {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }),
    }).catch(() => null);
    const j = res ? ((await res.json().catch(() => ({}))) as { error?: string }) : {};
    setBusy(false);
    if (!res?.ok) return toast(j.error ?? "Suppression impossible pour le moment, réessaie.", { tone: "err" });
    ref.current?.close();
    setOpen(false);
    refreshBadges();
    toast(kind === "offer" ? "Offre supprimée." : "Ligne supprimée.", { tone: "info" });
    router.refresh();
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn btn-ghost btn-icon mr-2 shrink-0 text-muted hover:text-bad" aria-label={`Supprimer ${label}`} title="Supprimer">
        <Trash2 size={16} />
      </button>
      <dialog
        ref={ref}
        aria-label={kind === "offer" ? "Supprimer cette offre" : "Supprimer cette ligne"}
        onCancel={(e) => { e.preventDefault(); close(); }}
        onClick={(e) => { if (e.target === ref.current) close(); }}
        className="m-auto w-[min(92vw,30rem)] rounded-2xl border border-line bg-surface p-0 shadow-lift"
      >
        {open && (
          <div className="p-5">
            <h2 className="heading text-lg">{kind === "offer" ? "Supprimer cette offre ?" : "Supprimer cette ligne ?"}</h2>
            <p className="mt-2 text-sm text-muted">
              {kind === "offer"
                ? `${label}. L'analyse et les documents (CV, LM…) seront supprimés, ainsi que la ligne correspondante dans Suivi. Cette action est définitive.`
                : `${label}. Elle n'a pas encore été analysée : seule sa ligne dans Suivi est supprimée.`}
            </p>
            <p className="mt-4 text-sm font-semibold">Pourquoi ? <span className="font-normal text-muted">Un clic supprime, et ça aide JobPilot à mieux trier la suite.</span></p>
            <ReasonChips className="mt-2" disabled={busy} onPick={(reason) => remove(reason)} />
            <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
              {busy && <Loader2 size={16} className="animate-spin text-muted" aria-label="Suppression en cours" />}
              <button type="button" className="btn btn-ghost" onClick={close} disabled={busy}>Annuler</button>
              <button type="button" className="btn border-bad bg-bad text-on-solid" onClick={() => remove()} disabled={busy}>Supprimer sans préciser</button>
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}
