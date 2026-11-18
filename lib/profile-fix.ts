import { duplicateIndexes } from "./link-url";
import type { Achievement, Education, Experience, Profile, Project, Settled } from "./types";

/**
 * Outils purs (sans IA, sans réseau) pour garder le profil maître propre :
 * fusion de plusieurs CV sans doublons, propositions de l'audit, réponses aux questions « À compléter ».
 *
 * Règle commune : une phrase du profil n'est jamais inventée. Tout chiffre qui apparaît dans un texte produit par l'IA
 * doit déjà exister dans les textes dont il vient (ou dans la réponse de la personne), sinon l'opération est refusée.
 */

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
/** Texte comparable : sans accents, sans ponctuation, en minuscules. */
export const normText = (s: string) => fold(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const key = (s: string) => normText(s).replace(/ /g, "");
const uniq = <T,>(xs: T[]) => [...new Set(xs)];

/* ---------- Questions réglées (mémoire de « À compléter ») ---------- */

/** Au plus 20 questions gardées (les plus récentes) : chacune est relue par le diagnostic, donc elles coûtent des jetons. */
export const SETTLED_MAX = 20;
const SETTLED_CLIP = 200;
const cut = (s: string, n: number) => { const t = (s ?? "").replace(/\s+/g, " ").trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };

/** Cette question a-t-elle déjà été réglée ? (même texte, sans accents ni majuscules ni ponctuation) */
export const isSettled = (list: Settled[] | undefined, question: string) => !!list?.some((s) => normText(s.question) === normText(question));

/** Les questions à poser, sans celles déjà réglées. */
export const dropSettled = (todo: string[], list: Settled[] | undefined) => (list?.length ? todo.filter((t) => !isSettled(list, t)) : todo);

/** Ajoute une question réglée (la plus récente en dernier, sans doublon, 20 au plus). La réponse peut être vide (« Fait »). */
export function addSettled(list: Settled[] | undefined, question: string, answer = ""): Settled[] {
  const q = cut(question, SETTLED_CLIP);
  if (!q) return list ?? [];
  const rest = (list ?? []).filter((s) => normText(s.question) !== normText(q));
  return [...rest, { question: q, answer: cut(answer, SETTLED_CLIP) }].slice(-SETTLED_MAX);
}

/** Réunit deux mémoires (appliquer un diagnostic ancien ne doit pas faire oublier ce qui a été réglé depuis). `b` est le plus récent. */
export function mergeSettled(a: Settled[] | undefined, b: Settled[] | undefined): Settled[] {
  let out: Settled[] = [];
  for (const s of [...(a ?? []), ...(b ?? [])]) out = addSettled(out, s.question, s.answer);
  return out;
}

/** Ce que les IA du diagnostic et de l'audit lisent : « question → réponse » (ou « marquée faite »). */
export const settledForAi = (list: Settled[] | undefined) => (list ?? []).map((s) => ({ question: s.question, reponse: s.answer || "(marquée comme faite)" }));

/* ---------- Chiffres ---------- */

export const numbersIn = (s: string): string[] => (s.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(",", "."));
/** Tous les chiffres de `a` se retrouvent-ils dans `b` ? */
export const numbersCovered = (a: string, b: string) => {
  const have = new Set(numbersIn(b));
  return numbersIn(a).every((n) => have.has(n));
};

/* ---------- Étiquettes d'origine (le CV d'où vient une information) ---------- */

/** « CV_Data-2025 (1).pdf » → « CV Data 2025 » */
export function cleanLabel(name: string): string {
  const base = name.replace(/\.(pdf|docx?|txt)$/i, "").replace(/\s*\(\d+\)\s*$/, "").replace(/[_]+/g, " ").replace(/\s+-\s+/g, " ").replace(/-/g, " ").replace(/\s+/g, " ").trim();
  return (base || "CV").slice(0, 40);
}

/**
 * Retire les repères de pagination que les exports de documents laissent dans le texte d'un CV (« Tab 1 Page 1 of 2 », « Page 2 sur 2 ») :
 * ils ne sont pas dans le CV de la personne, et l'IA du diagnostic les prenait pour du contenu. Une ligne qui n'avait que ça disparaît.
 */
const PAGE_MARK = /(?:\bTab\s*\d+\s*)?\bPage\s+\d+\s*(?:of|sur|de|\/)\s*\d+\b/gi;
export function stripPageMarks(text: string): string {
  return text
    .split("\n")
    .flatMap((line) => {
      if (!PAGE_MARK.test(line)) return [line];
      PAGE_MARK.lastIndex = 0;
      const rest = line.replace(PAGE_MARK, "").replace(/[ \t]{2,}/g, " ").trim();
      return rest ? [rest] : [];
    })
    .join("\n");
}

/** Les noms de CV d'un texte déposé (« === CV : nom === »), dans l'ordre, sans doublon. */
export function cvLabels(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/^=== CV : (.+?) ===\s*$/gm)) out.push(m[1] === "collé" ? "CV collé" : cleanLabel(m[1]));
  return uniq(out);
}

