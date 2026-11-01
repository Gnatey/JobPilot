"use client";
import { LETTER_TEMPLATES, type LetterParts } from "@/lib/letter";
import type { Profile } from "@/lib/types";
import { LetterSheet } from "./letter-templates";

const noop = () => {};
// Une page A4 imprimée fait 182 mm de large (210 mm moins les marges) ; l'aperçu la réduit pour tenir dans une vignette de 88 px.
const PAGE_PX = (182 * 96) / 25.4;
const THUMB_W = 88;
const SCALE = THUMB_W / PAGE_PX;

/** Choix du modèle de lettre : chaque vignette est la vraie lettre, rendue dans ce modèle. */
export function LetterPicker({ value, onChange, parts, identity, matching }: {
  value: string; onChange: (id: string) => void; parts: LetterParts; identity: Profile["identity"]; matching?: string | null;
}) {
  return (
    <div role="radiogroup" aria-label="Modèle de LM" className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2 pt-1">
      {LETTER_TEMPLATES.map((t) => {
        const on = value === t.id;
        return (
          <button key={t.id} type="button" role="radio" aria-checked={on} onClick={() => onChange(t.id)} title={t.for}
            className={`group w-[104px] shrink-0 snap-start rounded-xl border p-2 text-left transition-colors ${on ? "border-ink bg-surface shadow-sm ring-2 ring-marigold" : "border-line bg-surface hover:border-ink/40"}`}>
            <span className="relative block overflow-hidden rounded-md border border-line bg-white" style={{ width: THUMB_W, height: Math.round(THUMB_W * 1.38) }} aria-hidden="true">
              <span inert className="pointer-events-none block origin-top-left select-none text-black" style={{ width: PAGE_PX, transform: `scale(${SCALE})` }}>
                <LetterSheet template={t.id} p={parts} id={identity} upd={noop} />
              </span>
            </span>
            <span className="mt-1.5 block text-[0.8rem] font-semibold leading-tight">{t.label}</span>
            {matching === t.id && <span className="mt-0.5 block text-[0.68rem] font-semibold text-good">Assorti à ton CV</span>}
          </button>
        );
      })}
    </div>
  );
}
