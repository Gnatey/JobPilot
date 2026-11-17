/**
 * Dossier d'offre : lecture et écriture en base (23e paquet). La logique de décision est dans lib/dossier.ts (pure) ; ici, seulement les requêtes,
 * avec une base qui peut ne pas être à jour : la table `application_entries` et la colonne `applications.interview_kind` viennent de la mise à jour 8.
 * Tourne côté serveur comme dans le navigateur (un client Supabase en paramètre), et se teste avec la fausse base de tests/fake-supabase.ts.
 *
 * Règles : une erreur d'écriture est toujours renvoyée (jamais ignorée) ; une table absente donne `NEED_DB` ; la candidature n'est mise à jour qu'APRÈS
 * l'écriture de l'élément, et si cette seconde écriture échoue l'élément reste enregistré (`warning`) : `needsSync` remet la candidature d'accord à
 * la prochaine ouverture du dossier.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingTable } from "./db-missing";
import { isMissingKindColumn } from "./interview-kind-db";
import { LEGACY_ID, LIMITS, cleanEntry, interviewState, legacyInterview, statusAfterInterview, statusPatch, type DocRow, type Entry, type EntryInput, type HistRow, type MailRow } from "./dossier";
import type { Application, StatusId } from "./types";

export const NEED_DB = "Pour ajouter des éléments au dossier, il faut d'abord mettre la base à jour : Administration › Installation.";
const ENTRY_COLS = "id, application_id, kind, title, body, at, interview_kind, created_at";

export type DossierData = {
  app: Application;
  docs: DocRow[];
  history: HistRow[];
  emails: MailRow[];
  entries: Entry[];
  /** La table des éléments existe (mise à jour 8 lancée). */
  entriesReady: boolean;
  /** Parties du dossier qui n'ont pas pu être lues (jamais cachées : l'écran le dit). */
  unread: string[];
};

export async function loadDossier(sb: SupabaseClient, id: string): Promise<{ ok: true; data: DossierData } | { ok: false; notFound: boolean; error: string }> {
  const { data: app, error } = await sb.from("applications").select("*").eq("id", id).maybeSingle();
  if (error) return { ok: false, notFound: false, error: "Cette candidature n'a pas pu être lue : réessaie dans un instant." };
  if (!app) return { ok: false, notFound: true, error: "Candidature introuvable." };
  const a = app as Application;
  const docsQ = sb.from("documents").select("id, kind, created_at, reused_from, template, variant").order("created_at", { ascending: false }).limit(100);
  const [docs, history, emails, entries] = await Promise.all([
    a.offer_id ? docsQ.or(`application_id.eq.${a.id},offer_id.eq.${a.offer_id}`) : docsQ.eq("application_id", a.id),
    sb.from("status_history").select("from_status, to_status, changed_at").eq("application_id", a.id).order("changed_at", { ascending: false }).limit(100),
    sb.from("emails").select("id, from_addr, subject, snippet, received_at, created_at, category").eq("application_id", a.id).order("received_at", { ascending: false }).limit(100),
    sb.from("application_entries").select(ENTRY_COLS).eq("application_id", a.id).order("at", { ascending: false }).limit(500),
  ]);
  const unread: string[] = [];
  if (docs.error) unread.push("documents");
  if (history.error) unread.push("étapes");
  if (emails.error) unread.push("e-mails de Gmail");
  const entriesReady = !entries.error;
  if (entries.error && !isMissingTable(entries.error)) unread.push("éléments du dossier");
  return {
    ok: true,
    data: {
      app: a,
      docs: (docs.data ?? []) as DocRow[],
      history: (history.data ?? []) as HistRow[],
      emails: ((emails.data ?? []) as (Omit<MailRow, "received_at"> & { received_at: string | null; created_at: string })[]).map((m) => ({ ...m, received_at: m.received_at ?? m.created_at })),
      entries: (entries.data ?? []) as Entry[],
      entriesReady,
      unread,
    },
  };
}

type Written = { error: string | null; applied: Partial<Application> };

/**
 * Écrit sur la candidature, en laissant de côté ce que la base ne connaît pas encore : `interview_kind` (mise à jour 8), puis `interview_at`
 * (mise à jour plus ancienne). Renvoie ce qui a vraiment été écrit.
 */
export async function writeApplication(sb: SupabaseClient, id: string, patch: Partial<Application>): Promise<Written> {
  let row: Record<string, unknown> = { ...patch };
  for (let tries = 0; tries < 3; tries++) {
    const { error } = await sb.from("applications").update(row).eq("id", id);
    if (!error) return { error: null, applied: row as Partial<Application> };
    if (isMissingKindColumn(error) && "interview_kind" in row) { const { interview_kind, ...rest } = row; void interview_kind; row = rest; continue; }
    if (/interview_at/.test(error.message ?? "") && "interview_at" in row) { const { interview_at, ...rest } = row; void interview_at; row = rest; continue; }
    return { error: "Le changement n'a pas été enregistré : réessaie dans un instant.", applied: {} };
  }
  return { error: "Le changement n'a pas été enregistré : réessaie dans un instant.", applied: {} };
}

export type EntryResult =
  | { ok: true; entries: Entry[]; appPatch: Partial<Application>; moved: StatusId | null; warning: string | null }
  | { ok: false; error: string };

const missing = (e: { message?: string; code?: string } | null) => isMissingTable(e);
const byAt = (a: Entry, b: Entry) => Date.parse(b.at) - Date.parse(a.at);

