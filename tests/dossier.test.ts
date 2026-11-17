// Dossier d'offre (23e paquet) : validation des éléments, entretiens (contact / entretien), journal daté, détails modifiables, « prochaine étape ».
import { ENTRY_KINDS, LEGACY_ID, allInterviews, buildJournal, cleanDetail, cleanEntry, dayLabel, focusOf, groupByDay, httpUrl, interviewState, legacyInterview, matchesQuery, needsSync, statusAfterInterview, statusPatch, subjectOf, timeOf, type Entry } from "../lib/dossier";
import { ok, done } from "./helpers";

const NOW = new Date("2026-11-17T10:00:00Z"); // 11 h à Paris
const e = (over: Partial<Entry> = {}): Entry => ({ id: "e1", application_id: "a1", kind: "note", title: null, body: "x", at: "2026-11-16T17:10:00Z", interview_kind: null, created_at: "2026-11-16T17:10:00Z", ...over });
const iv = (id: string, at: string, kind: "contact" | "entretien", extra: Partial<Entry> = {}) => e({ id, kind: "interview", at, interview_kind: kind, body: null, ...extra });
const APP = { id: "a1", status: "entretien" as const, company: "SPIE", offer_id: "o1", score: 81, interview_at: null as string | null, interview_kind: null as string | null, next_action_at: null as string | null, last_email_at: null as string | null };

// ---------- Valider un élément ----------
ok("quatre types : note, e-mail, texte, entretien", ENTRY_KINDS.join(",") === "note,email,text,interview");
{
  const r = cleanEntry({ kind: "note", body: "  À préparer avant l'appel.  " }, NOW);
  ok("note : texte nettoyé, datée d'aujourd'hui par défaut, sans titre", r.ok && r.value.body === "À préparer avant l'appel." && r.value.at === NOW.toISOString() && r.value.title === null && r.value.interview_kind === null);
}
ok("note ou texte vide refusés, avec une phrase claire", !cleanEntry({ kind: "note", body: "   " }, NOW).ok && /note/i.test((cleanEntry({ kind: "note", body: "" }, NOW) as { error: string }).error) && !cleanEntry({ kind: "text", body: "" }, NOW).ok && !cleanEntry({ kind: "email" }, NOW).ok);
ok("type inconnu ou absent refusé", !cleanEntry({ kind: "autre", body: "x" }, NOW).ok && !cleanEntry({ body: "x" }, NOW).ok && !cleanEntry({ kind: 3, body: "x" }, NOW).ok);
{
  const r = cleanEntry({ kind: "email", body: "De : recrutement\nObjet : Votre candidature, échange téléphonique\n\nBonjour Juliana…" }, NOW);
  ok("e-mail collé : le titre vient de la ligne « Objet : »", r.ok && r.value.title === "Votre candidature, échange téléphonique");
  const t = cleanEntry({ kind: "email", title: "Mon titre", body: "Objet : Autre\nCorps" }, NOW);
  ok("e-mail collé : le titre donné par la personne l'emporte", t.ok && t.value.title === "Mon titre");
  const n = cleanEntry({ kind: "email", body: "Bonjour, sans objet." }, NOW);
  ok("e-mail sans ligne d'objet : pas de titre inventé", n.ok && n.value.title === null);
  ok("subjectOf lit aussi « Subject : » et ignore les citations », jamais une ligne ordinaire", subjectOf("> Subject: Hello") === "Hello" && subjectOf("Bonjour\nTout va bien") === null);
}
ok("date : une note ne peut pas être datée dans le futur (au-delà d'un jour), ni avant 2020, ni illisible", !cleanEntry({ kind: "note", body: "x", at: "2026-11-20T10:00:00Z" }, NOW).ok && !cleanEntry({ kind: "note", body: "x", at: "2019-05-01T10:00:00Z" }, NOW).ok && !cleanEntry({ kind: "note", body: "x", at: "pas une date" }, NOW).ok && cleanEntry({ kind: "email", body: "x", at: "2026-11-16T18:02:00Z" }, NOW).ok);
ok("limites : texte de plus de 20 000 signes et titre de plus de 120 refusés ; 20 000 pile passent", !cleanEntry({ kind: "text", body: "a".repeat(20_001) }, NOW).ok && cleanEntry({ kind: "text", body: "a".repeat(20_000) }, NOW).ok && !cleanEntry({ kind: "note", title: "t".repeat(121), body: "x" }, NOW).ok);
{
  const ok1 = cleanEntry({ kind: "interview", interview_kind: "contact", title: "Premier contact téléphonique", at: "2026-11-17T15:15:00Z" }, NOW);
  ok("entretien de type contact, sans compte rendu : accepté", ok1.ok && ok1.value.interview_kind === "contact" && ok1.value.body === null && ok1.value.title === "Premier contact téléphonique");
  ok("entretien : la date (et l'heure) et le type sont obligatoires", !cleanEntry({ kind: "interview", interview_kind: "entretien" }, NOW).ok && !cleanEntry({ kind: "interview", at: "2026-11-20T10:00:00Z" }, NOW).ok && !cleanEntry({ kind: "interview", interview_kind: "test", at: "2026-11-20T10:00:00Z" }, NOW).ok);
  ok("entretien : une date à venir est permise (jusqu'à 2 ans), pas au-delà", cleanEntry({ kind: "interview", interview_kind: "entretien", at: "2026-12-10T09:00:00Z" }, NOW).ok && !cleanEntry({ kind: "interview", interview_kind: "entretien", at: "2029-01-01T09:00:00Z" }, NOW).ok);
  ok("un type d'entretien sur une note est ignoré (jamais rangé)", (cleanEntry({ kind: "note", body: "x", interview_kind: "contact" }, NOW) as { value: { interview_kind: unknown } }).value.interview_kind === null);
}