/** Rattache chaque réalisation à son CV : un seul CV déposé → toutes viennent de lui ; plusieurs → l'IA les a étiquetées, on ne garde que les noms connus. */
export function labelSources(p: Profile, labels: string[]): Profile {
  if (!labels.length) return p;
  const known = new Map(labels.map((l) => [key(l), l]));
  const fix = (a: Achievement): Achievement => {
    if (labels.length === 1) return { ...a, sources: [labels[0]] };
    const s = uniq((a.sources ?? []).map((x) => known.get(key(x)) ?? [...known].find(([k]) => k && (k.includes(key(x)) || key(x).includes(k)))?.[1]).filter((x): x is string => !!x));
    return { ...a, sources: s.length ? s : undefined };
  };
  return { ...p, experiences: p.experiences.map((e) => ({ ...e, achievements: e.achievements.map(fix) })) };
}

/* ---------- Fusion d'un CV avec le profil existant ---------- */

const year = (s?: string) => (s ?? "").match(/(?:19|20)\d{2}/)?.[0] ?? "";
const sameCompany = (a: string, b: string) => {
  const x = key(a), y = key(b);
  return !!x && !!y && (x === y || (Math.min(x.length, y.length) >= 3 && (x.includes(y) || y.includes(x))));
};
/** Même expérience ? Même entreprise, et même année de début ou intitulé qui se recoupe. */
export function sameExperience(a: Experience, b: Experience): boolean {
  if (!sameCompany(a.company, b.company)) return false;
  const ra = key(a.role), rb = key(b.role);
  const roleClose = !!ra && !!rb && (ra.slice(0, 10) === rb.slice(0, 10) || ra.includes(rb) || rb.includes(ra));
  const ya = year(a.start), yb = year(b.start);
  return roleClose || (!!ya && ya === yb);
}

/* ---------- Formations : la même formation écrite deux fois ---------- */

/** Petits mots qui ne disent pas QUELLE formation c'est (« et » et « & » : « E-commerce & Marketing » = « E-commerce et Marketing »). */
const EDU_STOP = new Set(["et", "de", "du", "des", "la", "le", "les", "en", "d", "l", "a", "au", "aux", "and", "of", "the", "in"]);

/** Les mots qui nomment la formation : sans « (Bac+3) », sans « & » ni « et », sans petits mots, sans accents ni majuscules. */
export function degreeWords(degree: string): string[] {
  const t = normText(degree).replace(/\bbac \d\b/g, " ");
  return uniq(t.split(" ").filter((w) => w && !EDU_STOP.has(w)));
}

/**
 * Deux lignes de formation disent-elles la même chose ? (reproduit le 18 novembre : « Bachelor E-commerce & Marketing Numérique (Bac+3) »
 * et « Bachelor E-commerce et Marketing numérique (Bac+3) » donnaient deux formations, le DUT aussi : 5 lignes sur le profil, et sur chaque CV.)
 * Mêmes mots de formation (l'un contient l'autre, au moins 3 mots pour le plus court) ET pas d'années contradictoires :
 * « Master 2021 » et « Master 2025 » restent deux diplômes. L'école n'entre pas en compte (« PSB et UPEC » / « PSB et UPEC (double diplôme) »).
 */
