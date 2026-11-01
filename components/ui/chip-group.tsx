"use client";
import { Check } from "lucide-react";

/** Boutons à cocher : on coche, puis on décoche en recliquant. `multi` autorise plusieurs choix. */
export function ChipGroup({
  options, value, onChange, multi = false, invalid = false, label, keepOne = false, className = "mt-3",
}: {
  options: string[]; value: string[]; onChange: (v: string[]) => void; multi?: boolean; invalid?: boolean; label: string;
  /** Un choix reste toujours coché (on ne peut qu'en changer) */
  keepOne?: boolean; className?: string;
}) {
  const toggle = (o: string) => {
    const on = value.includes(o);
    if (on && keepOne && value.length === 1) return;
    onChange(multi ? (on ? value.filter((x) => x !== o) : [...value, o]) : on ? [] : [o]);
  };
  return (
    <div className={`flex flex-wrap gap-2 ${className}`} role="group" aria-label={label}>
      {options.map((o) => {
        const on = value.includes(o);
        return (
          <button key={o} type="button" aria-pressed={on} onClick={() => toggle(o)} className={`chip ${invalid && !value.length ? "!border-bad" : ""}`}>
            {on && <Check size={14} aria-hidden />}{o}
          </button>
        );
      })}
    </div>
  );
}