// ---------- Ce que la candidature retient des entretiens ----------
ok("aucun entretien : la candidature est remise à zéro", JSON.stringify(interviewState([])) === JSON.stringify({ interview_at: null, interview_kind: null }) && interviewState([e()]).interview_at === null);
{
  const list = [iv("1", "2026-11-17T15:15:00Z", "contact"), iv("2", "2026-11-25T09:00:00Z", "entretien"), e({ id: "n", at: "2026-12-30T09:00:00Z" })];
  const s = interviewState(list);
  ok("plusieurs entretiens : le plus récent donne la date et le type (une note plus récente ne compte pas)", s.interview_at === "2026-11-25T09:00:00.000Z" && s.interview_kind === "entretien");
  const s2 = interviewState([iv("1", "2026-11-10T09:00:00Z", "entretien"), iv("2", "2026-11-17T15:15:00Z", "contact")]);
  ok("un contact plus récent qu'un entretien : le type est « contact » (il compte comme une réponse, aucune relance automatique)", s2.interview_kind === "contact" && s2.interview_at === "2026-11-17T15:15:00.000Z");
  const s3 = interviewState([iv("1", "2026-11-17T15:15:00Z", "contact"), iv("2", "2026-11-17T15:15:00Z", "entretien")]);
  ok("même instant : le vrai entretien l'emporte sur le contact", s3.interview_kind === "entretien");
}
{
  const a = { id: "a1", interview_at: "2026-11-01T09:00:00Z", interview_kind: null };
  const l = legacyInterview(a, []);
  ok("candidature d'avant (une date, aucune ligne) : lue comme UN entretien", l?.id === LEGACY_ID && l.interview_kind === "entretien" && l.at === a.interview_at);
  ok("… ou comme un contact si la candidature le dit", legacyInterview({ ...a, interview_kind: "contact" }, [])?.interview_kind === "contact");
  ok("dès qu'une ligne d'entretien existe, l'ancienne date n'est plus lue à part ; une note ne la remplace pas", legacyInterview(a, [iv("1", "2026-11-02T09:00:00Z", "entretien")]) === null && legacyInterview(a, [e()])?.id === LEGACY_ID && legacyInterview({ id: "a1" }, []) === null);
  ok("allInterviews : du plus ancien au plus récent, l'ancienne date comprise", allInterviews(a, []).length === 1 && allInterviews(a, [iv("2", "2026-11-20T09:00:00Z", "entretien"), iv("1", "2026-11-05T09:00:00Z", "contact")]).map((x) => x.id).join() === "1,2");
}
ok("needsSync : la candidature a gardé une autre date ou un autre type que ses entretiens", needsSync({ id: "a", interview_at: "2026-11-01T09:00:00Z", interview_kind: null }, [iv("1", "2026-11-17T15:15:00Z", "contact")]) && needsSync({ id: "a", interview_at: "2026-11-17T15:15:00Z", interview_kind: null }, [iv("1", "2026-11-17T15:15:00Z", "contact")]));
ok("needsSync : d'accord (même instant écrit autrement, type absent = entretien) ou aucun entretien : rien à faire", !needsSync({ id: "a", interview_at: "2026-11-17T15:15:00+00:00", interview_kind: "contact" }, [iv("1", "2026-11-17T15:15:00Z", "contact")]) && !needsSync({ id: "a", interview_at: "2026-11-17T15:15:00Z", interview_kind: null }, [iv("1", "2026-11-17T15:15:00Z", "entretien")]) && !needsSync({ id: "a", interview_at: "2026-11-01T09:00:00Z" }, []));

