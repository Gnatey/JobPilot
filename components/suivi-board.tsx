"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Download, LayoutGrid, List, CalendarDays, X, FileText, Search, Archive, Sparkles, Pencil } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { loadApplications } from "@/lib/applications";
import { PageTitle, Empty } from "@/components/ui/page-title";
import { ScorePill } from "@/components/ui/score";
import { FollowupButton } from "@/components/followup-button";
import { MarkSentButton } from "@/components/app-actions";
import { CalendarButton } from "@/components/calendar-button";
import { SuiviCalendar } from "@/components/suivi-calendar";
import { useFeedback } from "@/components/ui/feedback";
import { SuiviDups } from "@/components/suivi-dups";
import { refreshBadges } from "@/components/nav";
import { STATUSES, CHANNELS, statusLabel, type Application, type StatusId } from "@/lib/types";
import { statusPatch } from "@/lib/dossier";
import { followupOn, followupDue, isFollowupStatus, isGhosted } from "@/lib/followup";
import { today, ago, until, plural } from "@/lib/format";

/** Vue liste : au-delà de ce nombre (+ 5), une section est repliée avec « Voir les N autres ». */
const LIST_PREVIEW = 12;
const blank: Partial<Application> = { company: "", title: "", status: "a_postuler", channel: "LinkedIn" };
const DONE = ["refuse", "abandonne", "expiree"];

