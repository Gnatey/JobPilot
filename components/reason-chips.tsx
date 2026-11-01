"use client";
import { REJECT_REASONS } from "@/lib/types";

/** « Pourquoi ? » : une pastille par raison, un clic. C'est ce qui apprend à l'app à mieux trier. */
export function ReasonChips({ onPick, disabled, className = "" }: { onPick: (reason: string) => void; disabled?: boolean; className?: string }) {
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`} role="group" aria-label="Raison">
      {REJECT_REASONS.map((x) => (
        <button key={x.id} type="button" disabled={disabled} className="chip" onClick={() => onPick(x.id)}>{x.label}</button>
      ))}
    </div>
  );
}
