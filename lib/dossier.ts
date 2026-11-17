/**
 * Dossier d'offre (23e paquet, 17 novembre 2026) : tout ce qui concerne une candidature au même endroit, daté.
 * Logique pure, lisible par l'écran (aucun import serveur), testée par tests/dossier.test.ts ; l'écran est components/dossier.tsx,
 * la lecture et l'écriture en base sont dans lib/dossier-db.ts.
 *
 * Un « élément » du dossier (table `application_entries`, mise à jour 8 de la base) est :
 *  - une note, un e-mail collé ou un texte (le texte reste là, daté : jamais envoyé à une IA) ;
 *  - un entretien, de type « contact ou téléphone » (ne lance PAS le délai de relance) ou « entretien » (le lance, 14 jours après le dernier).
 * La candidature garde `interview_at` et `interview_kind` : la date et le type du PLUS RÉCENT entretien. L'accueil, l'agenda, le récap et la
 * barre latérale ne lisent que ces deux champs, donc rien d'autre ne change ailleurs. Une candidature d'avant (une seule date, sans type) est lue
 * comme un entretien (`legacyInterview`).
 */
import { addDays, dateOf, dayDiff, fmtDate, today as todayOf } from "./format";
import { CHANNELS, statusLabel, type Application, type StatusId } from "./types";
import { FOLLOWUP_AFTER_DAYS, followupDue, followupOn, isFollowupStatus } from "./followup";

export type EntryKind = "note" | "email" | "text" | "interview";
export type InterviewKind = "contact" | "entretien";

export const ENTRY_KINDS: readonly EntryKind[] = ["note", "email", "text", "interview"];
export const INTERVIEW_KINDS: readonly InterviewKind[] = ["contact", "entretien"];
export const ENTRY_LABEL: Record<EntryKind, string> = { note: "Note", email: "E-mail collé", text: "Texte", interview: "Entretien" };
export const INTERVIEW_LABEL: Record<InterviewKind, string> = { contact: "Contact ou téléphone", entretien: "Entretien" };
/** Identifiant de l'entretien « d'avant » (une seule date sur la candidature, aucune ligne dans la table) : il n'existe qu'à l'écran. */
export const LEGACY_ID = "legacy";
export const LIMITS = { title: 120, body: 20_000, entries: 200 } as const;

export type Entry = {
  id: string;
  application_id: string;
  kind: EntryKind;
  title: string | null;
  body: string | null;
  at: string;
  interview_kind: InterviewKind | null;
  created_at: string;
};
export type CleanEntry = Pick<Entry, "kind" | "title" | "body" | "at" | "interview_kind">;
export type EntryInput = { kind?: unknown; title?: unknown; body?: unknown; at?: unknown; interview_kind?: unknown };
export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const MIN_AT = Date.parse("2020-01-01T00:00:00Z");

/** Objet d'un e-mail collé (« Objet : … », « Subject : … »), pour le titre quand la personne n'en donne pas. */
export function subjectOf(body: string): string | null {
  const m = body.match(/^[ \t>]*(?:objet|subject|sujet)[ \t]*:[ \t]*(.+)$/im);
  const s = m?.[1]?.replace(/\s+/g, " ").trim();
  return s ? s.slice(0, LIMITS.title) : null;
}

/** Vérifie et nettoie un élément avant de l'écrire. Une note ou un texte vide, un entretien sans date ou sans type, une date absurde : refusés avec une phrase claire. */
export function cleanEntry(input: EntryInput, now: Date = new Date()): Checked<CleanEntry> {
  const kind = input.kind;
  if (typeof kind !== "string" || !(ENTRY_KINDS as readonly string[]).includes(kind)) return fail("Choisis le type d'élément.");
  const k = kind as EntryKind;
  const body = typeof input.body === "string" ? input.body.replace(/\r\n?/g, "\n").trim() : "";
  if (body.length > LIMITS.body) return fail("Ce texte est trop long (20 000 signes au plus).");
  const title = typeof input.title === "string" ? input.title.replace(/\s+/g, " ").trim() : "";
  if (title.length > LIMITS.title) return fail("Ce titre est trop long (120 signes au plus).");

  let at: string;
  if (input.at === undefined || input.at === null || input.at === "") {
    if (k === "interview") return fail("Indique la date et l'heure.");
    at = now.toISOString();
  } else {
    const ms = typeof input.at === "string" ? Date.parse(input.at) : NaN;
    if (!Number.isFinite(ms) || ms < MIN_AT) return fail("Cette date n'est pas valide.");
    const limit = k === "interview" ? now.getTime() + 2 * 365 * 864e5 : now.getTime() + 864e5;
    if (ms > limit) return fail(k === "interview" ? "Cette date est trop lointaine." : "Un élément ne peut pas être daté dans le futur : indique le jour où tu l'as reçu ou écrit.");
    at = new Date(ms).toISOString();
  }

  if (k === "interview") {
    const ik = input.interview_kind;
    if (typeof ik !== "string" || !(INTERVIEW_KINDS as readonly string[]).includes(ik)) return fail("Choisis « Contact ou téléphone » ou « Entretien ».");
    return { ok: true, value: { kind: k, title: title || null, body: body || null, at, interview_kind: ik as InterviewKind } };
  }
  if (!body) return fail(k === "note" ? "Écris ta note." : k === "email" ? "Colle le texte de l'e-mail." : "Colle ou écris le texte.");
  return { ok: true, value: { kind: k, title: title || (k === "email" ? subjectOf(body) : null) || null, body, at, interview_kind: null } };
}

