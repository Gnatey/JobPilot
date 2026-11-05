"use client";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Loader2, Plus, X } from "lucide-react";

export type Opt = { id: string; label: string; hint?: string; group?: string };

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

type Props = {
  /** Intitulé lu par les lecteurs d'écran */
  label: string;
  value: Opt[];
  onChange: (v: Opt[]) => void;
  /** Liste fixe (éventuellement groupée par `group`) */
  options?: Opt[];
  /** Ou recherche à distance (villes) */
  load?: (q: string, signal: AbortSignal) => Promise<Opt[]>;
  minChars?: number;
  max?: number;
  maxMessage?: string;
  /** Propose « Ajouter … » quand ce qui est tapé n'est pas dans la liste */
  allowCustom?: boolean;
  placeholder?: string;
  invalid?: boolean;
  id?: string;
  /** Message précis quand rien n'est trouvé pour ce qui est tapé (ex : code postal incomplet) */
  emptyHint?: (q: string) => string | null;
};

type Row = { kind: "head"; label: string } | { kind: "opt"; opt: Opt; i: number; custom?: boolean };

/**
 * Liste déroulante avec recherche, choix multiples et saisie libre.
 * Les choix s'affichent en pastilles dans le champ ; cliquer un choix déjà fait le retire.
 */
