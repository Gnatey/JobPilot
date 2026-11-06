import { normText, numbersIn } from "./profile-fix";
import type { CvDoc, Profile } from "./types";

/**
 * Garde-fou du CV sur mesure (sans IA, sans réseau, testé).
 *
 * L'IA reformule les réalisations du profil, mais elle ajoute parfois un RÉSULTAT que la personne n'a jamais écrit
 * (« …, réduisant le temps de reporting ») ou un chiffre. Ce n'est ni un outil, ni un employeur, ni un diplôme :
 * les règles du prompt ne l'attrapent pas toujours. Ici, ce que le profil ne dit pas est retiré (résultat en fin de puce)
 * ou signalé (le reste), et chaque retrait est écrit dans « notes_for_candidate » avec le texte exact, pour pouvoir le remettre.
 *
 * Ce que ce garde-fou ne fait PAS : réparer une paraphrase qui change le public (« les Business Unit et le CODIR »
 * devenu « la direction »). Cela reste l'affaire des règles de rédaction de `generateCv`.
 */

/** Même longueur que le texte d'origine (pour couper au bon endroit) : sans accents, en minuscules, apostrophe droite. */
function flatten(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "’") { out += "'"; continue; }
    const f = c.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    out += f.length === 1 ? f : " ";
  }
  return out;
}

/* ---------- Ce qui annonce un résultat ou un bénéfice ---------- */

const EFFECT_PARTICIPLES = ["reduisant", "diminuant", "limitant", "evitant", "permettant", "ameliorant", "optimisant", "facilitant", "accelerant", "garantissant", "assurant", "favorisant", "augmentant", "renforcant", "simplifiant", "fiabilisant", "securisant", "contribuant", "generant", "economisant", "gagnant", "aboutissant"];
const EFFECT_INFINITIVES = ["permettre", "favoriser", "faciliter", "reduire", "diminuer", "ameliorer", "optimiser", "accelerer", "garantir", "assurer", "augmenter", "renforcer", "simplifier", "fiabiliser", "securiser", "limiter", "eviter", "gagner", "economiser"];
const MARKER = new RegExp(`(?<=^|[\\s,;])(?:(?:${EFFECT_PARTICIPLES.join("|")})\\b|afin d(?:e |')|ce qui\\b|pour (?:${EFFECT_INFINITIVES.join("|")})\\b)`, "g");

/* ---------- Comparer avec le profil ---------- */

const STOP = new Set(["dans", "pour", "avec", "sans", "sous", "entre", "leur", "leurs", "plus", "tout", "tous", "toute", "toutes", "cette", "ainsi", "afin", "dont", "vers", "chez", "comme", "aussi", "tres", "etre", "avoir", "fait", "ayant", "lors", "puis", "donc", "ces", "des", "les", "une", "aux", "qui", "que"]);
/** Les mots qui comptent, réduits à leurs 4 premières lettres (« réduction » et « réduisant » se reconnaissent). */
const stemsOf = (s: string) => new Set(normText(s).split(" ").filter((w) => w.length >= 4 && !STOP.has(w)).map((w) => w.slice(0, 4)));

const sameCompany = (a: string, b: string) => {
  const x = normText(a), y = normText(b);
  return !!x && !!y && (x === y || x.includes(y) || y.includes(x));
};

/** Les textes du profil qui peuvent justifier une puce de cette entreprise (sinon : toutes les expériences et les projets). */
function evidenceFor(profile: Profile, company: string): string {
  const exps = profile.experiences ?? [];
  const mine = exps.filter((e) => sameCompany(e.company, company));
  const text = (mine.length ? mine : exps).flatMap((e) => [e.role, ...(e.achievements ?? []).flatMap((a) => [a.text, ...(a.tags ?? [])])]).join(" ");
  return mine.length ? text : `${text} ${(profile.projects ?? []).map((p) => `${p.name} ${p.description}`).join(" ")}`;
}

/** Tout le texte du profil, sans les identifiants (leurs chiffres feraient passer un chiffre inventé pour connu). */
const profileText = (profile: Profile) => JSON.stringify(profile, (k, v) => (k === "id" ? undefined : v));

/* ---------- Réserves laissées dans le texte du CV ---------- */

/** « [chiffre à valider] », « (à compléter) » : une réserve n'a pas sa place sur le CV (elle irait chez le recruteur). Les remarques vont à côté, jamais dans le texte. */
const ASK = "(?:valider|vérifier|verifier|compléter|completer|préciser|preciser|confirmer|renseigner)";
const BRACKET = new RegExp(`\\s*[\\[(][^\\[\\]()]{0,60}?(?<![\\p{L}])(?:à|a) ${ASK}(?![\\p{L}])[^\\[\\]()]{0,60}[\\])]`, "giu");
/** Fin de puce « … – à valider » (tiret entouré d'espaces : une phrase normale comme « specs à valider par la MOA » n'est pas touchée). */
const TRAILING = new RegExp(`\\s+[–—-]\\s+(?:à|a) ${ASK}(?![\\p{L}])[^.]{0,40}\\.?\\s*$`, "iu");