// ---------- Étapes ----------
ok("un contact ou un entretien fait avancer À postuler, Postulé et Relancé à « Entretien » ; les autres étapes ne bougent pas", ["a_postuler", "postule", "relance"].every((s) => statusAfterInterview(s) === "entretien") && ["entretien", "test", "offre", "refuse", "abandonne", "expiree"].every((s) => statusAfterInterview(s) === s));
ok("statusPatch : postulé date l'envoi, une étape après l'envoi n'efface pas la date existante, Entretien / Test / issues vident la relance programmée", statusPatch({ applied_at: null }, "postule", "2026-11-17").applied_at === "2026-11-17" && statusPatch({ applied_at: "2026-11-01" }, "postule", "2026-11-17").applied_at === undefined && ["entretien", "test", "offre", "refuse", "abandonne", "expiree"].every((s) => statusPatch({}, s as never).next_action_at === null) && !("next_action_at" in statusPatch({}, "postule")));

// ---------- Détails modifiables sur place ----------
const bad = (k: Parameters<typeof cleanDetail>[0], v: string) => !cleanDetail(k, v).ok;
ok("poste et entreprise : 2 signes au moins, jamais vides", bad("title", " ") && bad("title", "a") && bad("company", "") && cleanDetail("title", "  Data   analyst ").ok && (cleanDetail("title", "  Data   analyst ") as { value: string }).value === "Data analyst");
ok("lieu, contrat, salaire, contact : vider = effacer (null) ; 200 signes au plus", (cleanDetail("salary", "  ") as { value: unknown }).value === null && (cleanDetail("location", "Paris") as { value: unknown }).value === "Paris" && bad("contact", "c".repeat(201)));
ok("lien : seulement http(s) (un javascript: n'entre jamais dans un href)", bad("url", "javascript:alert(1)") && bad("url", "pas un lien") && bad("url", "data:text/html,x") && cleanDetail("url", "https://exemple.fr/offre/1").ok && (cleanDetail("url", "") as { value: unknown }).value === null && httpUrl("ftp://x.fr") === null);
ok("dates : AAAA-MM-JJ réel seulement (pas le 30 février)", cleanDetail("applied_at", "2026-11-16").ok && bad("applied_at", "2026-02-30") && bad("next_action_at", "16/11/2026") && (cleanDetail("applied_at", "") as { value: unknown }).value === null);
ok("canal : dans la liste, et obligatoire ; CV utilisé : dans la liste ou vide", cleanDetail("channel", "LinkedIn").ok && bad("channel", "") && bad("channel", "Inconnu") && cleanDetail("cv_variant", "data_bi").ok && bad("cv_variant", "x") && (cleanDetail("cv_variant", "") as { value: unknown }).value === null);
ok("notes : 5 000 signes au plus, retours à la ligne gardés", bad("notes", "n".repeat(5001)) && (cleanDetail("notes", "a\r\nb") as { value: string }).value === "a\nb");