export function Combobox({ label, value, onChange, options, load, minChars = 2, max, maxMessage, allowCustom, placeholder, invalid, id, emptyHint }: Props) {
  const uid = useId();
  const listId = `${uid}-list`;
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [remote, setRemote] = useState<Opt[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  // Recherche à distance, avec un léger délai pour ne pas interroger à chaque lettre
  useEffect(() => {
    if (!load) return;
    const text = q.trim();
    if (text.length < minChars) { setRemote([]); setLoading(false); setFailed(false); return; }
    const ctl = new AbortController();
    setLoading(true);
    const t = setTimeout(() => {
      load(text, ctl.signal)
        .then((r) => { setRemote(r); setFailed(false); })
        .catch((e) => { if (e?.name !== "AbortError") { setRemote([]); setFailed(true); } })
        .finally(() => { if (!ctl.signal.aborted) setLoading(false); });
    }, 250);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q, load, minChars]);

  // Fermeture au clic en dehors
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  const chosen = useMemo(() => new Set(value.map((v) => v.id)), [value]);

  const rows = useMemo<Row[]>(() => {
    const text = norm(q);
    const list = load
      ? remote
      : (options ?? []).filter((o) => !text || norm(`${o.label} ${o.hint ?? ""} ${o.group ?? ""}`).includes(text));
    const out: Row[] = [];
    let last: string | undefined;
    let i = 0;
    for (const opt of list) {
      if (opt.group && opt.group !== last) out.push({ kind: "head", label: opt.group });
      last = opt.group;
      out.push({ kind: "opt", opt, i: i++ });
    }
    const typed = q.trim();
    if (allowCustom && typed.length > 1 && !list.some((o) => norm(o.label) === text) && !value.some((v) => norm(v.label) === text)) {
      out.push({ kind: "head", label: "Autre" });
      out.push({ kind: "opt", opt: { id: typed, label: typed }, i: i++, custom: true });
    }
    return out;
  }, [q, options, remote, load, allowCustom, value]);

  const items = rows.filter((r): r is Extract<Row, { kind: "opt" }> => r.kind === "opt");
  const optId = (i: number) => `${uid}-o${i}`;

  useEffect(() => { setActive(0); }, [q]);
  useEffect(() => {
    if (open) document.getElementById(optId(active))?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, open]);

  function toggle(o: Opt) {
    if (chosen.has(o.id)) {
      setNote(null);
      return onChange(value.filter((v) => v.id !== o.id));
    }
    if (max && value.length >= max) return setNote(maxMessage ?? `${max} choix maximum.`);
    setNote(null);
    onChange([...value, o]);
    setQ("");
    setRemote([]);
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") { e.preventDefault(); if (!open) setOpen(true); else setActive((a) => Math.min(a + 1, items.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") {
      if (open && items[active]) { e.preventDefault(); toggle(items[active].opt); }
      else if (open) e.preventDefault();
    }
    else if (e.key === "Escape") { if (open) { e.preventDefault(); e.stopPropagation(); setOpen(false); } }
    else if (e.key === "Backspace" && !q && value.length) onChange(value.slice(0, -1));
    else if (e.key === "Tab") setOpen(false);
  }

  const typed = q.trim();
  const empty = load
    ? typed.length < minChars ? `Tape au moins ${minChars} lettres.` : loading ? "Recherche en cours…" : failed ? "Recherche indisponible, réessaie dans un instant." : emptyHint?.(typed) ?? "Aucun résultat."
    : "Aucun résultat.";

  return (
    <div ref={box} className="relative">
      <div
        onClick={() => { input.current?.focus(); setOpen(true); }}
        className={`field flex min-h-11 cursor-text flex-wrap items-center gap-1.5 !py-1.5 pr-10 focus-within:!border-marigold focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-marigold)_28%,transparent)] ${invalid ? "!border-bad" : ""}`}
      >
        {value.map((v) => (
          <span key={v.id} className="inline-flex max-w-full items-center gap-1 rounded-full bg-ink py-1 pl-3 pr-1.5 text-sm text-paper">
            <span className="truncate">{v.label}</span>
            <button type="button" aria-label={`Retirer ${v.label}`} className="relative grid h-5 w-5 shrink-0 place-items-center rounded-full after:absolute after:-inset-2 hover:bg-white/20"
              onClick={(e) => { e.stopPropagation(); onChange(value.filter((x) => x.id !== v.id)); setNote(null); }}><X size={13} /></button>
          </span>
        ))}
        <input
          ref={input} id={id} role="combobox" aria-label={label} aria-expanded={open} aria-controls={listId} aria-autocomplete="list" aria-invalid={invalid || undefined}
          aria-activedescendant={open && items[active] ? optId(active) : undefined} autoComplete="off" autoCapitalize="off" spellCheck={false}
          className="min-w-[9ch] flex-1 bg-transparent py-1 text-[0.95rem] !outline-none placeholder:text-muted/75"
          placeholder={value.length ? "" : placeholder} value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={onKey}
        />
        <button type="button" tabIndex={-1} aria-label={open ? "Fermer la liste" : "Ouvrir la liste"}
          className="absolute right-1.5 top-1.5 grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-paper"
          onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); if (!open) input.current?.focus(); }}>
          {loading ? <Loader2 size={17} className="animate-spin" /> : <ChevronDown size={18} className={open ? "rotate-180" : ""} />}
        </button>
      </div>

      {open && (
        <ul id={listId} role="listbox" aria-label={label} aria-multiselectable
          className="absolute inset-x-0 z-40 mt-1.5 max-h-72 overflow-auto overscroll-contain rounded-2xl border border-line bg-surface p-1.5 shadow-lift">
          {rows.map((r, k) =>
            r.kind === "head" ? (
              <li key={`h${k}`} role="presentation" className="px-3 pb-1 pt-2.5 text-xs font-semibold text-muted first:pt-1.5">{r.label}</li>
            ) : (
              <li key={`${r.opt.id}-${k}`} id={optId(r.i)} role="option" aria-selected={chosen.has(r.opt.id)}
                onMouseDown={(e) => e.preventDefault()} onMouseMove={() => active !== r.i && setActive(r.i)} onClick={() => toggle(r.opt)}
                className={`flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm ${active === r.i ? "bg-paper" : ""}`}>
                {r.custom ? <Plus size={15} className="shrink-0 text-muted" /> : <Check size={15} className={`shrink-0 ${chosen.has(r.opt.id) ? "text-marigold-deep" : "invisible"}`} />}
                <span className="min-w-0 flex-1">{r.custom ? <>Ajouter « <b>{r.opt.label}</b> »</> : r.opt.label}</span>
                {r.opt.hint && <span className="shrink-0 text-xs text-muted">{r.opt.hint}</span>}
              </li>
            ),
          )}
          {!items.length && empty && <li role="presentation" className="px-3 py-3 text-sm text-muted">{empty}</li>}
        </ul>
      )}
      {note && <p className="mt-1.5 text-sm text-bad" role="status">{note}</p>}
    </div>
  );
}
