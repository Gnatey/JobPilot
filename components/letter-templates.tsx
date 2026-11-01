"use client";
import type { ReactNode } from "react";
import type { Profile } from "@/lib/types";
import { letterDate, senderItems, type LetterParts, type LetterTemplateId } from "@/lib/letter";
import { A, E, Inline, Items } from "./cv-templates";

type Id = Profile["identity"];
export type LetterProps = { p: LetterParts; id: Id; upd: (patch: Partial<LetterParts>) => void };

/* Les six modèles de lettre reprennent l'allure des modèles de CV : un CV et sa lettre qui partent ensemble forment un ensemble.
 * Tout le texte se modifie en cliquant dessus ; « Entrée » ouvre un nouveau paragraphe, un paragraphe vidé disparaît. */

const EMPTY = "[&:empty]:before:text-gray-400 [&:empty]:before:content-['Écris_ici…'] print:[&:empty]:before:content-none";

/** Les paragraphes de la lettre. */
function Paras({ p, upd, className = "mt-[4mm]" }: LetterProps & { className?: string }) {
  return (
    <>
      {p.paragraphs.map((t, i) => (
        <E key={`${i}-${t}`} as="p" v={t} className={`${className} min-h-[1.4em] whitespace-pre-line ${EMPTY}`}
          on={(s) => {
            const parts = s.split(/\n+/).map((x) => x.trim()).filter(Boolean);
            const next = [...p.paragraphs.slice(0, i), ...parts, ...p.paragraphs.slice(i + 1)];
            upd({ paragraphs: next.length ? next : [""] });
          }} />
      ))}
    </>
  );
}

/** Formule finale, place pour la signature à la main, puis le nom. */
function Closing({ p, id, upd, className = "", nameClass = "font-bold" }: LetterProps & { className?: string; nameClass?: string }) {
  return (
    <div className={`mt-[5mm] break-inside-avoid ${className}`}>
      <E as="p" v={p.signoff} on={(s) => upd({ signoff: s })} />
      <p className={`mt-[9mm] ${nameClass}`}>{id.name}</p>
    </div>
  );
}

const Recipient = ({ p, upd, className = "" }: LetterProps & { className?: string }) => (
  <E as="p" v={p.recipient} on={(s) => upd({ recipient: s })} className={`whitespace-pre-line font-bold ${EMPTY} ${className}`} />
);
const DateLine = ({ p, upd, className = "" }: LetterProps & { className?: string }) => (
  <E as="p" v={letterDate(p.date)} on={(s) => upd({ date: s })} className={className} />
);
const Greeting = ({ p, upd, className = "mt-[6mm]" }: LetterProps & { className?: string }) => <E as="p" v={p.greeting} on={(s) => upd({ greeting: s })} className={className} />;
const Subject = ({ p, upd, className = "", labelClass = "font-bold" }: LetterProps & { className?: string; labelClass?: string }) => (
  <p className={className}><span className={labelClass}>Objet : </span><E v={p.subject} on={(s) => upd({ subject: s })} className={labelClass} /></p>
);

/* ---------- Classique : lettre à la française ---------- */
export function Classique(props: LetterProps) {
  const { p, id } = props;
  return (
    <div className="px-[5mm] pt-[3mm] font-[Georgia,'Times_New_Roman',serif] text-[11pt] leading-[1.6] text-black">
      <p className="text-[13pt] font-bold">{id.name}</p>
      {p.headline && <p className="italic">{p.headline}</p>}
      <Inline items={senderItems(id)} sep=" | " className="mt-0.5 text-[9.5pt]" />
      <div className="mt-[10mm] text-right">
        <Recipient {...props} />
        <DateLine {...props} className="mt-1" />
      </div>
      <Subject {...props} className="mt-[9mm]" />
      <Greeting {...props} />
      <Paras {...props} />
      <Closing {...props} />
    </div>
  );
}

/* ---------- Moderne : en-tête net, trait de couleur ---------- */
export function Moderne(props: LetterProps) {
  const { p, id } = props;
  return (
    <div className="px-[5mm] pt-[3mm] font-sans text-[10.8pt] leading-[1.6] text-[#1b2340]">
      <div className="border-b-2 border-[#1b2340] pb-3">
        <p className="font-display text-[22pt] font-extrabold leading-none tracking-tight">{id.name}</p>
        {p.headline && <p className="mt-1.5 text-[12pt] font-semibold text-[#3a4570]">{p.headline}</p>}
        <Items items={senderItems(id)} className="mt-2 text-[8.8pt] text-[#4a5270]" />
      </div>
      <div className="mt-[8mm] flex items-start justify-between gap-6">
        <Recipient {...props} />
        <DateLine {...props} className="text-right text-[#4a5270]" />
      </div>
      <div className="mt-[8mm] flex items-start gap-2"><span className="mt-[0.3em] h-3 w-1 shrink-0 rounded bg-[#f2b705]" /><Subject {...props} /></div>
      <Greeting {...props} />
      <Paras {...props} />
      <Closing {...props} nameClass="font-display text-[11pt] font-extrabold" />
    </div>
  );
}