// ---------- Le journal ----------
const docs = [{ id: "d1", kind: "cv", created_at: "2026-11-16T17:00:00Z" }, { id: "d2", kind: "lettre", created_at: "2026-11-16T17:05:00Z", reused_from: "d0" }];
const history = [{ from_status: null, to_status: "postule", changed_at: "2026-11-16T16:30:00Z" }, { from_status: "postule", to_status: "entretien", changed_at: "2026-11-17T08:00:00Z" }];
const emails = [{ id: "m1", from_addr: "\"SPIE RH\" <rh@spie.com>", subject: "Votre candidature", snippet: "Nous avons bien reçu…", received_at: "2026-11-16T09:00:00Z" }, { id: "m2", from_addr: null, subject: null, snippet: null, received_at: "2026-11-15T09:00:00Z" }];
const entries = [
  iv("i1", "2026-11-17T15:15:00Z", "contact", { title: "Premier contact téléphonique" }),
  e({ id: "n1", kind: "note", body: "À préparer avant l'appel.", at: "2026-11-16T17:10:00Z" }),
  e({ id: "m", kind: "email", title: "Votre candidature, échange téléphonique", body: "Bonjour…", at: "2026-11-16T17:02:00Z" }),
  e({ id: "t1", kind: "text", body: "Description du poste", at: "2026-11-16T17:20:00Z" }),
];
const J = buildJournal({ app: APP, entries, history, docs, emails, now: NOW });
ok("journal : tout y est (4 éléments, 2 e-mails Gmail, 2 documents, 2 étapes), du plus récent au plus ancien", J.length === 10 && J.every((x, i) => i === 0 || Date.parse(J[i - 1].at) >= Date.parse(x.at)), J.map((x) => x.key).join());
ok("journal : l'entretien à venir est en tête, marqué « à venir », avec « Ne lance pas la relance »", J[0].type === "interview" && J[0].upcoming && J[0].badge === "Ne lance pas la relance" && J[0].title === "Premier contact téléphonique" && J[0].sub === "Contact ou téléphone");
ok("journal : titres lisibles (e-mail collé avec son objet, e-mail Gmail, document réutilisé, étape)", J.some((x) => x.title === "E-mail collé : « Votre candidature, échange téléphonique »") && J.some((x) => x.title === "E-mail reçu : « Votre candidature »" && x.badge === "Gmail" && x.sub === "SPIE RH") && J.some((x) => x.title === "E-mail reçu : « sans objet »") && J.some((x) => x.title === "Lettre de motivation générée (réutilisé)" && x.href === "/documents/d2") && J.some((x) => x.title === "CV généré pour cette offre"));
ok("journal : la création de la candidature dit d'où elle vient et son score ; un changement d'étape dit d'où il part", J.some((x) => x.title === "Étape : Postulé" && x.sub === "candidature créée depuis une offre analysée, score 81 %") && J.some((x) => x.title === "Étape : Entretien" && x.sub === "depuis Postulé"));
ok("journal : une ligne d'élément porte son enregistrement (pour la modifier), pas Gmail ni les documents", J.filter((x) => x.entry).length === 4 && J.filter((x) => x.type === "doc" || x.type === "gmail" || x.type === "status").every((x) => x.entry === null));
{
  const two = buildJournal({ app: APP, entries: [iv("a", "2026-11-05T09:00:00Z", "entretien", { title: "RH" }), iv("b", "2026-11-12T09:00:00Z", "entretien", { title: "Manager" })], history: [], docs: [], emails: [], now: NOW });
  ok("deux vrais entretiens : seule la relance du dernier est annoncée (14 jours après)", two[0].title === "Manager" && /^Relance conseillée le /.test(two[0].badge ?? "") && two[1].badge === null);
  const legacy = buildJournal({ app: { ...APP, interview_at: "2026-11-01T09:00:00Z" }, entries: [], history: [], docs: [], emails: [], now: NOW });
  ok("candidature d'avant : son entretien unique apparaît dans le journal (id « legacy »), passé donc pas « à venir »", legacy.length === 1 && legacy[0].entry?.id === LEGACY_ID && !legacy[0].upcoming);
}
ok("journal vide : aucune ligne, sans erreur", buildJournal({ app: APP, entries: [], history: [], docs: [], emails: [], now: NOW }).length === 0);
ok("une date illisible va à la fin, jamais devant", (() => { const j = buildJournal({ app: APP, entries: [], history: [], docs: [], emails: [{ from_addr: null, subject: "a", snippet: null, received_at: "n'importe quoi" }, { from_addr: null, subject: "b", snippet: null, received_at: "2026-11-01T09:00:00Z" }], now: NOW }); return j[0].title.includes("« b »"); })());