export function sameEducation(a: Pick<Education, "degree" | "start" | "end">, b: Pick<Education, "degree" | "start" | "end">): boolean {
  const x = degreeWords(a.degree), y = degreeWords(b.degree);
  if (!x.length || !y.length) return false;
  const [small, big] = x.length <= y.length ? [x, y] : [y, x];
  const inBig = new Set(big);
  if (!small.every((w) => inBig.has(w))) return false;
  if (small.length < big.length && small.length < 3) return false;
  const sa = year(a.start), sb = year(b.start), ea = year(a.end), eb = year(b.end);
  if ((sa && sb && sa !== sb) || (ea && eb && ea !== eb)) return false;
  return true;
}

/** Complète `into` avec ce que `from` sait en plus (école, années, détails) : sans rien remplacer. */
function fillEducation(into: Education, from: Education): Education {
  const details = [...(into.details ?? [])];
  for (const d of from.details ?? []) if (d?.trim() && !details.some((x) => normText(x) === normText(d))) details.push(d);
  const out: Education = { ...into };
  if (!into.school?.trim() && from.school?.trim()) out.school = from.school;
  if (!into.start && from.start) out.start = from.start;
  if (!into.end && from.end) out.end = from.end;
  if (details.length) out.details = details;
  return out;
}

/** Réunit les formations en double (la première reste telle quelle, elle est complétée par les suivantes). */
export function dedupeEducation(list: Education[]): { list: Education[]; dropped: number } {
  const out: Education[] = [];
  let dropped = 0;
  for (const e of list ?? []) {
    const i = out.findIndex((x) => sameEducation(x, e));
    if (i < 0) out.push(e);
    else { out[i] = fillEducation(out[i], e); dropped++; }
  }
  return { list: dropped ? out : (list ?? []), dropped };
}

const mergeAch = (into: Achievement, from: Achievement) => {
  into.sources = uniq([...(into.sources ?? []), ...(from.sources ?? [])]);
  if (!into.sources.length) delete into.sources;
  into.tags = uniq([...(into.tags ?? []), ...(from.tags ?? [])]);
};

export type MatchGroup = { exp_id: string; company: string; role: string; existing: Achievement[]; incoming: Achievement[] };

/** Ajoute les formations absentes ; une formation déjà connue (même intitulé à « & » / « et » / « (Bac+3) » près) est seulement complétée. */
function mergeEducation(current: Education[], incoming: Education[]): Education[] {
  const out = current.map((e) => ({ ...e }));
  for (const e of incoming) {
    const i = out.findIndex((x) => sameEducation(x, e));
    if (i < 0) out.push({ ...e });
    else out[i] = fillEducation(out[i], e);
  }
  return out;
}

/**
 * Partie sans IA de la fusion : rien n'est perdu, les expériences identiques se regroupent, les réalisations strictement
 * identiques (une fois nettoyées) ne comptent qu'une fois. Les réalisations nouvelles d'une expérience déjà connue sont
 * rendues dans `groups` : l'IA dira ensuite lesquelles disent la même chose avec d'autres mots.
 */
