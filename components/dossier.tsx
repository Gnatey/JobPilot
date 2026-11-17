"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarClock, ExternalLink, FileText, Flag, Mail, Pencil, Phone, Plus, Search, Trash2, Users, X, AlertTriangle, Ban } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useFeedback } from "@/components/ui/feedback";
import { ScorePill } from "@/components/ui/score";
import { FollowupButton } from "@/components/followup-button";
import { MarkSentButton } from "@/components/app-actions";
import { ReasonChips } from "@/components/reason-chips";
import { refreshBadges } from "@/components/nav";
import { STATUSES, CHANNELS, statusLabel, type Application, type StatusId } from "@/lib/types";
import { canDraftFollowup, followupOn, isFollowupStatus } from "@/lib/followup";
import { fmtDate } from "@/lib/format";
import {
  CV_VARIANTS, DETAIL_LABEL, ENTRY_LABEL, INTERVIEW_LABEL, LEGACY_ID, allInterviews, buildJournal, cleanDetail, focusOf, groupByDay, interviewState, matchesQuery, needsSync, statusPatch, timeOf,
  type DetailKey, type Entry, type EntryInput, type EntryKind, type InterviewKind, type JournalItem,
} from "@/lib/dossier";
import { addEntry, deleteEntry, loadDossier, syncIfNeeded, updateEntry, writeApplication, type DossierData, type EntryResult } from "@/lib/dossier-db";

type View = "chrono" | "rubriques";
type Tab = "journal" | "details" | "documents";
type Preset = { kind: EntryKind; entry?: Entry };

/** ISO → valeur d'un champ datetime-local (heure locale du navigateur). */
const toLocalInput = (iso?: string | null) => {
  if (!iso || !Number.isFinite(Date.parse(iso))) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : "");
const FOLLOWUP_NOTE = "2 semaines";
const dateOf = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Paris" });
const longDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

const RAIL: Record<JournalItem["type"], string> = {
  interview: "bg-marigold/25 text-marigold-deep",
  email: "bg-sky/15 text-sky",
  gmail: "bg-sky/15 text-sky",
  note: "bg-line/70 text-ink",
  text: "bg-line/70 text-ink",
  doc: "bg-good/15 text-good",
  status: "bg-line/70 text-muted",
};
function RailIcon({ it }: { it: JournalItem }) {
  const p = { size: 17, "aria-hidden": true } as const;
  if (it.type === "interview") return it.entry?.interview_kind === "contact" ? <Phone {...p} /> : <Users {...p} />;
  if (it.type === "email" || it.type === "gmail") return <Mail {...p} />;
  if (it.type === "note") return <Pencil {...p} />;
  if (it.type === "status") return <Flag {...p} />;
  return <FileText {...p} />;
}

