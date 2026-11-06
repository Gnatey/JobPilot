import type { Achievement, Experience, Profile, Project } from "./types";

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

const mergeAch = (into: Achievement, from: Achievement) => {
  into.sources = uniq([...(into.sources ?? []), ...(from.sources ?? [])]);
  if (!into.sources.length) delete into.sources;
  into.tags = uniq([...(into.tags ?? []), ...(from.tags ?? [])]);
};

export type MatchGroup = { exp_id: string; company: string; role: string; existing: Achievement[]; incoming: Achievement[] };

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
      education: [...current.education, ...(extracted.education ?? []).filter((e) => !current.education.some((x) => key(x.degree) === key(e.degree)))],
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
  const seen = new Set<string>();
  const out: { label: string; url: string }[] = [];
  for (const l of links ?? []) {
    const url = (l?.url ?? "").trim();
    if (!url) continue;
    const k = url.toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/[/?#]+$/, "");
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ label: (l.label ?? "").trim(), url });
  }
  return out;
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
  const links = dedupeLinks(p.identity.links ?? []);
  if (links.length < (p.identity.links ?? []).length) changes.push(`${(p.identity.links ?? []).length - links.length} lien${(p.identity.links ?? []).length - links.length > 1 ? "s" : ""} en double retiré${(p.identity.links ?? []).length - links.length > 1 ? "s" : ""}`);
  return { profile: { ...p, experiences, projects, identity: { ...p.identity, links } }, changes };
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
  | { op: "project"; name: string; description: string };

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

/** Garde les opérations qui se rattachent à quelque chose d'existant et dont les chiffres viennent du profil ou de la réponse. */
export function vetOps(profile: Profile, ops: AnswerOp[], answer: string): AnswerOp[] {
  const known = (id: string) => profile.experiences.find((e) => e.id === id);
  return (ops ?? []).filter((o) => {
    if (o.op === "replace") { const e = known(o.exp_id); return !!e && findAch(e, o.old_text) >= 0 && !!o.new_text?.trim() && numbersCovered(o.new_text, `${o.old_text} ${answer}`); }
    if (o.op === "add") return !!known(o.exp_id) && !!o.text?.trim() && numbersCovered(o.text, answer);
    if (o.op === "project") { const pr = profile.projects.find((x) => key(x.name) === key(o.name)); return !!pr && !!o.description?.trim() && numbersCovered(o.description, `${pr.description} ${answer}`); }
    return false;
  });
}

/** Avant / après de chaque opération, pour la carte de validation. */
export function previewOps(profile: Profile, ops: AnswerOp[]): { where: string; before: string; after: string }[] {
  return ops.map((o) => {
    if (o.op === "replace") { const e = profile.experiences.find((x) => x.id === o.exp_id)!; return { where: `${e.role} · ${e.company}`, before: o.old_text, after: o.new_text }; }
    if (o.op === "add") { const e = profile.experiences.find((x) => x.id === o.exp_id)!; return { where: `${e.role} · ${e.company}`, before: "", after: o.text }; }
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
    } else {
      p = { ...p, projects: p.projects.map((x) => (key(x.name) === key(o.name) ? { ...x, description: o.description.trim() } : x)) };
    }
  }
  return p;
}