// ---------- Entretiens : ce que la candidature en retient ----------

type AppIv = Pick<Application, "id"> & { interview_at?: string | null; interview_kind?: string | null };

/** L'entretien « d'avant » : la candidature a une date mais aucune ligne d'entretien dans le dossier. Lu comme un entretien (sans type = le lance). */
export function legacyInterview(app: AppIv, entries: Entry[]): Entry | null {
  if (!app.interview_at || entries.some((e) => e.kind === "interview")) return null;
  const ik: InterviewKind = app.interview_kind === "contact" ? "contact" : "entretien";
  return { id: LEGACY_ID, application_id: app.id, kind: "interview", title: null, body: null, at: app.interview_at, interview_kind: ik, created_at: app.interview_at };
}

/** Tous les entretiens du dossier (les lignes, ou l'entretien d'avant), du plus ancien au plus récent. */
export function allInterviews(app: AppIv, entries: Entry[]): Entry[] {
  const own = entries.filter((e) => e.kind === "interview");
  const list = own.length ? own : legacyInterview(app, entries) ? [legacyInterview(app, entries)!] : [];
  return [...list].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

/**
 * Ce que la candidature retient : la date et le type du PLUS RÉCENT entretien (jamais « le prochain » : cette valeur est écrite en base et
 * « le prochain » changerait tout seul avec le temps). À date égale, un vrai entretien l'emporte sur un contact.
 * Sans entretien : rien (la candidature est remise à zéro).
 */
export function interviewState(entries: Pick<Entry, "kind" | "at" | "interview_kind">[]): { interview_at: string | null; interview_kind: InterviewKind | null } {
  const list = entries.filter((e) => e.kind === "interview" && Number.isFinite(Date.parse(e.at)));
  if (!list.length) return { interview_at: null, interview_kind: null };
  const best = list.reduce((a, b) => {
    const d = Date.parse(b.at) - Date.parse(a.at);
    return d > 0 || (d === 0 && b.interview_kind === "entretien" && a.interview_kind !== "entretien") ? b : a;
  });
  return { interview_at: new Date(best.at).toISOString(), interview_kind: best.interview_kind === "contact" ? "contact" : "entretien" };
}

/** La candidature a gardé une date ou un type différents de ceux de ses entretiens (une écriture a échoué entre deux) : à remettre d'accord. */
export function needsSync(app: AppIv, entries: Entry[]): boolean {
  if (!entries.some((e) => e.kind === "interview")) return false;
  const s = interviewState(entries);
  const same = app.interview_at ? Date.parse(app.interview_at) === Date.parse(s.interview_at!) : false;
  return !same || (app.interview_kind ?? "entretien") !== s.interview_kind;
}

/** Un contact ou un premier appel fait avancer une candidature qui n'était pas encore à l'étape Entretien ; les autres étapes ne bougent pas. */
export const statusAfterInterview = (status: string): StatusId => (["a_postuler", "postule", "relance"].includes(status) ? "entretien" : (status as StatusId));

// ---------- Changement d'étape (Suivi et dossier : la même règle) ----------

/** Les champs à écrire quand on change l'étape : « postulé » date l'envoi, et aucune relance n'est programmée à l'avance (elle se déduit de l'entretien). */
export function statusPatch(a: { applied_at?: string | null }, status: StatusId, t: string = todayOf()): Partial<Application> {
  const patch: Partial<Application> = { status };
  if (status === "postule" && !a.applied_at) patch.applied_at = t;
  // Pas de relance programmée à la candidature : on ne relance qu'après un entretien (la date se déduit de celui-ci, voir lib/followup.ts)
  if (["refuse", "abandonne", "expiree", "offre", "entretien", "test"].includes(status)) patch.next_action_at = null;
  return patch;
}

// ---------- Détails modifiables sur place ----------

export const CV_VARIANTS = [["data_bi", "Data BI"], ["ba_amoa", "BA / AMOA"], ["autre", "Autre"]] as const;
export type DetailKey = "title" | "company" | "applied_at" | "next_action_at" | "location" | "contract" | "salary" | "channel" | "contact" | "url" | "cv_variant" | "notes";
export const DETAIL_LABEL: Record<DetailKey, string> = {
  title: "Poste", company: "Entreprise", applied_at: "Postulé le", next_action_at: "Relance le", location: "Lieu", contract: "Contrat", salary: "Salaire",
  channel: "Canal", contact: "Contact", url: "Lien de l'annonce", cv_variant: "CV utilisé", notes: "Notes",
};
const MAX_DETAIL = 200;
const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(`${s}T12:00:00Z`)) && new Date(`${s}T12:00:00Z`).toISOString().slice(0, 10) === s;