function stripPlaceholders(s: string): { text: string; removed: string[] } {
  const removed: string[] = [];
  const text = s
    .replace(BRACKET, (m) => { removed.push(m.trim()); return ""; })
    .replace(TRAILING, (m) => { removed.push(m.replace(/^\s+[–—-]\s+/, "").replace(/\.\s*$/, "").trim()); return ""; });
  return removed.length ? { text: text.replace(/ {2,}/g, " ").replace(/\s+([,.;:])/g, "$1").trim(), removed } : { text: s, removed };
}

const GROUNDED = 0.6;

type BulletResult = { text: string; effect?: string; cut?: boolean };

/** Une puce : son résultat final est-il dans le profil ? Sinon, on le coupe quand il est simple (fin de phrase, sans virgule ni parenthèse), on le signale sinon. */
function checkBullet(bullet: string, evidence: Set<string>): BulletResult {
  for (const m of flatten(bullet).matchAll(MARKER)) {
    const at = m.index ?? 0;
    const tail = bullet.slice(at);
    const stems = stemsOf(tail);
    const hit = [...stems].filter((x) => evidence.has(x)).length;
    if (stems.size === 0 || hit / stems.size >= GROUNDED) continue;
    const effect = tail.replace(/[.\s]+$/, "");
    const head = bullet.slice(0, at).replace(/[\s,;]+$/, "");
    if (/[,;:()]/.test(tail) || head.length < 20) return { text: bullet, effect };
    return { text: /\.\s*$/.test(bullet) ? `${head}.` : head, effect, cut: true };
  }
  return { text: bullet };
}

export type GuardReport = {
  /** Résultats retirés en fin de puce. */
  cut: { company: string; removed: string }[];
  /** Résultats absents du profil mais laissés (trop mêlés au reste de la phrase pour couper sans risque). */
  flagged: { company: string; effect: string }[];
  /** Chiffres d'une puce qui ne figurent nulle part dans le profil. */
  numbers: { company: string; numbers: string[] }[];
  /** Réserves (« [à valider] ») retirées du texte du CV : elles ne doivent jamais s'imprimer. */
  placeholders: { where: string; removed: string }[];
};

/** Retire ou signale, dans les puces des expériences, ce que le profil ne dit pas. Ne modifie pas l'objet reçu. */
export function guardCv(cv: CvDoc, profile: Profile): { cv: CvDoc; report: GuardReport } {
  const known = new Set(numbersIn(profileText(profile)));
  const report: GuardReport = { cut: [], flagged: [], numbers: [], placeholders: [] };
  const notes: string[] = [];
  const clean = (where: string, text: string): string => {
    const r = stripPlaceholders(text);
    for (const removed of r.removed) {
      report.placeholders.push({ where, removed });
      notes.push(`« ${where} » : j'ai retiré « ${removed} » du texte du CV, une réserve n'a pas sa place sur le CV.`);
    }
    return r.text;
  };

  const summary = cv.summary ? clean("Résumé", cv.summary) : cv.summary;
  const projects = (cv.projects ?? []).map((p) => (p.description ? { ...p, description: clean(p.name, p.description) } : p));
  const experiences = (cv.experiences ?? []).map((e) => {
    const evidence = stemsOf(evidenceFor(profile, e.company));
    const bullets = (e.bullets ?? []).map((raw) => {
      const r = checkBullet(clean(e.company, raw), evidence);
      if (r.effect && r.cut) {
        report.cut.push({ company: e.company, removed: r.effect });
        notes.push(`« ${e.company} » : j'ai retiré « ${r.effect} » en fin de puce, ton profil ne dit pas ce résultat. Si c'est vrai, ajoute-le à ton profil, avec un chiffre si possible.`);
      } else if (r.effect) {
        report.flagged.push({ company: e.company, effect: r.effect });
        notes.push(`« ${e.company} » : « ${r.effect} » ne figure pas dans ton profil. À vérifier ou à retirer.`);
      }
      const unknown = [...new Set(numbersIn(r.text))].filter((n) => !known.has(n));
      if (unknown.length) {
        report.numbers.push({ company: e.company, numbers: unknown });
        notes.push(`« ${e.company} » : ${unknown.length > 1 ? "les chiffres" : "le chiffre"} ${unknown.map((n) => `« ${n} »`).join(", ")} ne figure${unknown.length > 1 ? "nt" : ""} pas dans ton profil. À vérifier ou à retirer.`);
      }
      return r.text;
    });
    return { ...e, bullets };
  });

  const have = cv.notes_for_candidate ?? [];
  return { cv: { ...cv, summary, projects, experiences, notes_for_candidate: [...have, ...notes.filter((n) => !have.includes(n))] }, report };
}
