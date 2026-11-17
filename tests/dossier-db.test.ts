// Dossier d'offre : lecture et écriture en base (fausse base, sans réseau). Vérifie surtout ce qui peut mal tourner : table absente, colonne absente,
// candidature d'avant, deux écritures dont la seconde échoue.
import { addEntry, deleteEntry, loadDossier, syncIfNeeded, updateEntry, writeApplication, NEED_DB } from "../lib/dossier-db";
import { LEGACY_ID, needsSync, type Entry } from "../lib/dossier";
import { isMissingKindColumn, hasInterviewKind, resetKindCache } from "../lib/interview-kind-db";
import type { Application } from "../lib/types";
import { fakeSupabase, type Row } from "./fake-supabase";
import { ok, done } from "./helpers";

const NOW = new Date("2026-11-17T10:00:00Z");
const app = (over: Partial<Application> = {}): Application => ({ id: "a1", offer_id: "o1", company: "SPIE", title: "Technicien Support N2", url: null, location: null, contract: null, status: "postule", channel: "LinkedIn", cv_variant: null, score: 81, applied_at: "2026-11-16", next_action_at: null, interview_at: null, interview_kind: null, contact: null, salary: null, notes: null, last_email_at: null, created_at: "2026-11-16T10:00:00Z", updated_at: "2026-11-16T10:00:00Z", ...over } as Application);
const seed = (a: Application, extra: Record<string, Row[]> = {}) => ({ applications: [a as unknown as Row], ...extra });
const err = (r: { ok: boolean }) => (r as { error?: string }).error ?? "";

// ---------- Lecture ----------
{
  const { sb } = fakeSupabase(seed(app(), {
    documents: [{ id: "d1", application_id: "a1", offer_id: "o1", kind: "cv", created_at: "2026-11-16T17:00:00Z" }, { id: "d2", application_id: null, offer_id: "o9", kind: "cv", created_at: "2026-11-16T18:00:00Z" }],
    status_history: [{ application_id: "a1", from_status: null, to_status: "postule", changed_at: "2026-11-16T16:30:00Z" }],
    emails: [{ id: "m1", application_id: "a1", from_addr: "rh@spie.com", subject: "Bonjour", snippet: "…", received_at: null, created_at: "2026-11-16T09:00:00Z" }, { id: "m2", application_id: "autre", subject: "Pas à moi", created_at: "2026-11-16T09:00:00Z" }],
    application_entries: [{ id: "e1", application_id: "a1", kind: "note", body: "x", at: "2026-11-16T17:10:00Z" }, { id: "e2", application_id: "autre", kind: "note", body: "y", at: "2026-11-16T17:10:00Z" }],
  }));
  const r = await loadDossier(sb, "a1");
  ok("lecture : la candidature, ses documents (par candidature ou par offre), ses étapes, ses e-mails et ses éléments, et rien d'une autre", r.ok && r.data.app.id === "a1" && r.data.docs.length === 1 && r.data.history.length === 1 && r.data.emails.length === 1 && r.data.entries.length === 1 && r.data.entriesReady && r.data.unread.length === 0);
  ok("lecture : un e-mail sans date de réception prend sa date d'arrivée", r.ok && r.data.emails[0].received_at === "2026-11-16T09:00:00Z");
  const none = await loadDossier(sb, "nope");
  ok("lecture : candidature inconnue = introuvable", !none.ok && none.notFound);
}
{
  const { sb } = fakeSupabase(seed(app()), {}, { missing: ["application_entries"] });
  const r = await loadDossier(sb, "a1");
  ok("base pas encore à jour : le dossier se lit quand même, sans éléments, et n'annonce pas d'erreur de lecture", r.ok && !r.data.entriesReady && r.data.entries.length === 0 && r.data.unread.length === 0);
}
{
  const { sb } = fakeSupabase(seed(app()), {}, { missing: ["emails"] });
  const r = await loadDossier(sb, "a1");
  ok("une partie illisible est dite, jamais cachée", r.ok && r.data.unread.includes("e-mails de Gmail"));
}

