"use client";
import { Fragment } from "react";
import type { CvDoc, Profile } from "@/lib/types";
import { contactItems, linkItems, tailLines, tailTitle, experiencesRecentFirst, educationRecentFirst, type Item } from "@/lib/cv-format";

type Id = Profile["identity"];
type Upd = (fn: (cv: CvDoc) => void) => void;

/** Texte modifiable directement sur le CV (enregistré au clic sur "Enregistrer"). */
export function E({ v, on, className, as: Tag = "span" }: { v: string; on: (s: string) => void; className?: string; as?: "span" | "p" | "h1" | "h2" | "li" | "div" }) {
  return (
    <Tag contentEditable suppressContentEditableWarning className={`outline-none focus:bg-yellow-100/60 ${className ?? ""}`}
      onBlur={(e) => { const t = (e.target as HTMLElement).innerText.trim(); if (t !== v) on(t); }}>
      {v}
    </Tag>
  );
}

/** Une coordonnée ou un lien : cliquable dans le PDF (mailto, tel, site), jamais coupé en deux au milieu. */
export function A({ it, wrap }: { it: Item; wrap?: boolean }) {
  const w = wrap ? "[overflow-wrap:anywhere]" : "whitespace-nowrap";
  return it.href
    ? <a href={it.href} target="_blank" rel="noopener noreferrer" className={`${w} underline decoration-current/30 underline-offset-2`}>{it.text}</a>
    : <span className={w}>{it.text}</span>;
}
/** Plusieurs éléments sur une ligne, séparés par de l'espace : à la ligne entre deux éléments, jamais à l'intérieur. */
export function Items({ items, className }: { items: Item[]; className?: string }) {
  if (!items.length) return null;
  return <p className={`flex flex-wrap gap-x-4 ${className ?? ""}`}>{items.map((it, i) => <A key={i} it={it} />)}</p>;
}
/** Même chose en texte continu avec un séparateur (modèle « ATS » : lecture par un logiciel). */
export function Inline({ items, sep, className }: { items: Item[]; sep: string; className?: string }) {
  if (!items.length) return null;
  return <p className={className}>{items.map((it, i) => <Fragment key={i}>{i > 0 && sep}<A it={it} /></Fragment>)}</p>;
}
/** Dates en marge : « Sept 2024 - Sept 2025 » passe sur deux lignes propres au lieu d'être coupé n'importe où. */
const splitDates = (d: string) => d.replace(/\s+[-–—]\s+/, " –\n");

/** Langues, certifications, centres d'intérêt : une ligne chacun, avec son étiquette. */
function Tail({ cv, labelClass = "font-bold", className = "mt-0.5", center }: { cv: CvDoc; labelClass?: string; className?: string; center?: boolean }) {
  return <>{tailLines(cv).map((l) => <p key={l.label} className={`${className} ${center ? "text-center" : ""}`}><span className={labelClass}>{l.label} :</span> {l.text}</p>)}</>;
}

function Bullets({ cv, upd, i, className }: { cv: CvDoc; upd: Upd; i: number; className?: string }) {
  return (
    <ul className={`${className ?? ""} space-y-[2px]`}>
      {cv.experiences[i].bullets.map((b, j) => (
        <E key={j} as="li" v={b} on={(s) => upd((c) => { c.experiences[i].bullets[j] = s; })} />
      ))}
    </ul>
  );
}