// ---------- Jours ----------
ok("jours : Aujourd'hui, Demain, puis la date (l'année seulement si ce n'est pas l'année en cours)", dayLabel("2026-11-17", "2026-11-17") === "Aujourd'hui" && dayLabel("2026-11-18", "2026-11-17") === "Demain" && dayLabel("2026-11-16", "2026-11-17") === "16 novembre" && dayLabel("2025-12-24", "2026-11-17") === "24 décembre 2025");
{
  const g = groupByDay(J, "2026-11-17");
  ok("journal par jour : à venir et aujourd'hui, puis le 16 novembre, le 15", g.map((x) => x.label).join("|") === "Aujourd'hui|16 novembre|15 novembre" && g[0].items.length === 2 && g.reduce((n, x) => n + x.items.length, 0) === J.length, g.map((x) => `${x.label}:${x.items.length}`).join("|"));
  ok("l'heure se lit à l'heure de Paris : « 16 h 15 »", timeOf("2026-11-17T15:15:00Z") === "16 h 15" && timeOf("2026-07-01T07:05:00Z") === "09 h 05");
}
ok("recherche : sans accents ni majuscules, tous les mots, titre, texte et mention compris", matchesQuery(J[0], "contact telephonique") && matchesQuery(J.find((x) => x.key === "e-n1")!, "PREPARER appel") && !matchesQuery(J.find((x) => x.key === "e-n1")!, "preparer salaire") && matchesQuery(J[0], "   ") && matchesQuery(J[0], "relance"));

// ---------- Prochaine étape ----------
{
  const fo = (a: Partial<typeof APP>, es: Entry[], now = NOW) => focusOf({ ...APP, ...a }, es, now);
  const f1 = fo({}, [iv("i1", "2026-11-17T15:15:00Z", "contact")]);
  ok("contact à venir aujourd'hui : « Aujourd'hui, 16 h 15 », rappelle qu'il ne lance pas de relance", f1.tone === "next" && f1.heading === "Aujourd'hui, 16 h 15" && f1.sub === "Contact ou téléphone" && /ne lance pas de relance/.test(f1.hint ?? "") && /14 jours/.test(f1.hint ?? ""));
  const f2 = fo({}, [iv("i1", "2026-11-25T09:00:00Z", "entretien", { title: "Entretien manager" })]);
  ok("entretien à venir : le jour en toutes lettres, et la relance annoncée à 14 jours", f2.tone === "next" && f2.heading === "Mercredi 25 novembre, 10 h 00" && f2.sub === "Entretien manager" && /14 jours/.test(f2.hint ?? ""), f2.heading);
  ok("demain : « Demain, … »", fo({}, [iv("i1", "2026-11-18T09:00:00Z", "entretien")]).heading === "Demain, 10 h 00");
  const f3 = fo({ interview_at: "2026-10-20T09:00:00Z", interview_kind: "entretien" }, [iv("i1", "2026-10-20T09:00:00Z", "entretien")]);
  ok("entretien passé depuis plus de 14 jours, sans réponse : « Relance à faire »", f3.tone === "late" && f3.heading === "Relance à faire");
  const f4 = fo({ interview_at: "2026-11-10T09:00:00Z" }, [iv("i1", "2026-11-10T09:00:00Z", "entretien")]);
  ok("entretien récent : relance conseillée plus tard, pas due", f4.tone === "idle" && f4.heading === "Relance conseillée le 24 nov.");
  ok("entretien passé mais l'entreprise a écrit depuis : « L'entreprise a répondu », aucune relance", (() => { const f = fo({ interview_at: "2026-10-20T09:00:00Z", last_email_at: "2026-10-25T09:00:00Z" }, [iv("i1", "2026-10-20T09:00:00Z", "entretien")]); return f.tone === "idle" && f.heading === "L'entreprise a répondu" && /pas de relance/.test(f.sub); })());
  {
    const f = fo({}, [iv("i1", "2026-10-01T09:00:00Z", "contact")]);
    ok("contact passé : aucune relance, la carte dit que le contact est noté et invite à ajouter la suite", f.heading === "Contact noté" && f.canAdd && /vrai entretien/.test(f.sub) && /trois semaines/.test(f.hint ?? "") && !/\.\./.test(f.sub), JSON.stringify(f));
  }
  ok("aucune phrase ne finit par « .. » (date abrégée suivie d'un point)", [f4, fo({ interview_at: "2026-10-20T09:00:00Z" }, [iv("i1", "2026-10-20T09:00:00Z", "entretien")])].every((f) => !/\.\./.test(f.sub)));
  const f5 = fo({}, []);
  ok("étape Entretien sans aucune date : « Entretien à dater », avec le délai de 14 jours", f5.heading === "Entretien à dater" && f5.canAdd && /14 jours/.test(f5.hint ?? ""));
  ok("candidature postulée, rien d'autre : « Aucune étape prévue »", fo({ status: "postule" as never }, []).heading === "Aucune étape prévue");
  ok("candidature d'avant (une date passée, sans ligne) : lue comme un entretien, relance due après 14 jours", fo({ interview_at: "2026-10-20T09:00:00Z" }, []).heading === "Relance à faire");
}
done();