/** Après une écriture d'entretien : remet la candidature d'accord (date et type du plus récent), et la fait avancer à « Entretien » si elle n'y était pas. */
async function syncApplication(sb: SupabaseClient, app: Application, entries: Entry[], advance: boolean): Promise<{ appPatch: Partial<Application>; moved: StatusId | null; warning: string | null }> {
  const state = interviewState(entries);
  const patch: Partial<Application> = { ...state };
  let moved: StatusId | null = null;
  if (advance && state.interview_at) {
    const next = statusAfterInterview(app.status);
    if (next !== app.status) { Object.assign(patch, statusPatch(app, next)); moved = next; }
  }
  const w = await writeApplication(sb, app.id, patch);
  if (w.error) return { appPatch: {}, moved: null, warning: "L'élément est enregistré, mais la candidature n'a pas pu être mise à jour : elle le sera à la prochaine ouverture du dossier." };
  return { appPatch: { ...w.applied, interview_kind: state.interview_kind }, moved: moved && "status" in w.applied ? moved : null, warning: null };
}

/** Ajoute un élément (note, e-mail, texte, entretien). Un entretien met la candidature à jour ; un contact la fait avancer à « Entretien » sans lancer de relance. */
export async function addEntry(sb: SupabaseClient, app: Application, entries: Entry[], input: EntryInput, now: Date = new Date()): Promise<EntryResult> {
  const clean = cleanEntry(input, now);
  if (!clean.ok) return { ok: false, error: clean.error };
  if (entries.length >= LIMITS.entries) return { ok: false, error: "Ce dossier a atteint 200 éléments : supprime les plus anciens avant d'en ajouter." };
  let list = [...entries];
  // L'entretien « d'avant » (une date sur la candidature, aucune ligne) devient une vraie ligne avant le premier nouvel entretien : sans cela, il disparaîtrait de l'écran
  const legacy = clean.value.kind === "interview" ? legacyInterview(app, entries) : null;
  if (legacy) {
    const { data, error } = await sb.from("application_entries").insert({ application_id: app.id, kind: "interview", title: null, body: null, at: legacy.at, interview_kind: legacy.interview_kind }).select(ENTRY_COLS).single();
    if (error) return { ok: false, error: missing(error) ? NEED_DB : "L'élément n'a pas été enregistré : réessaie dans un instant." };
    list = [...list, data as Entry];
  }
  const { data, error } = await sb.from("application_entries").insert({ application_id: app.id, ...clean.value }).select(ENTRY_COLS).single();
  if (error) return { ok: false, error: missing(error) ? NEED_DB : "L'élément n'a pas été enregistré : réessaie dans un instant." };
  list = [...list, data as Entry].sort(byAt);
  if (clean.value.kind !== "interview") return { ok: true, entries: list, appPatch: {}, moved: null, warning: null };
  return { ok: true, entries: list, ...(await syncApplication(sb, app, list, true)) };
}

/** Modifie un élément. L'entretien « d'avant » n'a pas de ligne : le modifier en crée une. */
export async function updateEntry(sb: SupabaseClient, app: Application, entries: Entry[], id: string, input: EntryInput, now: Date = new Date()): Promise<EntryResult> {
  const current = id === LEGACY_ID ? legacyInterview(app, entries) : entries.find((e) => e.id === id);
  if (!current) return { ok: false, error: "Cet élément n'existe plus : recharge le dossier." };
  const clean = cleanEntry({ ...input, kind: current.kind }, now);
  if (!clean.ok) return { ok: false, error: clean.error };
  let saved: Entry;
  if (id === LEGACY_ID) {
    const { data, error } = await sb.from("application_entries").insert({ application_id: app.id, ...clean.value }).select(ENTRY_COLS).single();
    if (error) return { ok: false, error: missing(error) ? NEED_DB : "L'élément n'a pas été enregistré : réessaie dans un instant." };
    saved = data as Entry;
  } else {
    const { data, error } = await sb.from("application_entries").update(clean.value).eq("id", id).eq("application_id", app.id).select(ENTRY_COLS).single();
    if (error) return { ok: false, error: missing(error) ? NEED_DB : "Les changements n'ont pas été enregistrés : réessaie dans un instant." };
    saved = data as Entry;
  }
  const list = [...entries.filter((e) => e.id !== id), saved].sort(byAt);
  if (current.kind !== "interview") return { ok: true, entries: list, appPatch: {}, moved: null, warning: null };
  return { ok: true, entries: list, ...(await syncApplication(sb, app, list, false)) };
}

/** Supprime un élément. Supprimer l'entretien « d'avant » efface la date de la candidature. */
export async function deleteEntry(sb: SupabaseClient, app: Application, entries: Entry[], id: string): Promise<EntryResult> {
  const current = id === LEGACY_ID ? legacyInterview(app, entries) : entries.find((e) => e.id === id);
  if (!current) return { ok: false, error: "Cet élément n'existe plus : recharge le dossier." };
  if (id !== LEGACY_ID) {
    const { error } = await sb.from("application_entries").delete().eq("id", id).eq("application_id", app.id);
    if (error) return { ok: false, error: "L'élément n'a pas été supprimé : réessaie dans un instant." };
  }
  const list = entries.filter((e) => e.id !== id);
  if (current.kind !== "interview") return { ok: true, entries: list, appPatch: {}, moved: null, warning: null };
  return { ok: true, entries: list, ...(await syncApplication(sb, app, list, false)) };
}

/** Remet la candidature d'accord avec ses entretiens (une écriture avait échoué entre deux). Sans effet si tout est déjà d'accord. */
export async function syncIfNeeded(sb: SupabaseClient, app: Application, entries: Entry[]): Promise<Partial<Application> | null> {
  const state = interviewState(entries);
  if (!entries.some((e) => e.kind === "interview")) return null;
  const w = await writeApplication(sb, app.id, state);
  return w.error ? null : { ...w.applied, interview_kind: state.interview_kind };
}