/** Texte long replié sur trois lignes, avec « Voir tout ». */
function Quote({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 220 || text.split("\n").length > 3;
  return (
    <div className="mt-2">
      <p className={`whitespace-pre-wrap break-words border-l-[3px] border-line pl-3.5 ${long && !open ? "line-clamp-3" : ""}`}>{text}</p>
      {long && <button type="button" className="hit mt-1 text-sm font-semibold text-sky" aria-expanded={open} onClick={() => setOpen((v) => !v)}>{open ? "Réduire" : "Voir tout"}</button>}
    </div>
  );
}

/** Le contenu d'une ligne du journal : titre, heure, mention, texte. */
function ItemContent({ it, onEdit }: { it: JournalItem; onEdit: (e: Entry) => void }) {
  const inner = (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
      <strong className="min-w-0 flex-1 basis-48 break-words font-semibold">{it.title}</strong>
      <span className="shrink-0 text-sm text-muted">{timeOf(it.at)}{it.upcoming ? " · à venir" : ""}</span>
      {it.entry && <button type="button" className="hit shrink-0 text-sm font-semibold text-muted hover:text-ink" onClick={() => onEdit(it.entry!)} aria-label={`Modifier : ${it.title}`}><Pencil size={14} className="mr-1 inline" aria-hidden />Modifier</button>}
    </div>
  );
  return (
    <>
      {it.href ? <Link href={it.href} className="block hover:underline">{inner}</Link> : inner}
      {it.sub && <p className="text-sm text-muted">{it.sub}</p>}
      {it.badge && <span className="tag tag-warn mt-2 !text-[0.8rem]">{it.badge}</span>}
      {it.body && <Quote text={it.body} />}
    </>
  );
}

function Timeline({ items, onEdit }: { items: JournalItem[]; onEdit: (e: Entry) => void }) {
  const groups = useMemo(() => groupByDay(items), [items]);
  return (
    <div>
      {groups.map((g) => (
        <section key={g.day} aria-label={g.label}>
          <h2 className="mb-3 mt-6 text-sm font-bold text-muted first:mt-2">{g.label}</h2>
          <ol>
            {g.items.map((it, i) => (
              <li key={it.key} className="flex gap-3.5 md:gap-[18px]">
                <div className="flex w-[34px] shrink-0 flex-col items-center md:w-[38px]">
                  <span className={`grid h-[34px] w-[34px] place-items-center rounded-full md:h-[38px] md:w-[38px] ${RAIL[it.type]}`}><RailIcon it={it} /></span>
                  {i < g.items.length - 1 && <span className="my-1.5 min-h-4 w-0.5 flex-1 bg-line" aria-hidden />}
                </div>
                <div className={`min-w-0 flex-1 pt-1 ${i < g.items.length - 1 ? "pb-6" : "pb-3"}`}><ItemContent it={it} onEdit={onEdit} /></div>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

function Rubriques({ items, onEdit, onAdd }: { items: JournalItem[]; onEdit: (e: Entry) => void; onAdd: (k: EntryKind) => void }) {
  const sections: { id: string; label: string; add: string; kind: EntryKind; empty: string; list: JournalItem[] }[] = [
    { id: "interview", label: "Entretiens", add: "Ajouter un entretien", kind: "interview", empty: "Aucun entretien noté. Un simple appel se note aussi : « Contact ou téléphone » ne lance pas de relance.", list: items.filter((i) => i.type === "interview") },
    { id: "mail", label: "E-mails", add: "Coller un e-mail", kind: "email", empty: "Colle ici un e-mail que tu as reçu ou envoyé : il est daté et gardé dans le dossier. Les réponses lues dans Gmail apparaissent aussi.", list: items.filter((i) => i.type === "email" || i.type === "gmail") },
    { id: "note", label: "Notes", add: "Ajouter une note", kind: "note", empty: "Une idée, un nom, une question à poser : écris-la ici.", list: items.filter((i) => i.type === "note") },
    { id: "text", label: "Textes", add: "Ajouter un texte", kind: "text", empty: "Colle ici ce qui ne rentre pas ailleurs : une description de poste, un message LinkedIn, un compte rendu. Chaque texte est daté.", list: items.filter((i) => i.type === "text") },
  ];
  return (
    <div className="mt-5 space-y-4">
      {sections.map((s) => (
        <section key={s.id} aria-labelledby={`rub-${s.id}`} className="card px-5 py-4 md:px-6 md:py-5">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 id={`rub-${s.id}`} className="heading text-lg">{s.label}</h2>
            <span className="tag">{s.list.length}</span>
            <span className="flex-1" />
            <button type="button" className="btn btn-sm" onClick={() => onAdd(s.kind)}><Plus size={14} /> {s.add}</button>
          </div>
          {s.list.length === 0 ? (
            <p className="mt-3 rounded-2xl border border-dashed border-line p-4 text-muted">{s.empty}</p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {s.list.map((it) => (
                <li key={it.key} className="py-3 first:pt-0 last:pb-0">
                  <p className="mb-0.5 text-xs font-semibold text-muted">{dateOf(it.at)}</p>
                  <ItemContent it={it} onEdit={onEdit} />
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

// ---------- Détails modifiables sur place ----------

type RowSpec = { key: DetailKey; input: "text" | "date" | "select" | "url" | "multiline" };
const ROWS: RowSpec[] = [
  { key: "title", input: "text" }, { key: "company", input: "text" }, { key: "applied_at", input: "date" }, { key: "next_action_at", input: "date" },
  { key: "location", input: "text" }, { key: "contract", input: "text" }, { key: "salary", input: "text" }, { key: "channel", input: "select" },
  { key: "contact", input: "text" }, { key: "url", input: "url" }, { key: "cv_variant", input: "select" }, { key: "notes", input: "multiline" },
];

function DetailRow({ spec, app, followDay, onSave }: { spec: RowSpec; app: Application; followDay: string | null; onSave: (k: DetailKey, v: string) => Promise<string | null> }) {
  const { key, input } = spec;
  const raw = (app[key] ?? "") as string;
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(raw);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const label = DETAIL_LABEL[key];
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement & HTMLSelectElement>(null);
  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);
  useEffect(() => { if (!editing) setVal(raw); }, [raw, editing]);

  async function commit(v: string) {
    if (busy) return;
    setBusy(true);
    const e = await onSave(key, v);
    setBusy(false);
    if (e) return setErr(e);
    setErr(null);
    setEditing(false);
  }
  function cancel() { setVal(raw); setErr(null); setEditing(false); }

  let shown: React.ReactNode = raw;
  if (key === "applied_at" || key === "next_action_at") shown = raw ? longDate(raw) : "";
  if (key === "next_action_at" && !raw && followDay) shown = <span className="text-muted">par défaut le {fmtDate(followDay)}</span>;
  if (key === "cv_variant") shown = CV_VARIANTS.find(([id]) => id === raw)?.[1] ?? raw;
  if (key === "url" && raw) { try { shown = new URL(raw).hostname.replace(/^www\./, ""); } catch { shown = raw; } }
  const empty = !shown;

  if (editing) {
    const common = { ref, "aria-label": label, className: "field mt-1", disabled: busy, onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); cancel(); } } } as const;
    return (
      <div className="border-b border-line/70 py-2.5">
        <label className="label" htmlFor={`d-${key}`}>{label}</label>
        {input === "select" ? (
          <select {...common} id={`d-${key}`} value={val} onChange={(e) => { setVal(e.target.value); void commit(e.target.value); }} onBlur={() => !busy && cancel()}>
            {key === "channel" ? <>{!val && <option value="" disabled>Choisis…</option>}{CHANNELS.map((c) => <option key={c}>{c}</option>)}</> : <><option value="">—</option>{CV_VARIANTS.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</>}
          </select>
        ) : input === "multiline" ? (
          <textarea {...common} id={`d-${key}`} rows={5} value={val} onChange={(e) => setVal(e.target.value)} onBlur={() => void commit(val)} onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); cancel(); } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void commit(val); }} />
        ) : (
          <input {...common} id={`d-${key}`} type={input === "date" ? "date" : input === "url" ? "url" : "text"} value={val} onChange={(e) => setVal(e.target.value)} onBlur={() => void commit(val)}
            onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); cancel(); } else if (e.key === "Enter") { e.preventDefault(); void commit(val); } }} />
        )}
        <p className="mt-1 text-xs text-muted">{input === "multiline" ? "Clique ailleurs pour enregistrer, Échap pour annuler." : "Entrée pour enregistrer, Échap pour annuler."}</p>
        {err && <p role="alert" className="mt-1 text-sm text-bad">{err}</p>}
      </div>
    );
  }
  return (
    <div className="border-b border-line/70 last:border-b-0">
      <div className="flex items-baseline gap-2">
        <button type="button" onClick={() => setEditing(true)} className="hit flex min-h-11 min-w-0 flex-1 items-baseline gap-3 py-2.5 text-left" aria-label={`${label} : ${empty ? "vide" : typeof shown === "string" ? shown : raw}. Modifier`}>
          <span className="w-24 shrink-0 text-muted">{label}</span>
          {empty ? <span className="text-muted">+ Ajouter</span> : <span className={`min-w-0 break-words ${key === "notes" ? "line-clamp-3 whitespace-pre-wrap" : ""}`}>{shown}</span>}
        </button>
        {key === "url" && raw && /^https?:\/\//i.test(raw) && <a href={raw} target="_blank" rel="noreferrer noopener" className="hit shrink-0 text-muted hover:text-ink" aria-label="Ouvrir l'annonce (s'ouvre dans un nouvel onglet)"><ExternalLink size={15} aria-hidden /></a>}
      </div>
      {err && <p role="alert" className="pb-2 text-sm text-bad">{err}</p>}
    </div>
  );
}

// ---------- Ajouter / modifier un élément ----------

const KINDS: EntryKind[] = ["note", "email", "interview", "text"];
const KIND_BUTTON: Record<EntryKind, string> = { note: "Note", email: "E-mail", interview: "Entretien", text: "Texte" };

function Composer({ preset, onClose, onSubmit, onDelete }: { preset: Preset; onClose: () => void; onSubmit: (input: EntryInput, editing: Entry | null) => Promise<string | null>; onDelete: (e: Entry) => void }) {
  const editing = preset.entry ?? null;
  const [kind, setKind] = useState<EntryKind>(preset.kind);
  const [title, setTitle] = useState(editing?.title ?? "");
  const [body, setBody] = useState(editing?.body ?? "");
  const [at, setAt] = useState(() => toLocalInput(editing?.at) || (preset.kind === "email" || preset.kind === "text" ? toLocalInput(new Date().toISOString()) : ""));
  const [ik, setIk] = useState<InterviewKind>(editing?.interview_kind ?? "entretien");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const first = useRef<HTMLTextAreaElement>(null);
  const when = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    (kind === "interview" ? when.current : first.current)?.focus();
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pick(k: EntryKind) {
    setKind(k);
    setErr(null);
    // « Reçu le » et « Daté du » : maintenant par défaut ; un entretien se date toujours à la main
    if (!at && (k === "email" || k === "text")) setAt(toLocalInput(new Date().toISOString()));
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    const message = await onSubmit({ kind, title, body, at: fromLocalInput(at), interview_kind: kind === "interview" ? ik : null }, editing);
    setBusy(false);
    if (message) setErr(message);
  }

  const heading = editing ? `Modifier : ${ENTRY_LABEL[editing.kind].toLowerCase()}` : "Ajouter au dossier";
  const dateLabel = kind === "interview" ? "Date et heure" : kind === "email" ? "Reçu le" : "Daté du";
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/45 md:items-center md:justify-center md:p-4" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={heading}
        className="flex max-h-[92vh] w-full flex-col overflow-y-auto rounded-t-3xl bg-surface p-4 pb-5 shadow-2xl md:max-w-xl md:rounded-3xl md:p-6" style={{ animation: "toast-in .2s ease-out both" }}>
        <div className="mx-auto mb-1 h-1 w-10 rounded-full bg-line md:hidden" aria-hidden />
        <div className="flex items-center">
          <h2 className="display flex-1 text-2xl">{heading}</h2>
          <button type="button" className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Fermer"><X size={20} /></button>
        </div>

        {!editing && (
          <div role="group" aria-label="Type d'élément" className="mt-2 flex flex-wrap gap-1.5">
            {KINDS.map((k) => <button key={k} type="button" className="chip flex-1" aria-pressed={kind === k} onClick={() => pick(k)}>{KIND_BUTTON[k]}</button>)}
          </div>
        )}

        {kind === "interview" && (
          <fieldset className="mt-4">
            <legend className="label">Type</legend>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {(["contact", "entretien"] as const).map((v) => <button key={v} type="button" className="chip" aria-pressed={ik === v} onClick={() => setIk(v)}>{INTERVIEW_LABEL[v]}</button>)}
            </div>
            <p className="mt-2 text-sm text-muted">{ik === "contact" ? "Un premier appel ou un échange avec un recruteur. Ne lance pas la relance." : `Un vrai entretien. Sans réponse de l'entreprise, JobPilot te propose de relancer ${FOLLOWUP_NOTE} après.`}</p>
          </fieldset>
        )}

        {(kind === "interview" || kind === "text") && (
          <label className="mt-4 block"><span className="label">Titre<span className="ml-1.5 text-xs font-normal text-muted">facultatif</span></span>
            <input className="field mt-1" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder={kind === "interview" ? "Premier contact téléphonique" : "Description du poste"} /></label>
        )}

        {kind !== "interview" ? (
          <label className="mt-4 block"><span className="label">{kind === "email" ? "Texte de l'e-mail" : kind === "note" ? "Ta note" : "Le texte"}</span>
            <textarea ref={first} required rows={kind === "note" ? 5 : 8} className="field mt-1 resize-y" value={body} onChange={(e) => setBody(e.target.value)}
              placeholder={kind === "email" ? "Colle l'e-mail ici. Le titre est pris sur la ligne « Objet : »." : kind === "note" ? "À préparer avant l'appel…" : "Colle ou écris le texte ici."} /></label>
        ) : (
          <label className="mt-4 block"><span className="label">Compte rendu ou à préparer<span className="ml-1.5 text-xs font-normal text-muted">facultatif</span></span>
            <textarea ref={first} rows={4} className="field mt-1 resize-y" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Lien de visio, nom de la personne, ce qui s'est dit…" /></label>
        )}
        {body.length > 0 && kind !== "interview" && <p className="mt-1 text-xs text-muted">Texte collé : {body.length.toLocaleString("fr-FR")} signes. Il reste ici, il n'est envoyé à aucune IA.</p>}

        <label className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1"><span className="label">{dateLabel}{kind === "interview" ? "" : <span className="ml-1.5 text-xs font-normal text-muted">maintenant par défaut</span>}</span>
          <input ref={when} type="datetime-local" required={kind === "interview"} className="field !w-auto min-w-0 flex-1" value={at} onChange={(e) => setAt(e.target.value)} aria-label={dateLabel} /></label>

        {err && <p role="alert" className="mt-4 rounded-xl bg-bad/10 p-3 text-sm text-bad">{err}</p>}
        <div className="mt-5 flex flex-wrap gap-2">
          <button className="btn btn-primary min-h-11 flex-1" disabled={busy}>{busy ? "Enregistrement…" : editing ? "Enregistrer" : "Ajouter au dossier"}</button>
          {editing && <button type="button" className="btn btn-danger" onClick={() => onDelete(editing)} aria-label="Supprimer cet élément"><Trash2 size={16} /></button>}
          <button type="button" className="btn btn-ghost" onClick={onClose}>Annuler</button>
        </div>
      </form>
    </div>
  );
}

// ---------- Carte « prochaine étape » ----------

function NextStep({ focus, app, view, onAdd }: { focus: ReturnType<typeof focusOf>; app: Application; view: Application; onAdd: () => void }) {
  const late = focus.tone === "late";
  return (
    <section aria-label="Prochaine étape" className={`rounded-3xl border p-4 lg:p-5 ${late ? "border-bad/40 bg-bad/10" : "border-marigold/45 bg-marigold/10"}`}>
      <p className={`flex items-center gap-2 text-sm font-semibold ${late ? "text-bad" : "text-marigold-deep"}`}><CalendarClock size={16} aria-hidden /> Prochaine étape</p>
      <p className="display mt-1.5 text-xl leading-tight lg:mt-2 lg:text-2xl">{focus.heading}</p>
      <p className="mt-1 text-muted lg:mt-1.5">{focus.sub}</p>
      {focus.hint && <p className="mt-2.5 text-sm text-muted">{focus.hint}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {late && canDraftFollowup(view) && <FollowupButton id={app.id} contact={app.contact} compact />}
        {focus.canAdd && <button type="button" className="btn btn-sm" onClick={onAdd}><Plus size={14} /> Ajouter un entretien</button>}
      </div>
    </section>
  );
}

// ---------- Le dossier ----------

export function Dossier({ initial }: { initial: DossierData }) {
  const sb = useMemo(() => supabaseBrowser(), []);
  const router = useRouter();
  const { toast, confirm } = useFeedback();
  const [data, setData] = useState(initial);
  const { app, entries, docs, history, emails, entriesReady, unread } = data;
  const [view, setView] = useState<View>("chrono");
  const [tab, setTab] = useState<Tab>("journal");
  const [q, setQ] = useState("");
  const [composer, setComposer] = useState<Preset | null>(null);
  const [asking, setAsking] = useState(false);

  useEffect(() => { try { const v = localStorage.getItem("dossier-view"); if (v === "chrono" || v === "rubriques") setView(v); } catch {} }, []);
  const switchView = (v: View) => { setView(v); try { localStorage.setItem("dossier-view", v); } catch {} };

  const patchApp = useCallback((patch: Partial<Application>) => setData((d) => ({ ...d, app: { ...d.app, ...patch } })), []);
  const refresh = useCallback(async () => {
    const r = await loadDossier(sb, app.id);
    if (r.ok) setData(r.data);
  }, [sb, app.id]);

  // Une écriture a pu échouer entre l'élément et la candidature : à l'ouverture, la candidature est remise d'accord avec ses entretiens
  const healed = useRef(false);
  useEffect(() => {
    if (healed.current || !entriesReady || !needsSync(initial.app, initial.entries)) return;
    healed.current = true;
    void syncIfNeeded(sb, initial.app, initial.entries).then((p) => { if (p) { patchApp(p); refreshBadges(); } });
  }, [sb, initial, entriesReady, patchApp]);

  const journal = useMemo(() => buildJournal({ app, entries, history, docs, emails }), [app, entries, history, docs, emails]);
  const shown = useMemo(() => journal.filter((i) => matchesQuery(i, q)), [journal, q]);
  const state = useMemo(() => interviewState(allInterviews(app, entries)), [app, entries]);
  const withState = useMemo(() => ({ ...app, ...state }), [app, state]);
  const focus = useMemo(() => focusOf(app, entries), [app, entries]);
  const followDay = followupOn(withState);

  async function run(result: Promise<EntryResult>, done: string): Promise<string | null> {
    const r = await result;
    if (!r.ok) return r.error;
    setData((d) => ({ ...d, entries: r.entries, app: { ...d.app, ...r.appPatch, ...(r.moved ? { status: r.moved } : {}) } }));
    refreshBadges();
    toast(r.moved ? `${done} L'étape passe à « ${statusLabel(r.moved)} ».` : done, { tone: "ok" });
    if (r.warning) toast(r.warning, { tone: "info", ms: 9000 });
    if (r.moved) void refresh();
    setComposer(null);
    return null;
  }
  const submit = (input: EntryInput, editing: Entry | null) =>
    editing
      ? run(updateEntry(sb, app, entries, editing.id, input), "Modifié.")
      : run(addEntry(sb, app, entries, input), "Ajouté au dossier.");
  async function remove(e: Entry) {
    const ok = await confirm({ title: "Supprimer cet élément ?", body: e.kind === "interview" ? "L'entretien disparaît du dossier et, s'il était le plus récent, la relance repart de l'entretien d'avant." : "Il disparaît du dossier. Cette action est définitive.", confirmLabel: "Supprimer", danger: true });
    if (!ok) return;
    const message = await run(deleteEntry(sb, app, entries, e.id), "Supprimé.");
    if (message) toast(message, { tone: "err" });
  }

  async function saveDetail(key: DetailKey, raw: string): Promise<string | null> {
    const c = cleanDetail(key, raw);
    if (!c.ok) return c.error;
    if ((app[key] ?? null) === c.value) return null;
    const w = await writeApplication(sb, app.id, { [key]: c.value } as Partial<Application>);
    if (w.error) return w.error;
    patchApp({ [key]: c.value } as Partial<Application>);
    if (key === "next_action_at") refreshBadges();
    return null;
  }

  async function changeStatus(next: StatusId) {
    if (next === app.status) return;
    const before = { status: app.status, applied_at: app.applied_at, next_action_at: app.next_action_at };
    const patch = statusPatch(app, next);
    patchApp(patch);
    const w = await writeApplication(sb, app.id, patch);
    if (w.error) { patchApp(before); return toast("Le changement n'a pas été enregistré.", { tone: "err" }); }
    refreshBadges();
    void refresh();
    toast(`${app.company} : ${statusLabel(next).toLowerCase()}`, { action: { label: "Annuler", run: async () => { await writeApplication(sb, app.id, before); refreshBadges(); void refresh(); } } });
  }

  /** « Je ne postule pas » : la raison nourrit l'apprentissage, la candidature part dans Abandonné (ou « Offre plus disponible »). */
  async function giveUp(reason: string) {
    const before = { status: app.status, next_action_at: app.next_action_at };
    let ok = true;
    if (app.offer_id) {
      const res = await fetch(`/api/offers/${app.offer_id}/decide`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision: "reject", reason }) }).catch(() => null);
      ok = !!res?.ok;
    } else {
      ok = !(await writeApplication(sb, app.id, { status: reason === "expiree" ? "expiree" : "abandonne", next_action_at: null })).error;
    }
    if (!ok) return toast("Le changement n'a pas été enregistré.", { tone: "err" });
    refreshBadges();
    router.push("/suivi");
    toast(`${app.company} : je ne postule pas`, {
      action: { label: "Annuler", run: async () => {
        if (app.offer_id) await fetch(`/api/offers/${app.offer_id}/decide`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision: "restore", status: "a_postuler" }) }).catch(() => null);
        else await writeApplication(sb, app.id, before);
        refreshBadges();
        router.refresh();
      } },
    });
  }

  async function removeDossier() {
    const ok = await confirm({ title: "Supprimer cette candidature ?", body: `${app.company} : ${app.title}. Ses notes, e-mails collés et entretiens sont supprimés avec elle ; les documents rattachés à l'offre sont conservés.`, confirmLabel: "Supprimer", danger: true });
    if (!ok) return;
    const { error } = await sb.from("applications").delete().eq("id", app.id);
    if (error) return toast("Suppression impossible. Réessaie dans un instant.", { tone: "err" });
    refreshBadges();
    router.push("/suivi");
  }

  const st = STATUSES.find((s) => s.id === app.status);
  const openAdd = (kind: EntryKind = "note") => setComposer({ kind });
  const editEntry = (e: Entry) => setComposer({ kind: e.kind, entry: e });
  const tabs: [Tab, string, number | null][] = [["journal", "Journal", journal.length], ["details", "Détails", null], ["documents", "Documents", docs.length]];
  const subtitle = [app.company, app.channel, app.applied_at ? `Postulé le ${fmtDate(app.applied_at)}` : null].filter(Boolean).join(" · ");
  const analyzeHref = `/offres/nouvelle?auto=1&then=cv&app=${app.id}${app.url ? `&url=${encodeURIComponent(app.url)}` : "&needtext=1"}`;

  const links = (
    <>
      {app.offer_id ? <Link href={`/offres/${app.offer_id}`} className="btn">Offre et CV</Link> : <Link href={analyzeHref} className="btn">Analyser l'offre</Link>}
      {app.url && /^https?:\/\//i.test(app.url) && <a href={app.url} target="_blank" rel="noreferrer noopener" className="btn" aria-label="Voir l'annonce (s'ouvre dans un nouvel onglet)">Voir l'annonce <ExternalLink size={14} aria-hidden /></a>}
    </>
  );
  const closing = (
    <>
      {["postule", "entretien", "test", "relance"].includes(app.status) && <button type="button" className="btn" onClick={() => void changeStatus("refuse")}><X size={16} /> Pas retenu</button>}
      {["postule", "relance"].includes(app.status) && <button type="button" className="btn" onClick={() => void changeStatus("expiree")}><Ban size={16} /> Offre plus disponible</button>}
    </>
  );

  const nextCard = <NextStep focus={focus} app={app} view={withState} onAdd={() => openAdd("interview")} />;

  return (
    <div className="pb-28 lg:pb-8">
      <header>
        <Link href="/suivi" className="hit -ml-1 inline-flex min-h-11 items-center gap-1 font-semibold text-muted hover:text-ink"><ArrowLeft size={17} aria-hidden /> Suivi</Link>
        <div className="mt-1 min-w-0">
          <p className="text-muted">{subtitle}</p>
          <h1 className="display mt-0.5 break-words text-[1.7rem] leading-[1.05] md:text-4xl">{app.title}</h1>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          <ScorePill value={app.offer_id ? app.score : null} />
          <label className="relative inline-flex items-center">
            <span className="sr-only">Étape de la candidature</span>
            <span className={`pointer-events-none absolute left-3.5 h-2.5 w-2.5 rounded-full ${st?.color ?? "bg-muted"}`} aria-hidden />
            <select value={app.status} onChange={(e) => void changeStatus(e.target.value as StatusId)} className="field !w-auto !rounded-full !py-2 !pl-9 font-semibold">
              {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </label>
          {app.status === "a_postuler" && <MarkSentButton id={app.id} label="Marquer comme envoyée" primary onDone={() => void refresh()} />}
          {app.status === "a_postuler" && <button type="button" className="btn" onClick={() => setAsking((v) => !v)} aria-expanded={asking}><X size={16} /> Je ne postule pas</button>}
          <span className="hidden flex-wrap items-center gap-2.5 lg:flex">{links}{closing}</span>
        </div>
        {asking && (
          <div className="mt-3">
            <p className="text-sm font-semibold">Pourquoi ? L'app s'en sert pour mieux trier les prochaines offres.</p>
            <ReasonChips className="mt-2" onPick={giveUp} />
          </div>
        )}
      </header>

      {(unread.length > 0 || !entriesReady) && (
        <div role="status" className="mt-4 flex gap-3 rounded-2xl border border-marigold/45 bg-marigold/10 p-3.5 text-sm">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-marigold-deep" aria-hidden />
          <p>{!entriesReady ? "Les notes, e-mails collés et entretiens multiples demandent une mise à jour de la base : Administration › Installation. En attendant, le reste du dossier fonctionne." : ""}{unread.length > 0 ? `${!entriesReady ? " " : ""}Une partie du dossier n'a pas pu être lue (${unread.join(", ")}) : recharge la page.` : ""}</p>
        </div>
      )}

      <div className="mt-5 lg:hidden">{nextCard}</div>

      <div role="tablist" aria-label="Sections du dossier" className="mt-4 flex gap-5 border-b border-line lg:hidden">
        {tabs.map(([id, label, n]) => (
          <button key={id} type="button" role="tab" id={`tab-${id}`} aria-selected={tab === id} aria-controls={`panel-${id}`}
            onClick={() => setTab(id)} className={`-mb-px min-h-11 border-b-[3px] ${tab === id ? "border-marigold font-bold" : "border-transparent text-muted"}`}>
            {label}{n ? <span className="ml-1.5 text-sm font-semibold text-muted">{n}</span> : null}
          </button>
        ))}
      </div>

      <div className="mt-4 lg:mt-6 lg:grid lg:grid-cols-[minmax(0,1fr)_20.5rem] lg:items-start lg:gap-8">
        <div id="panel-journal" role="tabpanel" aria-labelledby="tab-journal" className={tab === "journal" ? "block" : "hidden lg:block"}>
          <div className="flex flex-wrap items-center gap-2.5">
            <div role="group" aria-label="Affichage du dossier" className="flex rounded-full border border-line bg-surface p-0.5">
              {([["chrono", "Chronologie"], ["rubriques", "Par rubriques"]] as const).map(([id, label]) => (
                <button key={id} type="button" aria-pressed={view === id} onClick={() => switchView(id)} className={`min-h-9 rounded-full px-4 text-[0.95rem] ${view === id ? "bg-ink font-semibold text-paper" : ""}`}>{label}</button>
              ))}
            </div>
            <label className="relative min-w-44 flex-1">
              <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
              <span className="sr-only">Rechercher dans le dossier</span>
              <input type="search" className="field !rounded-full !pl-10" placeholder="Rechercher dans le dossier" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
            <button type="button" className="btn btn-primary hidden lg:inline-flex" onClick={() => openAdd()}><Plus size={16} /> Ajouter</button>
          </div>

          {view === "chrono" ? (
            shown.length ? <Timeline items={shown} onEdit={editEntry} /> : (
              <p className="mt-6 rounded-2xl border border-dashed border-line p-5 text-center text-muted">
                {q ? "Rien dans ce dossier ne correspond à cette recherche." : "Rien dans ce dossier pour l'instant. Ajoute une note, colle un e-mail ou note un entretien."}
              </p>
            )
          ) : <Rubriques items={shown} onEdit={editEntry} onAdd={openAdd} />}
        </div>

        <aside className="mt-4 space-y-5 lg:mt-0" aria-label="Résumé du dossier">
          <div className="hidden lg:block">{nextCard}</div>

          <section id="panel-details" role="tabpanel" aria-labelledby="tab-details" className={`card px-5 pb-2 pt-4 ${tab === "details" ? "block" : "hidden lg:block"}`}>
            <h2 className="heading text-lg">Détails</h2>
            <div className="mt-1">
              {ROWS.filter((r) => r.key !== "next_action_at" || isFollowupStatus(app.status)).map((r) => (
                <DetailRow key={`${r.key}-${(app[r.key] ?? "") as string}`} spec={r} app={app} followDay={followDay} onSave={saveDetail} />
              ))}
            </div>
          </section>

          <section id="panel-documents" role="tabpanel" aria-labelledby="tab-documents" className={`card px-5 pb-5 pt-4 ${tab === "documents" ? "block" : "hidden lg:block"}`}>
            <h2 className="heading text-lg">Documents</h2>
            {docs.length ? (
              <ul className="mt-2 divide-y divide-line">
                {docs.map((d) => (
                  <li key={d.id}>
                    <Link href={`/documents/${d.id}`} className="flex min-h-11 items-center gap-3 py-2 hover:underline">
                      <span className={`grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full ${RAIL.doc}`}><FileText size={16} aria-hidden /></span>
                      <span className="min-w-0 flex-1"><strong className="font-semibold">{{ cv: "CV généré", lettre: "Lettre générée", prep: "Préparation d'entretien", relance: "Relance" }[d.kind] ?? "Document"}</strong><br /><span className="text-sm text-muted">{fmtDate(d.created_at)}{d.reused_from ? ", réutilisé" : ""}</span></span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-2 text-sm text-muted">Aucun document pour l'instant.</p>}
            <div className="mt-3 flex flex-wrap gap-2 lg:hidden">{links}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {app.offer_id && <Link href={`/offres/${app.offer_id}`} className="btn btn-sm">Écrire une lettre</Link>}
              {canDraftFollowup(withState) && <FollowupButton id={app.id} contact={app.contact} compact />}
            </div>
          </section>

          <div className="flex flex-wrap gap-2 lg:hidden">{closing}</div>
          <button type="button" className="btn btn-ghost btn-sm text-bad" onClick={removeDossier}><Trash2 size={15} /> Supprimer cette candidature</button>
        </aside>
      </div>

      {tab === "journal" && (
        <button type="button" onClick={() => openAdd()} aria-label="Ajouter au dossier"
          className="btn btn-primary btn-xl fixed bottom-24 right-4 z-40 !min-h-14 !rounded-full shadow-lift lg:hidden"><Plus size={20} aria-hidden /> Ajouter</button>
      )}

      {composer && <Composer preset={composer} onClose={() => setComposer(null)} onSubmit={submit} onDelete={(e) => void remove(e)} />}
    </div>
  );
}

export { LEGACY_ID };