// ---------- Ajouter une note ----------
{
  const a = app();
  const { sb, tables } = fakeSupabase(seed(a));
  const r = await addEntry(sb, a, [], { kind: "note", body: "À préparer avant l'appel.", at: "2026-11-16T17:10:00Z" }, NOW);
  ok("note ajoutée : une ligne rangée, la candidature n'est pas touchée", r.ok && r.entries.length === 1 && tables.application_entries.length === 1 && String(tables.application_entries[0].application_id) === "a1" && Object.keys(r.appPatch).length === 0 && tables.applications[0].status === "postule");
  const bad = await addEntry(sb, a, [], { kind: "note", body: "  " }, NOW);
  ok("note vide : refusée, rien rangé", !bad.ok && tables.application_entries.length === 1);
}

// ---------- Contact téléphonique : sans relance, la candidature passe à Entretien ----------
{
  const a = app();
  const { sb, tables } = fakeSupabase(seed(a));
  const r = await addEntry(sb, a, [], { kind: "interview", interview_kind: "contact", title: "Premier contact téléphonique", at: "2026-11-17T15:15:00Z" }, NOW);
  const row = tables.applications[0];
  ok("contact : la date et le type « contact » sont gardés sur la candidature", r.ok && row.interview_at === "2026-11-17T15:15:00.000Z" && row.interview_kind === "contact");
  ok("contact : Postulé passe à Entretien, sans date de relance programmée", r.ok && r.moved === "entretien" && row.status === "entretien" && row.next_action_at === null);
  const again = await addEntry(sb, { ...a, ...row } as Application, r.ok ? r.entries : [], { kind: "interview", interview_kind: "entretien", at: "2026-11-25T09:00:00Z" }, NOW);
  ok("un vrai entretien ensuite : le type passe à « entretien », l'étape ne bouge plus", again.ok && again.moved === null && tables.applications[0].interview_kind === "entretien" && tables.applications[0].interview_at === "2026-11-25T09:00:00.000Z" && again.entries.length === 2);
}
{
  const a = app({ status: "offre" as never });
  const { sb, tables } = fakeSupabase(seed(a));
  const r = await addEntry(sb, a, [], { kind: "interview", interview_kind: "entretien", at: "2026-11-20T09:00:00Z" }, NOW);
  ok("étape plus avancée (Offre) : un entretien noté ne la fait pas reculer", r.ok && r.moved === null && tables.applications[0].status === "offre");
}

// ---------- Candidature d'avant : une date sans ligne ----------
{
  const a = app({ status: "entretien" as never, interview_at: "2026-11-01T09:00:00Z" });
  const { sb, tables } = fakeSupabase(seed(a));
  const r = await addEntry(sb, a, [], { kind: "interview", interview_kind: "contact", at: "2026-11-17T15:15:00Z" }, NOW);
  ok("un second entretien : l'ancienne date devient une vraie ligne (rien ne disparaît), les deux sont dans le dossier", r.ok && r.entries.length === 2 && tables.application_entries.length === 2 && tables.application_entries.some((x) => x.at === "2026-11-01T09:00:00Z" && x.interview_kind === "entretien"));
  const only = fakeSupabase(seed(a));
  const n = await addEntry(only.sb, a, [], { kind: "note", body: "Une note" }, NOW);
  ok("une note sur une candidature d'avant : l'ancienne date n'est pas touchée ni dupliquée", n.ok && only.tables.application_entries.length === 1 && only.tables.applications[0].interview_at === "2026-11-01T09:00:00Z");
}
{
  const a = app({ status: "entretien" as never, interview_at: "2026-11-01T09:00:00Z" });
  const { sb, tables } = fakeSupabase(seed(a));
  const r = await updateEntry(sb, a, [], LEGACY_ID, { interview_kind: "contact", at: "2026-11-02T09:00:00Z", title: "Appel" }, NOW);
  ok("modifier l'entretien d'avant : une ligne est créée avec les nouvelles valeurs, la candidature suit", r.ok && r.entries.length === 1 && tables.application_entries.length === 1 && tables.applications[0].interview_kind === "contact" && tables.applications[0].interview_at === "2026-11-02T09:00:00.000Z");
  const b = fakeSupabase(seed(a));
  const d = await deleteEntry(b.sb, a, [], LEGACY_ID);
  ok("supprimer l'entretien d'avant : la date de la candidature est effacée", d.ok && b.tables.applications[0].interview_at === null && b.tables.applications[0].interview_kind === null);
}

