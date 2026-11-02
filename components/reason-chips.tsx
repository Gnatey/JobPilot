"use client";
import { useState } from "react";
import { OTHER_REASON, REASON_NOTE_MAX, REJECT_REASONS, withReasonNote } from "@/lib/types";

/**
 * « Autre » : un pourquoi libre, facultatif (ex. « offre entièrement en anglais »).
 * « Valider » sans rien écrire marche aussi : le pourquoi n'est jamais obligatoire.
 */
export function OtherNote({ onDone, onCancel, disabled }: { onDone: (reason: string) => void; onCancel: () => void; disabled?: boolean }) {
  const [note, setNote] = useState("");
  return (
    <form
      className="rise mt-2 flex flex-wrap items-center gap-2"
      onSubmit={(e) => { e.preventDefault(); onDone(withReasonNote(OTHER_REASON, note)); }}
    >
      <input
        autoFocus
        className="field min-w-0 flex-1 basis-60"
        maxLength={REASON_NOTE_MAX}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); onCancel(); } }}
        placeholder="Pourquoi ? (facultatif) Ex. offre entièrement en anglais"
        aria-label="Pourquoi (facultatif)"
      />
      <button type="submit" className="btn btn-primary btn-sm" disabled={disabled}>{note.trim() ? "Valider" : "Valider sans préciser"}</button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Retour</button>
    </form>
  );
}

/** « Pourquoi ? » : une pastille par raison, un clic. C'est ce qui apprend à l'app à mieux trier. « Autre » demande en plus un pourquoi libre. */
export function ReasonChips({ onPick, disabled, className = "" }: { onPick: (reason: string) => void; disabled?: boolean; className?: string }) {
  const [other, setOther] = useState(false);
  return (
    <div className={className}>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Raison">
        {REJECT_REASONS.map((x) => (
          <button
            key={x.id}
            type="button"
            disabled={disabled}
            className="chip"
            aria-pressed={x.id === OTHER_REASON ? other : undefined}
            onClick={() => (x.id === OTHER_REASON ? setOther(true) : onPick(x.id))}
          >
            {x.label}
          </button>
        ))}
      </div>
      {other && <OtherNote disabled={disabled} onDone={onPick} onCancel={() => setOther(false)} />}
    </div>
  );
}
