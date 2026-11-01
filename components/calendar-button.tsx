"use client";
import { useEffect, useState } from "react";
import { CalendarDays, X } from "lucide-react";
import { CalendarFeed } from "@/components/settings-controls";

/** Agenda (relances et entretiens) : un bouton dans le Suivi, qui ouvre le lien d'abonnement pour Google Agenda, Apple Calendrier ou Outlook. */
export function CalendarButton({ initialUrl }: { initialUrl: string | null }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <>
      <button className="btn" onClick={() => setOpen(true)} aria-label="Agenda"><CalendarDays size={16} /> <span className="hidden sm:inline">Agenda</span></button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4" onClick={() => setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label="Agenda sur mon téléphone" onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-surface p-5 shadow-2xl md:p-6" style={{ animation: "toast-in .2s ease-out both" }}>
            <div className="flex items-start gap-3">
              <h2 className="display flex-1 text-2xl md:text-3xl">Agenda sur mon téléphone</h2>
              <button type="button" className="btn btn-ghost btn-icon -mr-2 -mt-1" onClick={() => setOpen(false)} aria-label="Fermer"><X size={20} /></button>
            </div>
            <p className="mb-4 mt-2 text-muted">Tes relances et tes entretiens apparaissent dans Google Agenda, Apple Calendrier ou Outlook, avec un rappel la veille. Le lien est secret : ne le partage pas.</p>
            <CalendarFeed initialUrl={initialUrl} />
          </div>
        </div>
      )}
    </>
  );
}