// ---------- Modifier, supprimer ----------
{
  const a = app({ status: "entretien" as never });
  const { sb, tables } = fakeSupabase(seed(a));
  const r1 = await addEntry(sb, a, [], { kind: "interview", interview_kind: "entretien", at: "2026-11-12T09:00:00Z" }, NOW);
  const r2 = r1.ok ? await addEntry(sb, a, r1.entries, { kind: "interview", interview_kind: "contact", at: "2026-11-20T09:00:00Z" }, NOW) : r1;
  const list = r2.ok ? r2.entries : [];
  ok("deux entretiens : la candidature retient le plus récent (un contact : aucune relance)", list.length === 2 && tables.applications[0].interview_kind === "contact");
  const last = list.find((x) => x.interview_kind === "contact")!;
  const del = await deleteEntry(sb, a, list, last.id);
  ok("supprimer le plus récent : la candidature retient l'entretien d'avant (la relance repart de lui)", del.ok && del.entries.length === 1 && tables.applications[0].interview_kind === "entretien" && tables.applications[0].interview_at === "2026-11-12T09:00:00.000Z" && tables.application_entries.length === 1);
  const first = (del.ok ? del.entries : [])[0];
  const edit = await updateEntry(sb, a, del.ok ? del.entries : [], first.id, { at: "2026-11-14T09:00:00Z", interview_kind: "contact", title: "Appel RH" }, NOW);
  ok("modifier un entretien : date, type et titre changent, la candidature suit", edit.ok && tables.applications[0].interview_kind === "contact" && tables.applications[0].interview_at === "2026-11-14T09:00:00.000Z" && tables.application_entries[0].title === "Appel RH");
  ok("modifier un élément ne peut pas changer son type (une note reste une note)", (await (async () => {
    const f = fakeSupabase(seed(a, { application_entries: [{ id: "n1", application_id: "a1", kind: "note", body: "x", at: "2026-11-16T17:10:00Z" }] }));
    const e = [{ id: "n1", application_id: "a1", kind: "note", title: null, body: "x", at: "2026-11-16T17:10:00Z", interview_kind: null, created_at: "" }] as Entry[];
    const r = await updateEntry(f.sb, a, e, "n1", { kind: "interview", body: "changé", interview_kind: "entretien", at: "2026-11-12T09:00:00Z" }, NOW);
    return r.ok && f.tables.application_entries[0].kind === "note" && f.tables.application_entries[0].body === "changé";
  })()));
  const ghost = await updateEntry(sb, a, [], "inconnu", { body: "x" }, NOW);
  ok("élément déjà supprimé ailleurs : message clair, rien d'écrit", !ghost.ok && /n'existe plus/.test(err(ghost)));
}

// ---------- Base pas à jour ----------
{
  const a = app();
  const { sb, tables } = fakeSupabase(seed(a), {}, { missing: ["application_entries"] });
  const r = await addEntry(sb, a, [], { kind: "note", body: "x" }, NOW);
  ok("table absente : « mets la base à jour » (jamais une erreur technique), rien d'écrit sur la candidature", !r.ok && err(r) === NEED_DB && tables.applications[0].status === "postule");
}
{
  // La colonne du type manque : la date est quand même écrite (comme avant), sans le type
  const a = app();
  const f = fakeSupabase(seed(a));
  const patched: Row[] = [];
  const realFrom = (f.sb as unknown as { from: (t: string) => Record<string, unknown> }).from;
  const sb = { from: (t: string) => {
    const q = realFrom(t) as { update: (p: Row) => unknown };
    if (t !== "applications") return q;
    return { ...q, update: (p: Row) => { patched.push(p); if ("interview_kind" in p) return { eq: async () => ({ data: null, error: { code: "PGRST204", message: "Could not find the 'interview_kind' column of 'applications' in the schema cache" } }) }; return q.update(p); } };
  } };
  const w = await writeApplication(sb as never, "a1", { interview_at: "2026-11-17T15:15:00.000Z", interview_kind: "contact" });
  ok("colonne du type absente : la date est écrite sans le type, sans erreur", w.error === null && !("interview_kind" in w.applied) && w.applied.interview_at === "2026-11-17T15:15:00.000Z" && patched.length === 2 && f.tables.applications[0].interview_at === "2026-11-17T15:15:00.000Z");
}
ok("isMissingKindColumn : reconnaît PGRST204, 42703 et le message de PostgREST, rien d'autre", isMissingKindColumn({ code: "PGRST204" }) && isMissingKindColumn({ code: "42703" }) && isMissingKindColumn({ message: "column applications.interview_kind does not exist" }) && !isMissingKindColumn({ message: "JWT expired" }) && !isMissingKindColumn(null) && !isMissingKindColumn({ message: "column x.posted_at does not exist" }));
{
  resetKindCache();
  let calls = 0;
  const mk = (error: unknown) => ({ from: () => ({ select: () => ({ limit: async () => { calls++; return { error }; } }) }) }) as never;
  ok("sonde : colonne présente = oui (gardée en mémoire, une seule requête)", (await hasInterviewKind(mk(null), 0)) === true && (await hasInterviewKind(mk(null), 1000)) === true && calls === 1);
  resetKindCache(); calls = 0;
  ok("sonde : colonne absente = non, relue après 30 s ; échec de réseau = non, sans rien retenir", (await hasInterviewKind(mk({ code: "PGRST204" }), 0)) === false && (await hasInterviewKind(mk(null), 10_000)) === false && calls === 1 && (await hasInterviewKind(mk(null), 31_000)) === true && (resetKindCache(), (await hasInterviewKind(mk({ message: "fetch failed" }), 0)) === false && (await hasInterviewKind(mk(null), 1)) === true));
}

// ---------- Remettre d'accord ----------
{
  const a = app({ status: "entretien" as never, interview_at: "2026-11-01T09:00:00Z" });
  const entries = [{ id: "i1", application_id: "a1", kind: "interview", title: null, body: null, at: "2026-11-17T15:15:00Z", interview_kind: "contact", created_at: "" }] as Entry[];
  const { sb, tables } = fakeSupabase(seed(a));
  ok("avant : la candidature a gardé l'ancienne date", needsSync(a, entries));
  const p = await syncIfNeeded(sb, a, entries);
  ok("remise d'accord : date et type du plus récent entretien écrits", p?.interview_kind === "contact" && tables.applications[0].interview_at === "2026-11-17T15:15:00.000Z" && tables.applications[0].interview_kind === "contact");
  ok("sans ligne d'entretien : rien à faire, rien écrit", (await syncIfNeeded(sb, a, [])) === null);
}

// ---------- Plafond ----------
{
  const a = app();
  const { sb } = fakeSupabase(seed(a));
  const many = Array.from({ length: 200 }, (_, i) => ({ id: `e${i}`, application_id: "a1", kind: "note", title: null, body: "x", at: "2026-11-16T17:10:00Z", interview_kind: null, created_at: "" })) as Entry[];
  const r = await addEntry(sb, a, many, { kind: "note", body: "de trop" }, NOW);
  ok("200 éléments au plus par dossier", !r.ok && /200 éléments/.test(err(r)));
}
done();