export function mergeExtracted(current: Profile, extracted: Profile): { profile: Profile; groups: MatchGroup[] } {
  const exps: Experience[] = current.experiences.map((e) => ({ ...e, achievements: e.achievements.map((a) => ({ ...a })) }));
  const groups: MatchGroup[] = [];
  for (const e of extracted.experiences ?? []) {
    const same = exps.find((x) => sameExperience(x, e));
    if (!same) { exps.push({ ...e, achievements: e.achievements.map((a) => ({ ...a })) }); continue; }
    const before = same.achievements.slice();
    const incoming: Achievement[] = [];
    for (const a of e.achievements) {
      const k = normText(a.text);
      const hit = same.achievements.find((x) => normText(x.text) === k);
      if (hit) mergeAch(hit, a);
      else { const na = { ...a }; same.achievements.push(na); incoming.push(na); }
    }
    if (incoming.length && before.length) groups.push({ exp_id: same.id, company: same.company, role: same.role, existing: before, incoming });
  }

  const mergeList = (a: string[], b: string[]) => [...a, ...b.filter((x) => !a.some((y) => key(y) === key(x)))];
  const skills = { ...current.skills };
  for (const [cat, items] of Object.entries(extracted.skills ?? {})) skills[cat] = mergeList(skills[cat] ?? [], items);

  const projects: Project[] = current.projects.map((p) => ({ ...p }));
  for (const p of extracted.projects ?? []) {
    const hit = projects.find((x) => key(x.name) === key(p.name));
    if (!hit) projects.push({ ...p });
    else if (!hit.link && p.link) hit.link = p.link;
  }

  const links = dedupeLinks([...(current.identity.links ?? []), ...(extracted.identity?.links ?? [])]);
  const identity = { ...extracted.identity, ...Object.fromEntries(Object.entries(current.identity).filter(([, v]) => (Array.isArray(v) ? v.length : v))), links } as Profile["identity"];

  return {
    groups,
    profile: {
      ...current,
      identity,
      targets: current.targets.length ? current.targets : extracted.targets,
      experiences: exps,
      education: mergeEducation(current.education, extracted.education ?? []),
      projects,
      skills,
      certifications: mergeList(current.certifications, extracted.certifications ?? []),
      languages: current.languages.length ? current.languages : extracted.languages ?? [],
      interests: mergeList(current.interests, extracted.interests ?? []),
      todo: mergeList(current.todo, extracted.todo ?? []),
    },
  };
}

export type Match = { exp_id: string; j: number; same_as: number };

const clip = (s: string, n = 150) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * Applique le verdict de l'IA (« la réalisation j dit la même chose que la i »), avec le garde-fou des chiffres :
 * - mêmes faits ou chiffres déjà présents : on garde l'existante, on note l'origine en plus ;
 * - l'existante n'avait aucun chiffre et la nouvelle en a : la nouvelle, plus précise, la remplace ;
 * - chiffres différents des deux côtés : on garde les deux et on te pose la question.
 */
export function applyMatches(profile: Profile, groups: MatchGroup[], matches: Match[]): { profile: Profile; todo: string[]; merged: number } {
  const drop = new Set<Achievement>();
  const todo: string[] = [];
  let merged = 0;
  for (const m of matches ?? []) {
    const g = groups.find((x) => x.exp_id === m.exp_id);
    if (!g || !Number.isInteger(m.j) || !Number.isInteger(m.same_as) || m.same_as < 0) continue;
    const inc = g.incoming[m.j], old = g.existing[m.same_as];
    if (!inc || !old || inc === old || drop.has(inc) || drop.has(old)) continue;
    if (numbersCovered(inc.text, old.text)) { mergeAch(old, inc); drop.add(inc); merged++; }
    else if (numbersIn(old.text).length === 0) { old.text = inc.text; mergeAch(old, inc); drop.add(inc); merged++; }
    else todo.push(`Deux CV décrivent la même réalisation chez ${g.company} avec des chiffres différents : « ${clip(old.text)} » et « ${clip(inc.text)} ». Lequel est juste ?`);
  }
  if (!drop.size) return { profile, todo, merged };
  return { profile: { ...profile, experiences: profile.experiences.map((e) => ({ ...e, achievements: e.achievements.filter((a) => !drop.has(a)) })) }, todo, merged };
}

/** Ce que l'IA doit comparer : pour chaque expérience, ses réalisations connues et les nouvelles. */
export const matchInput = (groups: MatchGroup[]) =>
  groups.map((g) => ({ exp_id: g.exp_id, entreprise: g.company, poste: g.role, connues: g.existing.map((a, i) => ({ i, text: a.text })), nouvelles: g.incoming.map((a, j) => ({ j, text: a.text })) }));