/** Adresse http(s) seulement : un `javascript:` finirait dans un lien. */
export function httpUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Vérifie la valeur d'un détail avant de l'écrire : vide = effacé (null), sauf le poste, l'entreprise et le canal, qui restent obligatoires. */
export function cleanDetail(key: DetailKey, raw: string): Checked<string | null> {
  const v = (key === "notes" ? raw.replace(/\r\n?/g, "\n") : raw).trim();
  if (key === "title" || key === "company") {
    if (v.length < 2) return fail(key === "title" ? "Indique le poste." : "Indique l'entreprise.");
    return v.length > MAX_DETAIL ? fail("C'est trop long (200 signes au plus).") : { ok: true, value: v.replace(/\s+/g, " ") };
  }
  if (key === "channel") return (CHANNELS as readonly string[]).includes(v) ? { ok: true, value: v } : fail("Choisis un canal dans la liste.");
  if (!v) return { ok: true, value: null };
  if (key === "applied_at" || key === "next_action_at") return isDay(v) ? { ok: true, value: v } : fail("Cette date n'est pas valide.");
  if (key === "cv_variant") return CV_VARIANTS.some(([id]) => id === v) ? { ok: true, value: v } : fail("Choisis un CV dans la liste.");
  if (key === "url") {
    if (v.length > 2000) return fail("Ce lien est trop long.");
    const u = httpUrl(v);
    return u ? { ok: true, value: v } : fail("Le lien doit commencer par http:// ou https://.");
  }
  if (key === "notes") return v.length > 5000 ? fail("Ces notes sont trop longues (5 000 signes au plus).") : { ok: true, value: v };
  return v.length > MAX_DETAIL ? fail("C'est trop long (200 signes au plus).") : { ok: true, value: v.replace(/\s+/g, " ") };
}

// ---------- Le journal : tout, daté, du plus récent au plus ancien ----------

export type MailRow = { id?: string; from_addr: string | null; subject: string | null; snippet: string | null; received_at: string; category?: string | null };
export type DocRow = { id: string; kind: string; created_at: string; reused_from?: string | null; template?: string | null; variant?: string | null };
export type HistRow = { from_status: string | null; to_status: string; changed_at: string };
export type JournalType = "interview" | "note" | "email" | "text" | "gmail" | "doc" | "status";
export type JournalItem = {
  key: string;
  type: JournalType;
  at: string;
  title: string;
  body: string | null;
  /** Ligne du dossier (modifiable) ; null pour ce qui vient d'ailleurs (Gmail, documents, étapes). */
  entry: Entry | null;
  href: string | null;
  upcoming: boolean;
  /** Pastille : ce que cet entretien change pour la relance. */
  badge: string | null;
  sub: string | null;
};

export const DOC_TITLE: Record<string, string> = { cv: "CV généré pour cette offre", lettre: "Lettre de motivation générée", prep: "Préparation d'entretien", relance: "Brouillon de relance" };
const ORDER: Record<JournalType, number> = { interview: 0, email: 1, gmail: 1, note: 2, text: 3, doc: 4, status: 5 };

/** « 16 h 15 » (heure de Paris). */
export function timeOf(iso: string): string {
  const s = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Europe/Paris" }).format(new Date(iso));
  return s.replace(":", " h ");
}