/* ---------- Élégant : nom centré, filets dorés ---------- */
export function Elegant(props: LetterProps) {
  const { p, id } = props;
  return (
    <div className="px-[5mm] pt-[3mm] font-[Georgia,'Times_New_Roman',serif] text-[11pt] leading-[1.6] text-[#22201a]">
      <div className="text-center">
        <p className="text-[22pt] font-normal tracking-[0.06em] [font-variant:small-caps]">{id.name}</p>
        {p.headline && <p className="mt-0.5 text-[12pt] italic text-[#5d4a1c]">{p.headline}</p>}
        <Items items={senderItems(id)} className="mt-2 justify-center text-[8.8pt] text-[#4b4638]" />
      </div>
      <div className="mt-4 flex items-center gap-3" aria-hidden="true"><span className="h-px flex-1 bg-[#b49a5c]" /><span className="h-1.5 w-1.5 rotate-45 bg-[#b49a5c]" /><span className="h-px flex-1 bg-[#b49a5c]" /></div>
      <div className="mt-[8mm] text-right">
        <Recipient {...props} />
        <DateLine {...props} className="mt-1 italic text-[#5d4a1c]" />
      </div>
      <Subject {...props} className="mt-[8mm]" labelClass="font-bold text-[#5d4a1c]" />
      <Greeting {...props} />
      <Paras {...props} />
      <Closing {...props} className="text-right" nameClass="text-[12pt] [font-variant:small-caps] tracking-[0.06em]" />
    </div>
  );
}

/* ---------- Bandeau couleur : en-tête coloré, comme le CV ---------- */
export function Bandeau(props: LetterProps) {
  const { p, id } = props;
  return (
    <div className="font-sans text-[10.8pt] leading-[1.6] text-[#1b2330]">
      <div className="flex items-end justify-between gap-4 rounded-lg bg-[#1f3a5f] px-5 py-4 text-white">
        <div>
          <p className="font-display text-[20pt] font-extrabold leading-none">{id.name}</p>
          {p.headline && <p className="mt-1.5 text-[11.5pt] text-[#cfe0ff]">{p.headline}</p>}
        </div>
        <div className="text-right text-[8.6pt] leading-snug text-[#dbe6fb]">{senderItems(id).map((c, k) => <p key={k}><A it={c} /></p>)}</div>
      </div>
      <div className="px-[5mm]">
        <div className="mt-[8mm] flex items-start justify-between gap-6">
          <Recipient {...props} />
          <DateLine {...props} className="text-right text-[#4a5270]" />
        </div>
        <Subject {...props} className="mt-[8mm] border-b-2 border-[#1f3a5f] pb-1 text-[#1f3a5f]" />
        <Greeting {...props} />
        <Paras {...props} />
        <Closing {...props} nameClass="font-display text-[11pt] font-extrabold text-[#1f3a5f]" />
      </div>
    </div>
  );
}

/* ---------- Sobre : lisible partout (ESN, conseil, plateformes RH) ---------- */
export function Sobre(props: LetterProps) {
  const { p, id } = props;
  return (
    <div className="px-[5mm] pt-[3mm] font-[Arial,Helvetica,sans-serif] text-[10.6pt] leading-[1.55] text-black">
      <div className="flex items-end justify-between gap-4 border-b border-black pb-2">
        <div>
          <p className="text-[16pt] font-bold">{id.name}</p>
          {p.headline && <p className="text-[11pt] font-semibold">{p.headline}</p>}
        </div>
        <div className="text-right text-[8.8pt]">{senderItems(id).map((c, k) => <p key={k}><A it={c} /></p>)}</div>
      </div>
      <div className="mt-[8mm] flex items-start justify-between gap-6">
        <Recipient {...props} />
        <DateLine {...props} className="text-right" />
      </div>
      <Subject {...props} className="mt-[8mm]" />
      <Greeting {...props} />
      <Paras {...props} />
      <Closing {...props} />
    </div>
  );
}

/* ---------- Colonne : coordonnées en marge, lettre à droite ---------- */
export function Colonne(props: LetterProps) {
  const { p, id } = props;
  return (
    <div className="grid grid-cols-[46mm_1fr] gap-x-6 pt-[2mm] font-sans text-[10.4pt] leading-[1.58] text-[#1d2433]">
      <aside className="rounded-md bg-[#eef2f9] px-4 py-5 text-[#1f3a5f]">
        <p className="text-[14pt] font-bold leading-tight">{id.name}</p>
        {p.headline && <p className="mt-1 text-[10pt] font-semibold text-[#3b5278]">{p.headline}</p>}
        <div className="mt-4 space-y-1.5 text-[8.6pt] text-[#2c3e5e]">{senderItems(id).map((c, k) => <p key={k}><A it={c} wrap /></p>)}</div>
      </aside>
      <div className="min-w-0 pr-[3mm]">
        <DateLine {...props} className="text-right text-[#5b6680]" />
        <Recipient {...props} className="mt-[6mm]" />
        <Subject {...props} className="mt-[7mm] text-[#1f3a5f]" />
        <Greeting {...props} />
        <Paras {...props} />
        <Closing {...props} nameClass="font-bold text-[#1f3a5f]" />
      </div>
    </div>
  );
}

export const LETTER_COMPONENTS: Record<LetterTemplateId, (props: LetterProps) => ReactNode> = {
  classique: Classique, moderne: Moderne, elegant: Elegant, bandeau: Bandeau, sobre: Sobre, colonne: Colonne,
};

/** La lettre dans le modèle choisi (le classique si le modèle est inconnu). */
export function LetterSheet({ template, ...props }: LetterProps & { template: string }) {
  const C = LETTER_COMPONENTS[template as LetterTemplateId] ?? Classique;
  return <C {...props} />;
}