/* ---------- Classique : banque, finance, public, grands groupes ---------- */
export function Classique({ cv, id, upd }: { cv: CvDoc; id: Id; upd: Upd }) {
  const H = ({ children }: { children: React.ReactNode }) => (
    <h2 className="mt-4 border-b border-black pb-0.5 font-[Georgia,serif] text-[11.5pt] font-bold">{children}</h2>
  );
  return (
    <div className="font-[Georgia,'Times_New_Roman',serif] text-[10pt] leading-[1.38] text-black">
      <div className="text-center">
        <h1 className="text-[20pt] font-bold tracking-wide">{id.name}</h1>
        <E as="p" v={cv.headline} on={(s) => upd((c) => { c.headline = s; })} className="mt-0.5 text-[12pt]" />
        <Items items={contactItems(id)} className="mt-1.5 justify-center text-[9pt]" />
        <Items items={linkItems(id)} className="mt-0.5 justify-center text-[9pt]" />
      </div>
      <E as="p" v={cv.summary} on={(s) => upd((c) => { c.summary = s; })} className="mt-3.5" />
      <H>Expérience professionnelle</H>
      {experiencesRecentFirst(cv).map(({ x, i }) => (
        <div key={i} className="mt-2 break-inside-avoid">
          <div className="flex justify-between gap-4"><p><strong>{x.role}</strong>, {x.company}{x.location ? `, ${x.location}` : ""}</p><p className="shrink-0 italic">{x.dates}</p></div>
          <Bullets cv={cv} upd={upd} i={i} className="mt-0.5 list-disc pl-5" />
        </div>
      ))}
      <H>Formation</H>
      {educationRecentFirst(cv).map((e, i) => (
        <div key={i} className="mt-1 flex justify-between gap-4"><p><strong>{e.degree}</strong>, {e.school}</p><p className="shrink-0 italic">{e.dates}</p></div>
      ))}
      <H>Compétences</H>
      {cv.skills.map((s, i) => (
        <p key={i} className="mt-0.5"><strong>{s.label} :</strong> <E v={s.items} on={(t) => upd((c) => { c.skills[i].items = t; })} /></p>
      ))}
      {cv.projects.length > 0 && <><H>Projets</H>{cv.projects.map((p, i) => <p key={i} className="mt-0.5"><strong>{p.name} :</strong> {p.description}</p>)}</>}
      {tailLines(cv).length > 0 && <><H>{tailTitle(cv)}</H><Tail cv={cv} /></>}
    </div>
  );
}

/* ---------- Moderne : startups, tech, marketing ---------- */
export function Moderne({ cv, id, upd }: { cv: CvDoc; id: Id; upd: Upd }) {
  const H = ({ children }: { children: React.ReactNode }) => (
    <h2 className="mt-5 flex items-center gap-2 text-[11pt] font-bold text-[#1b2340]"><span className="h-3 w-1 rounded bg-[#f2b705]" />{children}</h2>
  );
  return (
    <div className="font-sans text-[9.6pt] leading-[1.45] text-[#1b2340]">
      <div className="border-b-2 border-[#1b2340] pb-3">
        <h1 className="font-display text-[24pt] font-extrabold leading-none tracking-tight">{id.name}</h1>
        <E as="p" v={cv.headline} on={(s) => upd((c) => { c.headline = s; })} className="mt-1.5 text-[12.5pt] font-semibold text-[#3a4570]" />
        <Items items={contactItems(id)} className="mt-2 text-[8.8pt] text-[#4a5270]" />
        <Items items={linkItems(id)} className="mt-0.5 text-[8.8pt] text-[#4a5270]" />
      </div>
      <E as="p" v={cv.summary} on={(s) => upd((c) => { c.summary = s; })} className="mt-3.5" />
      <H>Compétences</H>
      <div className="mt-1 grid grid-cols-[8.5rem_1fr] gap-x-3 gap-y-0.5">
        {cv.skills.map((s, i) => (
          <div key={i} className="contents"><p className="font-semibold">{s.label}</p><E as="p" v={s.items} on={(t) => upd((c) => { c.skills[i].items = t; })} /></div>
        ))}
      </div>
      <H>Expérience</H>
      {experiencesRecentFirst(cv).map(({ x, i }) => (
        <div key={i} className="mt-2 break-inside-avoid">
          <div className="flex items-baseline justify-between gap-4"><p className="font-bold">{x.role} <span className="font-normal">chez {x.company}</span></p><p className="shrink-0 text-[8.8pt] text-[#4a5270]">{x.dates}</p></div>
          <Bullets cv={cv} upd={upd} i={i} className="mt-0.5 list-disc space-y-0.5 pl-4 marker:text-[#c99400]" />
        </div>
      ))}
      {cv.projects.length > 0 && (
        <><H>Projets</H>{cv.projects.map((p, i) => <p key={i} className="mt-0.5"><span className="font-semibold">{p.name}</span> : {p.description}</p>)}</>
      )}
      <H>Formation</H>
      {educationRecentFirst(cv).map((e, i) => (
        <div key={i} className="mt-0.5 flex justify-between gap-4"><p><span className="font-semibold">{e.degree}</span>, {e.school}</p><p className="shrink-0 text-[#4a5270]">{e.dates}</p></div>
      ))}
      {tailLines(cv).length > 0 && <div className="mt-4"><Tail cv={cv} labelClass="font-semibold" /></div>}
    </div>
  );
}