/* ---------- Ménage sans IA ---------- */

export function dedupeLinks(links: { label: string; url: string }[]): { label: string; url: string }[] {
  const raw = (links ?? []).filter((l) => (l?.url ?? "").trim());
  const drop = duplicateIndexes(raw);
  return raw.filter((_, i) => !drop.has(i)).map((l) => ({ label: (l.label ?? "").trim(), url: l.url.trim() }));
}

/** Fusionne ce qui est strictement identique une fois nettoyé : réalisations d'une même expérience, projets de même nom, liens répétés. */
export function dedupeExact(p: Profile): { profile: Profile; changes: string[] } {
  const changes: string[] = [];
  const experiences = p.experiences.map((e) => {
    const out: Achievement[] = [];
    let dropped = 0;
    for (const a of e.achievements) {
      const hit = out.find((x) => normText(x.text) === normText(a.text));
      if (hit) { mergeAch(hit, a); dropped++; } else out.push({ ...a });
    }
    if (dropped) changes.push(`${dropped} réalisation${dropped > 1 ? "s" : ""} en double retirée${dropped > 1 ? "s" : ""} (${e.company || e.role})`);
    return dropped ? { ...e, achievements: out } : e;
  });
  const projects: Project[] = [];
  for (const pr of p.projects) {
    const hit = projects.find((x) => key(x.name) === key(pr.name));
    if (!hit) { projects.push({ ...pr }); continue; }
    if (!hit.link && pr.link) hit.link = pr.link;
    if (pr.description.length > hit.description.length) hit.description = pr.description;
    hit.tags = uniq([...hit.tags, ...pr.tags]);
    changes.push(`Projet « ${pr.name} » présent deux fois : fusionné`);
  }
  const edu = dedupeEducation(p.education ?? []);
  if (edu.dropped) changes.push(`${edu.dropped} formation${edu.dropped > 1 ? "s" : ""} en double retirée${edu.dropped > 1 ? "s" : ""}`);
  const links = dedupeLinks(p.identity.links ?? []);
  if (links.length < (p.identity.links ?? []).length) changes.push(`${(p.identity.links ?? []).length - links.length} lien${(p.identity.links ?? []).length - links.length > 1 ? "s" : ""} en double retiré${(p.identity.links ?? []).length - links.length > 1 ? "s" : ""}`);
  return { profile: { ...p, experiences, projects, education: edu.list, identity: { ...p.identity, links } }, changes };
}

/* ---------- Propositions de l'audit « Faire le point » ---------- */

export type Proposal =
  | { id: string; kind: "merge"; exp_id: string; keep: string; drop: string[]; merged?: string; lossless?: boolean; why: string }
  | { id: string; kind: "to_project"; exp_id: string; text: string; project: { name: string; description: string; year?: string; tags: string[] }; why: string }
  | { id: string; kind: "duplicate"; exp_id: string; text: string; project_name: string; why: string };

const findAch = (e: Experience, text: string) => e.achievements.findIndex((a) => normText(a.text) === normText(text));
const URL_RE = /https?:\/\/[^\s|)»"']+/i;

/** Premier lien trouvé dans un texte, sans la ponctuation de fin. */
export const urlIn = (s: string): string => (s.match(URL_RE)?.[0] ?? "").replace(/[.,;:!?]+$/, "");
/** Le texte sans son lien ni les séparateurs qui le précédaient (« Création d'un jeu | https://… » → « Création d'un jeu »). */
export const withoutUrl = (s: string) => s.replace(URL_RE, "").replace(/\s*[|:–-]\s*$/, "").replace(/\s{2,}/g, " ").trim();

/** Une fusion peut-elle s'appliquer seule ? Seulement si on garde une phrase telle quelle et qu'elle porte tous les chiffres des autres. */
export function isSafe(p: Proposal): boolean {
  if (p.kind !== "merge") return false;
  if (p.merged || p.lossless !== true) return false;
  return p.drop.every((d) => numbersCovered(d, p.keep));
}

