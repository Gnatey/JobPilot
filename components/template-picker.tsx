"use client";
import { CV_TEMPLATES } from "./cv-templates";
import { TEMPLATES, type CvDoc, type Profile } from "@/lib/types";

const noop = () => {};
// Une page A4 imprimée fait 182 mm de large (210 mm moins les marges) ; l'aperçu la réduit pour tenir dans une vignette de 88 px.
const PAGE_PX = (182 * 96) / 25.4;
const THUMB_W = 88;
const SCALE = THUMB_W / PAGE_PX;

/** Choix du modèle de CV : chaque vignette est le vrai CV, rendu dans ce modèle, pour voir la différence au lieu de la deviner. */
export function TemplatePicker({ value, onChange, cv, identity, recommended }: {
  value: string; onChange: (id: string) => void; cv: CvDoc; identity: Profile["identity"]; recommended?: string | null;
}) {
  return (
    <div role="radiogroup" aria-label="Modèle de CV" className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2 pt-1">
      {TEMPLATES.map((t) => {
        const Tpl = CV_TEMPLATES[t.id];
        const on = value === t.id;
        return (
          <button key={t.id} type="button" role="radio" aria-checked={on} onClick={() => onChange(t.id)} title={t.for}
            className={`group w-[104px] shrink-0 snap-start rounded-xl border p-2 text-left transition-colors ${on ? "border-ink bg-surface shadow-sm ring-2 ring-marigold" : "border-line bg-surface hover:border-ink/40"}`}>
            <span className="relative block overflow-hidden rounded-md border border-line bg-white" style={{ width: THUMB_W, height: Math.round(THUMB_W * 1.38) }} aria-hidden="true">
              <span inert className="pointer-events-none block origin-top-left select-none text-black" style={{ width: PAGE_PX, transform: `scale(${SCALE})` }}>
                <Tpl cv={cv} id={identity} upd={noop} />
              </span>
            </span>
            <span className="mt-1.5 block text-[0.8rem] font-semibold leading-tight">{t.label}</span>
            {recommended === t.id && <span className="mt-0.5 block text-[0.68rem] font-semibold text-good">Conseillé pour cette offre</span>}
          </button>
        );
      })}
    </div>
  );
}