const sender = (from: string | null) => (from ? from.replace(/<[^>]*>/g, "").replace(/["']/g, "").trim() || from : null);

export type JournalInput = { app: Pick<Application, "id" | "status" | "offer_id" | "score" | "interview_at"> & { interview_kind?: string | null }; entries: Entry[]; history: HistRow[]; docs: DocRow[]; emails: MailRow[]; now?: Date };

export function buildJournal({ app, entries, history, docs, emails, now = new Date() }: JournalInput): JournalItem[] {
  const out: JournalItem[] = [];
  const interviews = allInterviews(app, entries);
  const last = interviews.length ? interviews[interviews.length - 1] : null;
  for (const e of [...entries.filter((x) => x.kind !== "interview"), ...interviews]) {
    const ms = Date.parse(e.at);
    if (e.kind === "interview") {
      const contact = e.interview_kind === "contact";
      const on = last && e.id === last.id && !contact ? addDays(FOLLOWUP_AFTER_DAYS, dateOf(e.at)) : null;
      out.push({
        key: `e-${e.id}`, type: "interview", at: e.at, entry: e, href: null, upcoming: ms > now.getTime(),
        title: e.title || INTERVIEW_LABEL[e.interview_kind ?? "entretien"], body: e.body, sub: e.title ? INTERVIEW_LABEL[e.interview_kind ?? "entretien"] : null,
        badge: contact ? "Ne lance pas la relance" : on ? `Relance conseillée le ${fmtDate(on)}` : null,
      });
    } else if (e.kind === "email") {
      out.push({ key: `e-${e.id}`, type: "email", at: e.at, entry: e, href: null, upcoming: false, title: e.title ? `E-mail collé : « ${e.title} »` : "E-mail collé", body: e.body, sub: null, badge: null });
    } else {
      out.push({ key: `e-${e.id}`, type: e.kind, at: e.at, entry: e, href: null, upcoming: false, title: e.kind === "note" ? (e.title || "Note") : (e.title || "Texte"), body: e.body, sub: null, badge: null });
    }
  }
  for (const m of emails) {
    out.push({ key: `m-${m.id ?? m.received_at}`, type: "gmail", at: m.received_at, entry: null, href: null, upcoming: false, title: `E-mail reçu : « ${m.subject?.trim() || "sans objet"} »`, body: m.snippet, sub: sender(m.from_addr), badge: "Gmail" });
  }
  for (const d of docs) {
    out.push({ key: `d-${d.id}`, type: "doc", at: d.created_at, entry: null, href: `/documents/${d.id}`, upcoming: false, title: `${DOC_TITLE[d.kind] ?? "Document"}${d.reused_from ? " (réutilisé)" : ""}`, body: null, sub: null, badge: null });
  }
  for (const [i, h] of history.entries()) {
    const created = !h.from_status;
    out.push({
      key: `h-${i}-${h.changed_at}`, type: "status", at: h.changed_at, entry: null, href: null, upcoming: false, title: `Étape : ${statusLabel(h.to_status)}`, body: null, badge: null,
      sub: created ? `candidature créée ${app.offer_id ? "depuis une offre analysée" : "à la main"}${app.offer_id && app.score != null ? `, score ${app.score} %` : ""}` : `depuis ${statusLabel(h.from_status!)}`,
    });
  }
  return out
    .map((it, i) => ({ it, i }))
    .sort((a, b) => {
      const da = Date.parse(a.it.at), db = Date.parse(b.it.at);
      if (Number.isFinite(da) !== Number.isFinite(db)) return Number.isFinite(da) ? -1 : 1;
      return db - da || ORDER[a.it.type] - ORDER[b.it.type] || a.i - b.i;
    })
    .map((x) => x.it);
}

/** « Aujourd'hui », « Demain », sinon « 16 novembre » (l'année seulement quand ce n'est pas l'année en cours). */
export function dayLabel(day: string, t: string = todayOf()): string {
  const n = dayDiff(t, day);
  if (n === 0) return "Aujourd'hui";
  if (n === 1) return "Demain";
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", ...(day.slice(0, 4) === t.slice(0, 4) ? {} : { year: "numeric" }), timeZone: "UTC" });
}

export type DayGroup = { day: string; label: string; items: JournalItem[] };
/** Regroupe le journal par jour (heure de Paris), dans l'ordre déjà trié. */
export function groupByDay(items: JournalItem[], t: string = todayOf()): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const it of items) {
    const day = Number.isFinite(Date.parse(it.at)) ? dateOf(it.at) : "0000-00-00";
    const g = groups[groups.length - 1];
    if (g && g.day === day) g.items.push(it);
    else groups.push({ day, label: day === "0000-00-00" ? "Sans date" : dayLabel(day, t), items: [it] });
  }
  return groups;
}

const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
/** Recherche dans le dossier : sans accents ni majuscules, tous les mots, dans le titre, le texte et la mention. */
export function matchesQuery(it: Pick<JournalItem, "title" | "body" | "sub" | "badge">, q: string): boolean {
  const words = fold(q).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = fold(`${it.title} ${it.body ?? ""} ${it.sub ?? ""} ${it.badge ?? ""}`);
  return words.every((w) => hay.includes(w));
}

// ---------- « Prochaine étape » ----------

export type Focus = { tone: "next" | "late" | "idle"; heading: string; sub: string; hint: string | null; canAdd: boolean };

const weekdayDay = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Paris" });
const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** Termine une phrase par un point, sans doubler celui d'une date abrégée (« 17 nov. » + « . » donnerait « 17 nov.. »). */
const endWith = (s: string) => (s.endsWith(".") ? s : `${s}.`);

/** Ce qu'il y a à faire ensuite, pour la carte jaune à droite du dossier. */
export function focusOf(app: Pick<Application, "id" | "status" | "company" | "next_action_at" | "last_email_at"> & { interview_at?: string | null; interview_kind?: string | null }, entries: Entry[], now: Date = new Date()): Focus {
  const t = dateOf(now.toISOString());
  const list = allInterviews(app, entries);
  const next = list.find((e) => Date.parse(e.at) > now.getTime());
  const state = interviewState(list);
  const view = { ...app, ...state };
  if (next) {
    const day = dateOf(next.at);
    const contact = next.interview_kind === "contact";
    return {
      tone: "next",
      heading: `${day === t ? "Aujourd'hui" : day === addDays(1, t) ? "Demain" : sentence(weekdayDay(next.at))}, ${timeOf(next.at)}`,
      sub: next.title || INTERVIEW_LABEL[next.interview_kind ?? "entretien"],
      hint: contact
        ? `Un simple contact ne lance pas de relance. Elle part ${FOLLOWUP_AFTER_DAYS} jours après un vrai entretien.`
        : `Sans réponse de l'entreprise ensuite, JobPilot te propose de relancer ${FOLLOWUP_AFTER_DAYS} jours après.`,
      canAdd: false,
    };
  }
  if (followupDue(view, t)) {
    return { tone: "late", heading: "Relance à faire", sub: `Dernier entretien le ${fmtDate(view.interview_at)}, sans nouvelles de ${app.company}.`, hint: null, canAdd: false };
  }
  const on = followupOn(view);
  const wrote = app.last_email_at && view.interview_at && dateOf(app.last_email_at) > dateOf(view.interview_at) && !(app.next_action_at && app.next_action_at.slice(0, 10) > dateOf(view.interview_at));
  if (on && wrote) return { tone: "idle", heading: "L'entreprise a répondu", sub: `${app.company} a écrit le ${fmtDate(app.last_email_at)} : pas de relance à faire.`, hint: null, canAdd: true };
  if (on) return { tone: "idle", heading: `Relance conseillée le ${fmtDate(on)}`, sub: endWith(`Dernier entretien le ${fmtDate(view.interview_at)}`), hint: "Si l'entreprise écrit avant, la relance n'a plus lieu d'être.", canAdd: true };
  if (isFollowupStatus(app.status) && !list.length) {
    return { tone: "idle", heading: "Entretien à dater", sub: "Ajoute sa date et son heure.", hint: `JobPilot te proposera de relancer ${FOLLOWUP_AFTER_DAYS} jours après, si l'entreprise n'a pas répondu.`, canAdd: true };
  }
  if (view.interview_kind === "contact" && view.interview_at && isFollowupStatus(app.status)) {
    return { tone: "idle", heading: "Contact noté", sub: `Dernier échange le ${fmtDate(view.interview_at)} ; la relance ne démarre qu'après un vrai entretien.`, hint: "Sans nouvelles de l'entreprise, la candidature te sera proposée dans « sans nouvelles » au bout de trois semaines.", canAdd: true };
  }
  return { tone: "idle", heading: "Aucune étape prévue", sub: "Ajoute un entretien, une note ou un e-mail pour garder la trace.", hint: null, canAdd: true };
}