/** La proposition est-elle cohérente avec le profil actuel, et sans chiffre inventé ? Sinon elle est ignorée. */
export function isValid(profile: Profile, p: Proposal): boolean {
  const e = profile.experiences.find((x) => x.id === (p as { exp_id?: string }).exp_id);
  if (!e) return false;
  if (p.kind === "merge") {
    if (findAch(e, p.keep) < 0 || !p.drop.length) return false;
    if (p.drop.some((d) => findAch(e, d) < 0 || normText(d) === normText(p.keep))) return false;
    if (p.merged && !numbersCovered(p.merged, [p.keep, ...p.drop].join(" "))) return false;
    return true;
  }
  if (p.kind === "to_project") {
    const i = findAch(e, p.text);
    if (i < 0 || !p.project?.name?.trim() || !p.project.description?.trim()) return false;
    return numbersCovered(p.project.description, p.text);
  }
  if (p.kind === "duplicate") return findAch(e, p.text) >= 0 && !!p.project_name?.trim() && profile.projects.some((x) => key(x.name) === key(p.project_name));
  return false;
}

/** Applique une proposition valide ; renvoie le profil tel quel si elle ne s'applique plus. */
export function applyProposal(profile: Profile, p: Proposal): Profile {
  if (!isValid(profile, p)) return profile;
  const exps = profile.experiences.map((e) => {
    if (e.id !== p.exp_id) return e;
    if (p.kind === "merge") {
      const keepI = findAch(e, p.keep);
      const keep = { ...e.achievements[keepI] };
      const gone = new Set(p.drop.map((d) => normText(d)));
      for (const a of e.achievements) if (gone.has(normText(a.text))) mergeAch(keep, a);
      if (p.merged) keep.text = p.merged;
      return { ...e, achievements: e.achievements.flatMap((a, i) => (i === keepI ? [keep] : gone.has(normText(a.text)) ? [] : [a])) };
    }
    const i = findAch(e, p.text);
    return { ...e, achievements: e.achievements.filter((_, j) => j !== i) };
  });
  let projects = profile.projects;
  if (p.kind === "to_project") {
    const source = profile.experiences.find((x) => x.id === p.exp_id)!.achievements[findAch(profile.experiences.find((x) => x.id === p.exp_id)!, p.text)];
    const link = urlIn(p.text);
    const description = withoutUrl(p.project.description) || withoutUrl(p.text);
    const hit = projects.find((x) => key(x.name) === key(p.project.name));
    projects = hit
      ? projects.map((x) => (x === hit ? { ...x, link: x.link || link || undefined, description: x.description || description } : x))
      : [...projects, { name: p.project.name.trim(), year: p.project.year, description, tags: uniq([...(p.project.tags ?? []), ...(source?.tags ?? [])]), ...(link ? { link } : {}) }];
  }
  return { ...profile, experiences: exps, projects };
}

/* ---------- Réponses aux questions « À compléter » ---------- */

export type AnswerOp =
  | { op: "replace"; exp_id: string; old_text: string; new_text: string }
  | { op: "add"; exp_id: string; text: string }
  | { op: "project"; name: string; description: string }
  // Ce que la personne donne telle quelle, sans réalisation à réécrire (tout vient de sa réponse, vérifié par vetOps)
  | { op: "interest"; text: string; old_text?: string }
  | { op: "language"; name: string; level: string }
  | { op: "city"; text: string }
  | { op: "link"; label: string; url: string }
  | { op: "project_year"; name: string; year: string };

/** Ce que l'IA rend pour une réponse « À compléter » : sa réponse à la préoccupation (`reply`), et des réécritures du profil seulement si la réponse apporte un fait. */
export type AnswerRaw = { ops?: AnswerOp[]; reply?: string; settled?: boolean };
/** Après vérification (lib/answer-reply.ts). `proposed` = opérations proposées avant vérification, pour dire pourquoi il n'y a rien à valider. */
export type AnswerResult = { ops: AnswerOp[]; reply: string; settled: boolean; proposed: number };