/* ---------- ESN / Conseil : format dossier de compétences ---------- */
export function Esn({ cv, id, upd }: { cv: CvDoc; id: Id; upd: Upd }) {
  const H = ({ children }: { children: React.ReactNode }) => (
    <h2 className="mt-4 bg-[#1b2340] px-2 py-0.5 text-[10.5pt] font-bold text-white print:bg-[#1b2340]">{children}</h2>
  );
  return (
    <div className="font-sans text-[9.6pt] leading-[1.42] text-black">
      <div className="flex items-end justify-between gap-4 border-b border-black pb-2">
        <div>
          <h1 className="text-[18pt] font-bold">{id.name}</h1>
          <E as="p" v={cv.headline} on={(s) => upd((c) => { c.headline = s; })} className="text-[12pt] font-semibold" />
        </div>
        <div className="text-right text-[8.6pt]">{contactItems(id).map((c, k) => <p key={k}><A it={c} /></p>)}</div>
      </div>
      <E as="p" v={cv.summary} on={(s) => upd((c) => { c.summary = s; })} className="mt-2" />
      <H>Compétences clés</H>
      <table className="mt-1 w-full border-collapse text-left">
        <tbody>
          {cv.skills.map((s, i) => (
            <tr key={i} className="border-b border-gray-300 align-top">
              <th className="w-40 py-1 pr-3 font-semibold">{s.label}</th>
              <td className="py-1"><E v={s.items} on={(t) => upd((c) => { c.skills[i].items = t; })} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <H>Expériences et missions</H>
      {experiencesRecentFirst(cv).map(({ x, i }) => (
        <div key={i} className="mt-2 break-inside-avoid border-l-2 border-gray-300 pl-3">
          <p className="font-bold">{x.company} : {x.role}</p>
          <p className="text-[8.8pt] text-gray-700">{[x.dates, x.location].filter(Boolean).join(", ")}</p>
          <p className="mt-1 font-semibold">Réalisations</p>
          <Bullets cv={cv} upd={upd} i={i} className="list-disc pl-5" />
        </div>
      ))}
      {cv.projects.length > 0 && <><H>Projets</H>{cv.projects.map((p, i) => <p key={i} className="mt-0.5"><strong>{p.name} :</strong> {p.description}</p>)}</>}
      <H>Formation, langues, certifications</H>
      {educationRecentFirst(cv).map((e, i) => <p key={i} className="mt-0.5"><strong>{e.dates}</strong> : {e.degree}, {e.school}</p>)}
      <Tail cv={cv} className="mt-0.5" />
      <Items items={linkItems(id)} className="mt-2 text-[8.6pt]" />
    </div>
  );
}

/* ---------- Compact : priorité ATS ---------- */
export function Compact({ cv, id, upd }: { cv: CvDoc; id: Id; upd: Upd }) {
  const H = ({ children }: { children: React.ReactNode }) => <h2 className="mt-3 text-[10.5pt] font-bold underline underline-offset-2">{children}</h2>;
  return (
    <div className="font-[Arial,Helvetica,sans-serif] text-[9.6pt] leading-[1.35] text-black">
      <h1 className="text-[16pt] font-bold">{id.name}</h1>
      <E as="p" v={cv.headline} on={(s) => upd((c) => { c.headline = s; })} className="text-[11pt] font-bold" />
      <Inline items={[...contactItems(id), ...linkItems(id)]} sep=" | " />
      <H>Profil</H>
      <E as="p" v={cv.summary} on={(s) => upd((c) => { c.summary = s; })} />
      <H>Compétences</H>
      {cv.skills.map((s, i) => <p key={i}><b>{s.label} :</b> <E v={s.items} on={(t) => upd((c) => { c.skills[i].items = t; })} /></p>)}
      <H>Expérience professionnelle</H>
      {experiencesRecentFirst(cv).map(({ x, i }) => (
        <div key={i} className="mt-1.5">
          <p><b>{x.role}</b> | {x.company}{x.location ? ` | ${x.location}` : ""} | {x.dates}</p>
          <Bullets cv={cv} upd={upd} i={i} className="list-disc pl-5" />
        </div>
      ))}
      <H>Formation</H>
      {educationRecentFirst(cv).map((e, i) => <p key={i}><b>{e.degree}</b> | {e.school} | {e.dates}</p>)}
      {cv.projects.length > 0 && <><H>Projets</H>{cv.projects.map((p, i) => <p key={i}><b>{p.name} :</b> {p.description}</p>)}</>}
      {tailLines(cv).length > 0 && <><H>{tailTitle(cv)}</H><Tail cv={cv} className="" /></>}
    </div>
  );
}

/* ---------- Deux colonnes : PME, industrie, commerce ---------- */
export function Colonnes({ cv, id, upd }: { cv: CvDoc; id: Id; upd: Upd }) {
  const Side = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="mt-3.5 first:mt-0">
      <h2 className="text-[8.6pt] font-bold uppercase tracking-[0.1em] text-[#1f3a5f]">{title}</h2>
      <div className="mt-1 space-y-0.5 break-words">{children}</div>
    </div>
  );
  const H = ({ children }: { children: React.ReactNode }) => (
    <h2 className="mt-4 border-b border-[#c3cde0] pb-0.5 text-[11pt] font-bold text-[#1f3a5f] first:mt-0">{children}</h2>
  );
  return (
    <div className="font-sans text-[9.4pt] leading-[1.42] text-[#1d2433]">
      <div className="mb-3">
        <h1 className="font-display text-[23pt] font-extrabold leading-none text-[#1f3a5f]">{id.name}</h1>
        <E as="p" v={cv.headline} on={(s) => upd((c) => { c.headline = s; })} className="mt-1 text-[12pt] font-semibold text-[#4a5a78]" />
      </div>
      <div className="grid grid-cols-[52mm_1fr] gap-x-5">
        <aside className="self-start rounded-md bg-[#eef2f8] p-3 text-[8.8pt]">
          <Side title="Contact">{contactItems(id).map((c, k) => <p key={k}><A it={c} wrap /></p>)}</Side>
          {linkItems(id).length > 0 && <Side title="Liens">{linkItems(id).map((l, k) => <p key={k}><A it={l} wrap /></p>)}</Side>}
          <Side title="Compétences">
            {cv.skills.map((s, i) => (
              <p key={i} className="mt-1 first:mt-0"><span className="font-semibold">{s.label}</span><br /><E v={s.items} on={(t) => upd((c) => { c.skills[i].items = t; })} /></p>
            ))}
          </Side>
          {cv.languages && <Side title="Langues"><p>{cv.languages}</p></Side>}
          {cv.certifications.length > 0 && <Side title="Certifications">{cv.certifications.map((c) => <p key={c}>{c.replace(/\s*:\s*/, " – ")}</p>)}</Side>}
          {cv.extras && <Side title="Intérêts"><p>{cv.extras}</p></Side>}
        </aside>
        <div>
          <H>Profil</H>
          <E as="p" v={cv.summary} on={(s) => upd((c) => { c.summary = s; })} className="mt-1" />
          <H>Expérience</H>
          {experiencesRecentFirst(cv).map(({ x, i }) => (
            <div key={i} className="mt-2 break-inside-avoid">
              <div className="flex items-baseline justify-between gap-3"><p className="font-bold">{x.role}</p><p className="shrink-0 text-[8.6pt] text-[#5b6680]">{x.dates}</p></div>
              <p className="text-[#4a5a78]">{[x.company, x.location].filter(Boolean).join(", ")}</p>
              <Bullets cv={cv} upd={upd} i={i} className="mt-0.5 list-disc pl-4 marker:text-[#1f3a5f]" />
            </div>
          ))}
          <H>Formation</H>
          {educationRecentFirst(cv).map((e, i) => (
            <div key={i} className="mt-1 flex items-baseline justify-between gap-3"><p><span className="font-semibold">{e.degree}</span>, {e.school}</p><p className="shrink-0 text-[8.6pt] text-[#5b6680]">{e.dates}</p></div>
          ))}
          {cv.projects.length > 0 && <><H>Projets</H>{cv.projects.map((p, i) => <p key={i} className="mt-1"><span className="font-semibold">{p.name} :</span> {p.description}</p>)}</>}
        </div>
      </div>
    </div>
  );
}

/* ---------- Chronologique : dates en marge, parcours long ou reconversion ---------- */
export function Timeline({ cv, id, upd }: { cv: CvDoc; id: Id; upd: Upd }) {
  const Row = ({ left, children }: { left: React.ReactNode; children: React.ReactNode }) => (
    <div className="mt-2 grid break-inside-avoid grid-cols-[25mm_1fr] gap-x-3">
      <div className="whitespace-pre-line pt-0.5 text-right text-[8.6pt] leading-tight text-[#5b6680]">{left}</div>
      <div className="border-l-2 border-[#b9c6de] pl-3.5">{children}</div>
    </div>
  );
  const H = ({ children }: { children: React.ReactNode }) => (
    <div className="mt-4 grid grid-cols-[25mm_1fr] gap-x-3"><span /><h2 className="pl-3.5 text-[11.5pt] font-bold text-[#1f3a5f]">{children}</h2></div>
  );
  return (
    <div className="font-sans text-[9.5pt] leading-[1.42] text-[#1d2433]">
      <div className="grid grid-cols-[25mm_1fr] gap-x-3">
        <span />
        <div className="pl-3.5">
          <h1 className="font-display text-[23pt] font-extrabold leading-none text-[#1f3a5f]">{id.name}</h1>
          <E as="p" v={cv.headline} on={(s) => upd((c) => { c.headline = s; })} className="mt-1 text-[12pt] font-semibold text-[#4a5a78]" />
          <Items items={contactItems(id)} className="mt-2 text-[8.8pt] text-[#4a5270]" />
          <Items items={linkItems(id)} className="mt-0.5 text-[8.8pt] text-[#4a5270]" />
        </div>
      </div>
      <Row left="Profil"><E as="p" v={cv.summary} on={(s) => upd((c) => { c.summary = s; })} /></Row>
      <H>Expérience</H>
      {experiencesRecentFirst(cv).map(({ x, i }) => (
        <Row key={i} left={splitDates(x.dates)}>
          <p><span className="font-bold">{x.role}</span>, {[x.company, x.location].filter(Boolean).join(", ")}</p>
          <Bullets cv={cv} upd={upd} i={i} className="mt-0.5 list-disc pl-4 marker:text-[#1f3a5f]" />
        </Row>
      ))}
      <H>Formation</H>
      {educationRecentFirst(cv).map((e, i) => <Row key={i} left={splitDates(e.dates)}><p><span className="font-semibold">{e.degree}</span>, {e.school}</p></Row>)}
      <H>Compétences</H>
      {cv.skills.map((s, i) => <Row key={i} left={s.label}><E as="p" v={s.items} on={(t) => upd((c) => { c.skills[i].items = t; })} /></Row>)}
      {cv.projects.length > 0 && <><H>Projets</H>{cv.projects.map((p, i) => <Row key={i} left={p.name}><p>{p.description}</p></Row>)}</>}
      {tailLines(cv).map((l) => <Row key={l.label} left={l.label}><p>{l.text}</p></Row>)}
    </div>
  );
}

/* ---------- Élégant : serif, filets dorés, luxe, communication, culture ---------- */
export function Elegant({ cv, id, upd }: { cv: CvDoc; id: Id; upd: Upd }) {
  const H = ({ children }: { children: React.ReactNode }) => (
    <div className="mt-4 flex items-center gap-3"><span className="h-px flex-1 bg-[#b49a5c]" /><h2 className="text-[9.6pt] font-bold uppercase tracking-[0.2em] text-[#5d4a1c]">{children}</h2><span className="h-px flex-1 bg-[#b49a5c]" /></div>
  );
  return (
    <div className="font-[Georgia,'Times_New_Roman',serif] text-[10pt] leading-[1.42] text-[#22201a]">
      <div className="text-center">
        <h1 className="text-[24pt] font-normal tracking-[0.06em] [font-variant:small-caps]">{id.name}</h1>
        <E as="p" v={cv.headline} on={(s) => upd((c) => { c.headline = s; })} className="mt-0.5 text-[12pt] italic text-[#5d4a1c]" />
        <Items items={contactItems(id)} className="mt-2 justify-center text-[8.8pt] text-[#4b4638]" />
        <Items items={linkItems(id)} className="mt-0.5 justify-center text-[8.8pt] text-[#4b4638]" />
      </div>
      <E as="p" v={cv.summary} on={(s) => upd((c) => { c.summary = s; })} className="mt-3 text-center italic" />
      <H>Expérience</H>
      {experiencesRecentFirst(cv).map(({ x, i }) => (
        <div key={i} className="mt-2 break-inside-avoid">
          <div className="flex items-baseline justify-between gap-4"><p><span className="font-bold">{x.role}</span> <span className="italic">· {x.company}{x.location ? `, ${x.location}` : ""}</span></p><p className="shrink-0 text-[9pt] italic text-[#5d4a1c]">{x.dates}</p></div>
          <Bullets cv={cv} upd={upd} i={i} className="mt-0.5 list-disc pl-5 marker:text-[#b49a5c]" />
        </div>
      ))}
      <H>Formation</H>
      {educationRecentFirst(cv).map((e, i) => (
        <div key={i} className="mt-1 flex items-baseline justify-between gap-4"><p><span className="font-bold">{e.degree}</span>, {e.school}</p><p className="shrink-0 text-[9pt] italic text-[#5d4a1c]">{e.dates}</p></div>
      ))}
      <H>Compétences</H>
      {cv.skills.map((s, i) => <p key={i} className="mt-0.5"><span className="font-bold">{s.label} :</span> <E v={s.items} on={(t) => upd((c) => { c.skills[i].items = t; })} /></p>)}
      {cv.projects.length > 0 && <><H>Projets</H>{cv.projects.map((p, i) => <p key={i} className="mt-0.5"><span className="font-bold">{p.name} :</span> {p.description}</p>)}</>}
      {tailLines(cv).length > 0 && <><H>{tailTitle(cv)}</H><Tail cv={cv} center /></>}
    </div>
  );
}

/* ---------- Bandeau : en-tête coloré, compétences en pastilles (marketing, e-commerce, design) ---------- */
export function Bandeau({ cv, id, upd }: { cv: CvDoc; id: Id; upd: Upd }) {
  const H = ({ children }: { children: React.ReactNode }) => (
    <h2 className="mt-4 border-b-2 border-[#1f3a5f] pb-0.5 text-[10.8pt] font-bold text-[#1f3a5f]">{children}</h2>
  );
  return (
    <div className="font-sans text-[9.6pt] leading-[1.42] text-[#1b2330]">
      <div className="flex items-end justify-between gap-4 rounded-lg bg-[#1f3a5f] px-5 py-4 text-white">
        <div>
          <h1 className="font-display text-[22pt] font-extrabold leading-none">{id.name}</h1>
          <E as="p" v={cv.headline} on={(s) => upd((c) => { c.headline = s; })} className="mt-1.5 text-[12pt] text-[#cfe0ff]" />
        </div>
        <div className="text-right text-[8.6pt] leading-snug text-[#dbe6fb]">{contactItems(id).map((c, k) => <p key={k}><A it={c} /></p>)}</div>
      </div>
      <Items items={linkItems(id)} className="mt-2 text-[8.6pt] text-[#4a5270]" />
      <E as="p" v={cv.summary} on={(s) => upd((c) => { c.summary = s; })} className="mt-2.5" />
      <H>Compétences</H>
      <div className="mt-1.5 space-y-1">
        {cv.skills.map((s, i) => (
          <div key={i} className="flex items-baseline gap-2">
            <span className="shrink-0 rounded-full bg-[#e3ebf8] px-2 py-0.5 text-[8.6pt] font-semibold text-[#1f3a5f]">{s.label}</span>
            <E v={s.items} on={(t) => upd((c) => { c.skills[i].items = t; })} />
          </div>
        ))}
      </div>
      <H>Expérience</H>
      {experiencesRecentFirst(cv).map(({ x, i }) => (
        <div key={i} className="mt-2 break-inside-avoid">
          <div className="flex items-baseline justify-between gap-4"><p><span className="font-bold">{x.role}</span> <span className="text-[#4a5a78]">· {x.company}{x.location ? `, ${x.location}` : ""}</span></p><p className="shrink-0 text-[8.8pt] text-[#4a5270]">{x.dates}</p></div>
          <Bullets cv={cv} upd={upd} i={i} className="mt-0.5 list-disc pl-4 marker:text-[#1f3a5f]" />
        </div>
      ))}
      <H>Formation</H>
      {educationRecentFirst(cv).map((e, i) => (
        <div key={i} className="mt-1 flex items-baseline justify-between gap-4"><p><span className="font-semibold">{e.degree}</span>, {e.school}</p><p className="shrink-0 text-[8.8pt] text-[#4a5270]">{e.dates}</p></div>
      ))}
      {cv.projects.length > 0 && <><H>Projets</H>{cv.projects.map((p, i) => <p key={i} className="mt-1"><span className="font-semibold">{p.name} :</span> {p.description}</p>)}</>}
      {tailLines(cv).length > 0 && <div className="mt-4"><Tail cv={cv} labelClass="font-semibold" /></div>}
    </div>
  );
}

export const CV_TEMPLATES = { classique: Classique, moderne: Moderne, esn: Esn, compact: Compact, colonnes: Colonnes, timeline: Timeline, elegant: Elegant, bandeau: Bandeau } as const;