/** Une candidature née d'une offre analysée dans l'app a un `offer_id` ; sans lui, elle a été saisie à la main. */
const fromApp = (a: Partial<Application>) => Boolean(a.offer_id);
function Origin({ a, withText = false }: { a: Partial<Application>; withText?: boolean }) {
  const app = fromApp(a);
  const label = app ? "Ajoutée depuis une offre analysée" : "Saisie à la main";
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 text-xs ${app ? "text-marigold-deep" : "text-muted"}`} title={label} aria-label={label} role="img">
      {app ? <Sparkles size={13} /> : <Pencil size={13} />}
      {withText && label}
    </span>
  );
}

/** ISO → valeur d'un champ datetime-local (heure locale du navigateur) */
const toLocalInput = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

export function SuiviBoard({ initial, calendarUrl = null }: { initial: Application[]; calendarUrl?: string | null }) {
  const sb = useMemo(() => supabaseBrowser(), []);
  const router = useRouter();
  const { toast, confirm } = useFeedback();
  const [apps, setApps] = useState<Application[]>(initial);
  const [view, setView] = useState<"board" | "list" | "calendar">("list");
  const [scope, setScope] = useState<"open" | "all">("open");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Partial<Application> | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string[]>([]); // sections de la vue liste dépliées en entier

  useEffect(() => { setApps(initial); }, [initial]);

  const reload = useCallback(async () => {
    const { data, error } = await loadApplications(sb);
    if (!error) setApps(data); // une lecture interrompue ne remplace pas la liste complète déjà affichée
    refreshBadges();
  }, [sb]);

  useEffect(() => {
    try {
      const v = localStorage.getItem("suivi-view");
      if (v === "board" || v === "list" || v === "calendar") setView(v);
      else if (window.innerWidth >= 1024) setView("board");
    } catch {}
    const p = new URLSearchParams(location.search);
    if (p.get("new")) setEditing({ ...blank });
    // Ancien lien « ?open=ID » (agenda, palette, e-mails…) : la fiche est devenue le dossier de la candidature
    const open = p.get("open");
    if (open && /^[0-9a-f-]{36}$/i.test(open)) router.replace(`/suivi/${open}`);
  }, [initial]);

  function switchView(v: "board" | "list" | "calendar") {
    setView(v);
    try { localStorage.setItem("suivi-view", v); } catch {}
  }

  async function setStatus(a: Application, status: StatusId) {
    // Même règle que dans le dossier (lib/dossier.ts) : date d'envoi, et pas de relance programmée à l'étape (elle se déduit de l'entretien)
    const patch = statusPatch(a, status);
    const before = { status: a.status, applied_at: a.applied_at, next_action_at: a.next_action_at };
    setApps((xs) => xs.map((x) => (x.id === a.id ? { ...x, ...patch } : x)));
    const { error } = await sb.from("applications").update(patch).eq("id", a.id);
    if (error) { setApps((xs) => xs.map((x) => (x.id === a.id ? { ...x, ...before } : x))); return toast("Le changement n'a pas été enregistré.", { tone: "err" }); }
    refreshBadges();
    toast(`${a.company} : ${statusLabel(status).toLowerCase()}`, { action: { label: "Annuler", run: async () => { await sb.from("applications").update(before).eq("id", a.id); reload(); } } });
  }

  const ghosted = apps.filter((a) => isGhosted(a));
  async function archiveGhosted() {
    const ok = await confirm({ title: `Classer ${plural(ghosted.length, "candidature", "candidatures")} sans suite ?`, body: "Elles passent en « Abandonné ». Aucune réponse depuis plus de trois semaines : tu pourras les rouvrir si l'entreprise répond.", confirmLabel: "Classer sans suite" });
    if (!ok) return;
    const ids = ghosted.map((a) => a.id);
    // Chaque ligne retrouve son étape d'avant (Postulé, Relancé ou Entretien) si on annule
    const idsOf = (st: string) => ghosted.filter((a) => a.status === st).map((a) => a.id);
    const before = { postule: idsOf("postule"), relance: idsOf("relance"), entretien: idsOf("entretien") };
    const { error } = await sb.from("applications").update({ status: "abandonne", next_action_at: null }).in("id", ids);
    if (error) return toast("Le classement n'a pas été enregistré : réessaie dans un instant.", { tone: "err" });
    await reload();
    toast(`${plural(ids.length, "candidature classée", "candidatures classées")} sans suite`, { action: { label: "Annuler", run: async () => {
      for (const [st, list] of Object.entries(before)) if (list.length) await sb.from("applications").update({ status: st }).in("id", list);
      reload();
    } } });
  }

  const openApp = (a: Application) => router.push(`/suivi/${a.id}`);
  const filtered = apps.filter((a) => (!q || `${a.company} ${a.title} ${a.notes ?? ""}`.toLowerCase().includes(q.toLowerCase())));
  const shownStatuses = STATUSES.filter((s) => scope === "all" || !DONE.includes(s.id));
  const doneCount = filtered.filter((a) => DONE.includes(a.status)).length;

  function exportCsv() {
    const cols = ["company", "title", "status", "channel", "cv_variant", "score", "applied_at", "next_action_at", "location", "contract", "contact", "url", "notes"] as const;
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [cols.join(";"), ...apps.map((a) => cols.map((c) => esc(c === "status" ? statusLabel(a.status) : a[c])).join(";"))].join("\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `candidatures-${today()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <PageTitle title="Suivi" sub="Toutes tes candidatures au même endroit. Les réponses lues dans Gmail font avancer les statuts toutes seules.">
        <button className="btn btn-primary" onClick={() => setEditing({ ...blank })}><Plus size={16} /> Ajouter</button>
        <CalendarButton initialUrl={calendarUrl} />
        <button className="btn" onClick={exportCsv} aria-label="Exporter en CSV"><Download size={16} /> <span className="hidden sm:inline">CSV</span></button>
      </PageTitle>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="relative min-w-52 flex-1">
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input className="field !pl-10" placeholder="Rechercher une entreprise, un poste…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher" />
        </label>
        <div className="flex rounded-full border border-line bg-surface p-0.5" role="group" aria-label="Périmètre">
          {([["open", "En cours"], ["all", "Tout"]] as const).map(([id, label]) => (
            <button key={id} aria-pressed={scope === id} onClick={() => setScope(id)} className={`rounded-full px-3.5 py-1.5 text-sm ${scope === id ? "bg-ink font-semibold text-paper" : "text-muted"}`}>{label}</button>
          ))}
        </div>
        <div className="flex rounded-full border border-line bg-surface p-0.5" role="group" aria-label="Affichage">
          <button aria-pressed={view === "list"} onClick={() => switchView("list")} className={`rounded-full p-2 ${view === "list" ? "bg-paper" : "text-muted"}`} aria-label="Liste"><List size={18} /></button>
          <button aria-pressed={view === "board"} onClick={() => switchView("board")} className={`rounded-full p-2 ${view === "board" ? "bg-paper" : "text-muted"}`} aria-label="Tableau"><LayoutGrid size={18} /></button>
          <button aria-pressed={view === "calendar"} onClick={() => switchView("calendar")} className={`rounded-full p-2 ${view === "calendar" ? "bg-paper" : "text-muted"}`} aria-label="Calendrier"><CalendarDays size={18} /></button>
        </div>
      </div>

      {apps.length > 0 && (
        <p className="-mt-2 mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
          <span className="inline-flex items-center gap-1"><Sparkles size={13} className="text-marigold-deep" /> ajoutée depuis une offre analysée</span>
          <span className="inline-flex items-center gap-1"><Pencil size={13} /> saisie à la main</span>
        </p>
      )}

      {ghosted.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-sm">
          <Archive size={18} className="shrink-0 text-muted" />
          <p className="min-w-0 flex-1"><strong>{plural(ghosted.length, "candidature", "candidatures")}</strong> sans nouvelles depuis plus de trois semaines.</p>
          <button className="btn btn-sm" onClick={archiveGhosted}>Classer sans suite</button>
        </div>
      )}

      <SuiviDups apps={apps} onOpen={openApp} onChanged={reload} />

      {!apps.length ? (
        <Empty icon={<FileText />} action={<button className="btn btn-primary" onClick={() => setEditing({ ...blank })}><Plus size={16} /> Ajouter une candidature</button>}>
          Aucune candidature pour l'instant. Quand tu cliques sur « Je candidate », l'offre arrive ici.
        </Empty>
      ) : view === "calendar" ? (
        <SuiviCalendar apps={filtered.filter((a) => shownStatuses.some((s) => s.id === a.status))} onOpen={openApp} />
      ) : view === "list" ? (
        <div className="space-y-7">
          {shownStatuses.map((s) => {
            const rows = filtered.filter((a) => a.status === s.id);
            if (!rows.length) return null;
            // Une section très longue (200 offres « À postuler ») repousse les autres de plusieurs écrans : on n'en montre qu'un début
            const full = expanded.includes(s.id) || rows.length <= LIST_PREVIEW + 5;
            const shown = full ? rows : rows.slice(0, LIST_PREVIEW);
            return (
              <section key={s.id} aria-label={s.label}>
                <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted">
                  <span className={`h-2.5 w-2.5 rounded-full ${s.color}`} /> {s.label} <span className="font-normal">{rows.length}</span>
                </h2>
                <ul className="list">
                  {shown.map((a) => <Row key={a.id} a={a} onOpen={() => openApp(a)} onStatus={(st) => setStatus(a, st)} />)}
                </ul>
                {rows.length > LIST_PREVIEW + 5 && (
                  <button type="button" className="link mt-2 text-sm text-muted" aria-expanded={full}
                    onClick={() => setExpanded((e) => (e.includes(s.id) ? e.filter((x) => x !== s.id) : [...e, s.id]))}>
                    {full ? "Réduire la liste" : `Voir les ${rows.length - LIST_PREVIEW} autres`}
                  </button>
                )}
              </section>
            );
          })}
          {scope === "open" && doneCount > 0 && <button className="link text-sm text-muted" onClick={() => setScope("all")}>Afficher aussi les {doneCount} candidatures terminées</button>}
          {!filtered.some((a) => shownStatuses.some((s) => s.id === a.status)) && <Empty>Aucune candidature ne correspond.</Empty>}
        </div>
      ) : (
        <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-4 md:-mx-8 md:px-8 xl:-mx-12 xl:px-12">
          {shownStatuses.map((s) => {
            const rows = filtered.filter((a) => a.status === s.id);
            return (
              <div key={s.id} className="min-w-[15rem] flex-1 shrink-0 snap-start"
                onDragOver={(e) => { e.preventDefault(); setOver(s.id); }} onDragLeave={() => setOver((o) => (o === s.id ? null : o))}
                onDrop={() => { const a = apps.find((x) => x.id === dragId); if (a && a.status !== s.id) setStatus(a, s.id); setDragId(null); setOver(null); }}>
                <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  <span className={`h-2.5 w-2.5 rounded-full ${s.color}`} /> {s.label} <span className="font-normal text-muted">{rows.length}</span>
                </h2>
                <div className={`min-h-28 max-h-[65vh] space-y-2 overflow-y-auto overscroll-contain rounded-2xl p-2 transition-colors ${over === s.id ? "bg-marigold/20 ring-2 ring-marigold" : "bg-line/45"}`}>
                  {rows.map((a) => {
                    const late = followupDue(a);
                    const on = followupOn(a);
                    return (
                      <button key={a.id} draggable onDragStart={() => setDragId(a.id)} onDragEnd={() => { setDragId(null); setOver(null); }} onClick={() => openApp(a)}
                        className={`block w-full rounded-xl border bg-surface p-3 text-left shadow-sm transition-shadow hover:shadow-lift ${late ? "border-bad/50" : "border-line"}`}>
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-semibold leading-snug">{a.title}</p>
                          <ScorePill value={a.offer_id ? a.score : null} />
                        </div>
                        <p className="mt-1 flex items-center gap-1.5 text-sm text-muted"><Origin a={a} /> <span className="min-w-0 truncate">{a.company}</span></p>
                        {a.interview_at && ["entretien", "test"].includes(a.status) && <p className="mt-1 text-xs font-semibold text-marigold-deep">{a.interview_kind === "contact" ? "Contact, " : ""}{new Date(a.interview_at).toLocaleString("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>}
                        {on && <p className={`mt-1 text-xs ${late ? "font-semibold text-bad" : "text-muted"}`}>Relance {until(on)}</p>}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && <Sheet app={editing} onClose={() => { setEditing(null); if (location.search) history.replaceState(null, "", location.pathname); }} onSaved={() => { setEditing(null); reload(); if (location.search) history.replaceState(null, "", location.pathname); }} />}
    </>
  );
}

function Row({ a, onOpen, onStatus }: { a: Application; onOpen: () => void; onStatus: (s: StatusId) => void }) {
  const late = followupDue(a);
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
      <button onClick={onOpen} className="min-w-0 flex-1 basis-48 text-left">
        <p className="truncate font-semibold">{a.title}</p>
        <p className="flex items-center gap-1.5 truncate text-sm text-muted">
          <Origin a={a} />
          <span className="truncate">{a.company}
          {a.applied_at ? `, postulé ${ago(a.applied_at)}` : ""}
          {a.interview_at && ["entretien", "test"].includes(a.status) ? <span className="font-semibold text-marigold-deep">, {a.interview_kind === "contact" ? "contact " : ""}{new Date(a.interview_at).toLocaleString("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span> : null}
          {late ? <span className="font-semibold text-bad">, à relancer</span> : null}</span>
        </p>
      </button>
      <ScorePill value={a.offer_id ? a.score : null} />
      {a.status === "a_postuler" && <MarkSentButton id={a.id} />}
      {late && <FollowupButton id={a.id} contact={a.contact} compact />}
      <select aria-label={`Statut de ${a.company}`} className="field !w-auto !py-1.5 text-sm" value={a.status} onChange={(e) => onStatus(e.target.value as StatusId)}>
        {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
      </select>
    </li>
  );
}

/** Nouvelle candidature saisie à la main. Une candidature existante s'ouvre dans son dossier (/suivi/[id]), où tout se modifie sur place. */
function Sheet({ app, onClose, onSaved }: { app: Partial<Application>; onClose: () => void; onSaved: () => void }) {
  const sb = useMemo(() => supabaseBrowser(), []);
  const { toast } = useFeedback();
  const router = useRouter();
  const [f, setF] = useState<Partial<Application>>(app);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof Application) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF((x) => ({ ...x, [k]: e.target.value || null }));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const need = (v?: string | null) => Boolean(v && v.trim().length >= 2);
    if (!need(f.title) || !need(f.company)) return setErr("Indique le poste et l'entreprise.");
    if (!f.channel) return setErr("Indique par quel canal tu as trouvé ou envoyé cette candidature.");
    if (!f.url && !f.contact) return setErr("Ajoute le lien de l'offre ou un contact, pour retrouver cette candidature plus tard.");
    if (f.status !== "a_postuler" && !f.applied_at) return setErr("Indique la date à laquelle tu as postulé.");
    if (["entretien", "test"].includes(f.status ?? "") && !f.interview_at) return setErr("Indique la date et l'heure de l'entretien.");
    setBusy(true);
    const { id, created_at, updated_at, interview_kind, ...rest } = f as Application;
    void id; void created_at; void updated_at; void interview_kind;
    if (rest.status === "postule" && !rest.applied_at) rest.applied_at = today();
    let { error } = await sb.from("applications").insert(rest);
    // La date d'entretien demande la mise à jour de la base (Administration › Installation) : on enregistre le reste sans elle
    if (error && /interview_at/.test(error.message) && "interview_at" in rest) {
      const { interview_at, ...others } = rest;
      void interview_at;
      ({ error } = await sb.from("applications").insert(others));
      if (!error) toast("Enregistré, sauf la date d'entretien : lance la mise à jour de la base (Administration › Installation).", { tone: "info", ms: 9000 });
    }
    setBusy(false);
    if (error) return setErr("Enregistrement impossible. Réessaie dans un instant.");
    onSaved();
    router.refresh();
  }

  const interview = ["entretien", "test"].includes(f.status ?? "");

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/45" onClick={onClose}>
      <form onSubmit={save} onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-md flex-col overflow-y-auto bg-surface p-5 shadow-2xl" style={{ animation: "toast-in .2s ease-out both" }} aria-label="Nouvelle candidature">
        <div className="flex items-center justify-between">
          <h2 className="display text-3xl">Nouvelle candidature</h2>
          <button type="button" className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Fermer"><X size={20} /></button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="col-span-2"><span className="label">Poste<span className="ml-1.5 text-xs font-normal text-muted">obligatoire</span></span><input required minLength={2} autoFocus className="field mt-1" value={f.title ?? ""} onChange={set("title")} /></label>
          <label className="col-span-2"><span className="label">Entreprise<span className="ml-1.5 text-xs font-normal text-muted">obligatoire</span></span><input required minLength={2} className="field mt-1" value={f.company ?? ""} onChange={set("company")} /></label>
          <label><span className="label">Statut</span>
            <select className="field mt-1" value={f.status} onChange={(e) => {
              const s = e.target.value as StatusId;
              // Passer à Entretien / Test : une date de relance d'avant l'entretien n'a plus de sens, la relance se déduit de l'entretien
              setF((x) => ({ ...x, status: s, ...(isFollowupStatus(s) && s !== app.status ? { next_action_at: null } : {}) }));
            }}>{STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
          </label>
          <label><span className="label">Canal<span className="ml-1.5 text-xs font-normal text-muted">obligatoire</span></span>
            <select required className="field mt-1" value={f.channel ?? ""} onChange={set("channel")}><option value="" disabled>Choisis…</option>{CHANNELS.map((c) => <option key={c}>{c}</option>)}</select>
          </label>
          {interview && (
            <label className="col-span-2"><span className="label">Date et heure de l'{f.status === "test" ? "épreuve" : "entretien"}<span className="ml-1.5 text-xs font-normal text-muted">obligatoire</span></span>
              <input type="datetime-local" required className="field mt-1" value={toLocalInput(f.interview_at)} onChange={(e) => setF((x) => ({ ...x, interview_at: e.target.value ? new Date(e.target.value).toISOString() : null }))} />
            </label>
          )}
          <label><span className="label">Postulé le{f.status !== "a_postuler" ? <span className="ml-1.5 text-xs font-normal text-muted">obligatoire</span> : <span className="ml-1.5 text-xs font-normal text-muted">facultatif</span>}</span><input type="date" required={f.status !== "a_postuler"} className="field mt-1" value={f.applied_at ?? ""} onChange={set("applied_at")} /></label>
          {interview && <label><span className="label">Relance le<span className="ml-1.5 text-xs font-normal text-muted">facultatif, sinon 2 semaines après</span></span><input type="date" className="field mt-1" value={f.next_action_at ?? ""} onChange={set("next_action_at")} /></label>}
          <label><span className="label">Lieu<span className="ml-1.5 text-xs font-normal text-muted">facultatif</span></span><input className="field mt-1" value={f.location ?? ""} onChange={set("location")} /></label>
          <label><span className="label">Contrat<span className="ml-1.5 text-xs font-normal text-muted">facultatif</span></span><input className="field mt-1" value={f.contract ?? ""} onChange={set("contract")} /></label>
          <label><span className="label">CV utilisé<span className="ml-1.5 text-xs font-normal text-muted">facultatif</span></span>
            <select className="field mt-1" value={f.cv_variant ?? ""} onChange={set("cv_variant")}>
              <option value="">—</option><option value="data_bi">Data BI</option><option value="ba_amoa">BA / AMOA</option><option value="autre">Autre</option>
            </select>
          </label>
          <label><span className="label">Salaire<span className="ml-1.5 text-xs font-normal text-muted">facultatif</span></span><input className="field mt-1" value={f.salary ?? ""} onChange={set("salary")} /></label>
          <label className="col-span-2"><span className="label">Contact (nom, email)<span className="ml-1.5 text-xs font-normal text-muted">lien ou contact : au moins un</span></span><input className="field mt-1" value={f.contact ?? ""} onChange={set("contact")} /></label>
          <label className="col-span-2"><span className="label">Lien de l'offre<span className="ml-1.5 text-xs font-normal text-muted">lien ou contact : au moins un</span></span><input type="url" className="field mt-1" value={f.url ?? ""} onChange={set("url")} /></label>
          <label className="col-span-2"><span className="label">Notes<span className="ml-1.5 text-xs font-normal text-muted">facultatif</span></span><textarea rows={4} className="field mt-1" value={f.notes ?? ""} onChange={set("notes")} /></label>
        </div>
        <p className="mt-4 text-sm text-muted">Une fois la candidature créée, son dossier accueille tes notes, e-mails collés et entretiens.</p>

        {err && <p className="mt-4 rounded-xl bg-bad/10 p-3 text-sm text-bad" role="alert">{err}</p>}
        <div className="mt-auto flex flex-wrap gap-2 pt-6">
          <button className="btn btn-primary flex-1" disabled={busy}>{busy ? "Enregistrement…" : "Enregistrer"}</button>
        </div>
      </form>
    </div>
  );
}