/**
 * Que montrer à la personne ? Répondre à sa préoccupation suffit : une réponse comme « c'était une alternance, pendant mon Master »
 * ne se réécrit pas en ligne de CV, mais elle mérite une vraie réponse (c'est un défaut ou non), pas un « je n'ai rien trouvé à écrire ».
 */
export function answerView(r: { ops: AnswerOp[]; reply: string; proposed: number }): "reply_and_fix" | "reply_only" | "fix_only" | "rejected" | "none" {
  if (r.reply && r.ops.length) return "reply_and_fix";
  if (r.reply) return "reply_only";
  if (r.ops.length) return "fix_only";
  return r.proposed > 0 ? "rejected" : "none";
}

/** La réponse dit-elle autre chose que « je ne sais pas » ? (assez de contenu pour mériter une seconde lecture) */
export const hasContent = (answer: string) =>
  answer.replace(/je ne sais pas|aucune id[ée]e|\bjsp\b/gi, "").replace(/[^a-zà-ÿ0-9]/gi, "").length >= 25;

/** Les mots d'un texte, sans accents ni ponctuation, ramenés à leurs 5 premières lettres (« voyage » et « voyages » se recoupent). */
const stems = (s: string) => normText(s).split(" ").filter(Boolean).map((w) => w.slice(0, 5));
/** Tous les mots de `text` sont-ils dans `source` ? (ce que l'IA écrit doit venir de ce que la personne a dit) */
export const wordsFrom = (text: string, source: string) => { const have = new Set(stems(source)); const w = stems(text); return w.length > 0 && w.every((x) => have.has(x)); };
const hasKey = (list: string[] | undefined, v: string) => (list ?? []).some((x) => key(x) === key(v));
const LINK_RE = /^https?:\/\/[^\s<>"']+$/i;
const urlKey = (u: string) => u.toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/[/?#]+$/, "");

/** Garde les opérations qui se rattachent à quelque chose d'existant et dont les chiffres et les mots viennent du profil ou de la réponse. */
export function vetOps(profile: Profile, ops: AnswerOp[], answer: string): AnswerOp[] {
  const known = (id: string) => profile.experiences.find((e) => e.id === id);
  return (ops ?? []).filter((o) => {
    if (o.op === "replace") { const e = known(o.exp_id); return !!e && findAch(e, o.old_text) >= 0 && !!o.new_text?.trim() && numbersCovered(o.new_text, `${o.old_text} ${answer}`); }
    if (o.op === "add") return !!known(o.exp_id) && !!o.text?.trim() && numbersCovered(o.text, answer);
    if (o.op === "project") { const pr = profile.projects.find((x) => key(x.name) === key(o.name)); return !!pr && !!o.description?.trim() && numbersCovered(o.description, `${pr.description} ${answer}`); }
    if (o.op === "interest") {
      const t = o.text?.trim();
      return !!t && t.length <= 120 && wordsFrom(t, answer) && numbersCovered(t, answer) && !hasKey(profile.interests, t);
    }
    if (o.op === "language") {
      const n = o.name?.trim(), lv = o.level?.trim();
      if (!n || !lv || lv.length > 40) return false;
      const cur = profile.languages.find((l) => key(l.name) === key(n));
      return (!!cur || wordsFrom(n, answer)) && wordsFrom(lv, answer) && key(cur?.level ?? "") !== key(lv);
    }
    if (o.op === "city") { const t = o.text?.trim(); return !!t && t.length <= 80 && wordsFrom(t, answer) && key(profile.identity.city ?? "") !== key(t); }
    if (o.op === "link") {
      const u = o.url?.trim(), l = o.label?.trim();
      return !!u && !!l && l.length <= 40 && LINK_RE.test(u) && urlKey(answer).includes(urlKey(u)) && !(profile.identity.links ?? []).some((x) => urlKey(x.url) === urlKey(u));
    }
    if (o.op === "project_year") {
      const pr = profile.projects.find((x) => key(x.name) === key(o.name));
      const y = o.year?.trim();
      return !!pr && /^(?:19|20)\d{2}$/.test(y ?? "") && numbersIn(answer).includes(y!) && (pr.year ?? "").trim() !== y;
    }
    return false;
  });
}

/** Avant / après de chaque opération, pour la carte de validation. */
export function previewOps(profile: Profile, ops: AnswerOp[]): { where: string; before: string; after: string }[] {
  return ops.map((o) => {
    if (o.op === "replace") { const e = profile.experiences.find((x) => x.id === o.exp_id)!; return { where: `${e.role} · ${e.company}`, before: o.old_text, after: o.new_text }; }
    if (o.op === "add") { const e = profile.experiences.find((x) => x.id === o.exp_id)!; return { where: `${e.role} · ${e.company}`, before: "", after: o.text }; }
    if (o.op === "interest") return { where: "Centres d'intérêt", before: o.old_text && hasKey(profile.interests, o.old_text) ? o.old_text : "", after: o.text };
    if (o.op === "language") { const cur = profile.languages.find((l) => key(l.name) === key(o.name)); return { where: "Langues", before: cur ? `${cur.name} : ${cur.level || "niveau non précisé"}` : "", after: `${cur?.name ?? o.name} : ${o.level}` }; }
    if (o.op === "city") return { where: "Ville", before: profile.identity.city ?? "", after: o.text };
    if (o.op === "link") return { where: "Liens", before: "", after: `${o.label} : ${o.url}` };
    if (o.op === "project_year") { const pr = profile.projects.find((x) => key(x.name) === key(o.name))!; return { where: `Projet ${pr.name}`, before: pr.year ?? "", after: o.year }; }
    const pr = profile.projects.find((x) => key(x.name) === key(o.name))!;
    return { where: `Projet ${pr.name}`, before: pr.description, after: o.description };
  });
}

export function applyOps(profile: Profile, ops: AnswerOp[]): Profile {
  let p = profile;
  for (const o of ops) {
    if (o.op === "replace") {
      p = { ...p, experiences: p.experiences.map((e) => (e.id !== o.exp_id ? e : { ...e, achievements: e.achievements.map((a) => (normText(a.text) === normText(o.old_text) ? { ...a, text: o.new_text.trim() } : a)) })) };
    } else if (o.op === "add") {
      p = { ...p, experiences: p.experiences.map((e) => (e.id !== o.exp_id || findAch(e, o.text) >= 0 ? e : { ...e, achievements: [...e.achievements, { text: o.text.trim(), tags: [] }] })) };
    } else if (o.op === "interest") {
      const t = o.text.trim();
      const i = o.old_text ? p.interests.findIndex((x) => key(x) === key(o.old_text!)) : -1;
      if (i >= 0) p = { ...p, interests: p.interests.map((x, j) => (j === i ? t : x)) };
      else if (!hasKey(p.interests, t)) p = { ...p, interests: [...p.interests, t] };
    } else if (o.op === "language") {
      const lv = o.level.trim();
      const has = p.languages.some((l) => key(l.name) === key(o.name));
      p = { ...p, languages: has ? p.languages.map((l) => (key(l.name) === key(o.name) ? { ...l, level: lv } : l)) : [...p.languages, { name: o.name.trim(), level: lv }] };
    } else if (o.op === "city") {
      p = { ...p, identity: { ...p.identity, city: o.text.trim() } };
    } else if (o.op === "link") {
      if (!(p.identity.links ?? []).some((x) => urlKey(x.url) === urlKey(o.url))) p = { ...p, identity: { ...p.identity, links: [...(p.identity.links ?? []), { label: o.label.trim(), url: o.url.trim() }] } };
    } else if (o.op === "project_year") {
      p = { ...p, projects: p.projects.map((x) => (key(x.name) === key(o.name) ? { ...x, year: o.year.trim() } : x)) };
    } else {
      p = { ...p, projects: p.projects.map((x) => (key(x.name) === key(o.name) ? { ...x, description: o.description.trim() } : x)) };
    }
  }
  return p;
}
