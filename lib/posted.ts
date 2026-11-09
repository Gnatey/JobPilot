/**
 * Date de publication d'une annonce SUR LE SITE d'emploi (et non la date d'arrivée dans JobPilot) : lecture, libellé, clé de tri.
 * Logique pure, lue aussi par l'écran (aucun import venant du serveur), testée par tests/posted.test.ts. Aucune IA : une date n'est jamais devinée,
 * seulement lue (donnée structurée d'une source, JSON-LD `datePosted` d'une page, mention « publiée il y a 3 jours » d'une page).
 *
 * Trois sortes de dates, que l'écran nomme clairement :
 *  - `posted`   « publiée » : la date vient du site (Adzuna, Jooble, page lue) ;
 *  - `received` « reçue »   : le site ne la donne pas, c'est la date de l'e-mail d'alerte (souvent proche de la publication, sans certitude) ;
 *  - `added`    « ajoutée » : date à laquelle la personne ou l'app a rangé l'offre (import depuis une page, analyse à la main).
 */

export type WhenKind = "posted" | "received" | "added";
export type When = { at: string | null; kind: WhenKind };

const DAY = 864e5;
const TZ = "Europe/Paris";
/** Une annonce encore en ligne depuis plus de 3 ans n'existe pas : une date plus ancienne est une erreur de lecture, pas une publication. */
const MAX_AGE_DAYS = 3 * 365;

const MONTHS: Record<string, number> = {
  janvier: 1, janv: 1, fevrier: 2, fevr: 2, mars: 3, avril: 4, avr: 4, mai: 5, juin: 6, juillet: 7, juil: 7, aout: 8, septembre: 9, sept: 9, octobre: 10, oct: 10, novembre: 11, nov: 11, decembre: 12, dec: 12,
};

const noAccent = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Date plausible ? Ni dans le futur (à une journée près : fuseaux), ni vieille de plus de 3 ans. Renvoie l'instant (ms), au plus « maintenant ». */
function plausible(ms: number, now: Date): number | null {
  if (!Number.isFinite(ms)) return null;
  if (ms > now.getTime() + DAY) return null;
  if (ms < now.getTime() - MAX_AGE_DAYS * DAY) return null;
  return Math.min(ms, now.getTime());
}

function ymd(y: number, m: number, d: number, hh = 12, mm = 0, ss = 0, offsetMin = 0): number | null {
  if (m < 1 || m > 12 || d < 1 || d > 31 || hh > 23 || mm > 59 || ss > 59) return null;
  const t = new Date(Date.UTC(y, m - 1, d, hh, mm, ss));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null; // 31 février…
  return t.getTime() - offsetMin * 60_000;
}

const ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:[.,]\d+)?)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?$/i;
const FR_NUM = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/;

/**
 * Une date lue dans une donnée (Adzuna `created`, Jooble `updated`, JSON-LD `datePosted`) : AAAA-MM-JJ, avec ou sans heure et fuseau, ou JJ/MM/AAAA.
 * Renvoie un horodatage ISO (UTC), ou null si ce n'est pas une date, si elle est dans le futur ou vieille de plus de 3 ans.
 * Une date sans heure vaut midi (UTC) : le même jour à Paris, quel que soit l'horaire d'été ou d'hiver.
 */
export function parsePosted(raw: unknown, now: Date = new Date()): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s || s.length > 40) return null;
  let ms: number | null = null;
  const iso = ISO.exec(s);
  if (iso) {
    const [, y, mo, d, hh, mm, ss, tz] = iso;
    let offset = 0;
    if (tz && tz.toUpperCase() !== "Z") {
      const t = /^([+-])(\d{2}):?(\d{2})?$/.exec(tz)!;
      offset = (t[1] === "-" ? -1 : 1) * (Number(t[2]) * 60 + Number(t[3] ?? 0));
    }
    ms = ymd(Number(y), Number(mo), Number(d), hh === undefined ? 12 : Number(hh), mm === undefined ? 0 : Number(mm), ss === undefined ? 0 : Number(ss), offset);
  } else {
    const fr = FR_NUM.exec(s);
    if (fr) ms = ymd(Number(fr[3]), Number(fr[2]), Number(fr[1]));
  }
  if (ms == null) return null;
  const ok = plausible(ms, now);
  return ok == null ? null : new Date(ok).toISOString();
}

const UNITS: Record<string, number> = {
  minute: 6e4, min: 6e4, heure: 36e5, h: 36e5, jour: DAY, j: DAY, semaine: 7 * DAY, sem: 7 * DAY, mois: 30 * DAY,
  hour: 36e5, day: DAY, week: 7 * DAY, month: 30 * DAY,
};
const unitMs = (u: string): number | null => UNITS[noAccent(u).replace(/s$/, "")] ?? null;

const HEAD = 1500;
const FR_UNIT = "(minutes?|min|heures?|h|jours?|j|semaines?|sem|mois)";
const EN_UNIT = "(minutes?|hours?|days?|weeks?|months?)";
/** « Publiée il y a 3 jours », « Mise en ligne il y a 2 semaines » (jamais « actualisée », « active » : ce n'est pas la publication). */
const POSTED_FR = new RegExp(`(?<![\\p{L}])(?:publi[ée]e?|mise?\\s+en\\s+ligne)\\s+il\\s+y\\s+a\\s+(\\d{1,3})\\s*${FR_UNIT}(?![\\p{L}])`, "iu");
const POSTED_EN = new RegExp(`(?<![\\p{L}])posted\\s+(\\d{1,3})\\s+${EN_UNIT}\\s+ago(?![\\p{L}])`, "iu");
/** LinkedIn : une ligne qui ne dit que « Il y a 3 jours » (éventuellement suivie de « · Plus de 100 candidatures »). « Republié il y a… » n'est pas la publication. */
const LINE_FR = new RegExp(`^\\s*il\\s+y\\s+a\\s+(\\d{1,3})\\s*${FR_UNIT}\\s*(?:$|[·•|,.–—-])`, "imu");
const LINE_EN = new RegExp(`^\\s*(\\d{1,3})\\s+${EN_UNIT}\\s+ago\\s*(?:$|[·•|,.–—-])`, "imu");
const TODAY = /(?<![\p{L}])(?:publi[ée]e?|mise?\s+en\s+ligne|posted)\s+(aujourd['’]hui|hier|today|yesterday)(?![\p{L}])/iu;
const ABS_NUM = /(?<![\p{L}])(?:publi[ée]e?|mise?\s+en\s+ligne)\s+le\s+(\d{1,2})[/.](\d{1,2})[/.](\d{4})(?!\d)/iu;
const ABS_TXT = /(?<![\p{L}])(?:publi[ée]e?|mise?\s+en\s+ligne)\s+le\s+(\d{1,2})(?:er)?\s+([A-Za-zéèêûôîÉ]{3,9})\.?\s+(\d{4})(?!\d)/iu;

/**
 * La mention de publication écrite dans le DÉBUT du texte d'une page : « Publiée il y a 3 jours », « Posted 2 days ago », « Publiée le 03/11/2026 »,
 * ou, sur LinkedIn, une ligne « Il y a 3 jours ». Rien d'autre : « active il y a 2 jours », « actualisée », « republié », « il y a 5 ans d'expérience »
 * ne sont pas des dates de publication. Renvoie un horodatage ISO (arrondi à la minute près pour un « il y a N jours »), ou null.
 */
export function postedFromText(text: string | null | undefined, now: Date = new Date()): string | null {
  if (!text) return null;
  const head = text.slice(0, HEAD);
  const rel = (m: RegExpExecArray | null): string | null => {
    if (!m) return null;
    const unit = unitMs(m[2]);
    const n = Number(m[1]);
    if (unit == null || !Number.isFinite(n) || n < 0) return null;
    const ok = plausible(now.getTime() - n * unit, now);
    return ok == null ? null : new Date(ok).toISOString();
  };
  const named = rel(POSTED_FR.exec(head)) ?? rel(POSTED_EN.exec(head));
  if (named) return named;
  const day = TODAY.exec(head);
  if (day) {
    const back = /hier|yesterday/i.test(day[1]) ? DAY : 0;
    const ok = plausible(now.getTime() - back, now);
    if (ok != null) return new Date(ok).toISOString();
  }
  const num = ABS_NUM.exec(head);
  if (num) { const iso = parsePosted(`${num[1]}/${num[2]}/${num[3]}`, now); if (iso) return iso; }
  const txt = ABS_TXT.exec(head);
  if (txt) {
    const month = MONTHS[noAccent(txt[2])];
    if (month) { const iso = parsePosted(`${txt[3]}-${String(month).padStart(2, "0")}-${txt[1].padStart(2, "0")}`, now); if (iso) return iso; }
  }
  return rel(LINE_FR.exec(head)) ?? rel(LINE_EN.exec(head));
}

const parisDay = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: TZ });
const dayNumber = (iso: string) => Date.parse(`${iso}T12:00:00Z`);

/** « aujourd'hui », « hier », « il y a 3 j », « il y a 2 sem. », « il y a 2 mois » (jours comptés à l'heure de Paris). */
export function agoLabel(at: string, now: Date = new Date()): string {
  const t = Date.parse(at);
  if (!Number.isFinite(t)) return "";
  const n = Math.round((dayNumber(parisDay(now)) - dayNumber(parisDay(new Date(t)))) / DAY);
  if (n <= 0) return "aujourd'hui";
  if (n === 1) return "hier";
  if (n < 14) return `il y a ${n} j`;
  if (n < 60) return `il y a ${Math.round(n / 7)} sem.`;
  return `il y a ${Math.round(n / 30)} mois`;
}

const VERB: Record<WhenKind, string> = { posted: "publiée", received: "reçue", added: "ajoutée" };

/** « publiée il y a 3 j », « reçue hier », « ajoutée aujourd'hui » ; vide sans date. */
export function whenLabel(w: When, now: Date = new Date()): string {
  if (!w.at) return "";
  const a = agoLabel(w.at, now);
  return a ? `${VERB[w.kind]} ${a}` : "";
}

/** Explication courte, pour l'infobulle et l'aide de la liste. */
export const WHEN_HELP: Record<WhenKind, string> = {
  posted: "Date de publication donnée par le site de l'annonce.",
  received: "Le site ne donne pas la date : c'est celle de l'e-mail d'alerte (souvent proche de la publication, sans certitude).",
  added: "Date à laquelle l'offre a été ajoutée dans JobPilot : le site ne donne pas la date de publication.",
};

const finite = (s: string | null | undefined): s is string => typeof s === "string" && Number.isFinite(Date.parse(s));

/**
 * La date qui compte pour une recommandation. Une date de publication lue (`posted_at`) passe avant tout. Les offres des sources de recherche
 * (Adzuna, Jooble) rangent depuis toujours la date de la source comme date d'arrivée : c'est une date de publication. Une alerte e-mail donne la date
 * de l'e-mail (« reçue ») ; une offre prise depuis une page, l'instant de la prise (« ajoutée »).
 */
export function recoWhen(r: { posted_at?: string | null; received_at: string | null; origin?: string | null }): When {
  if (finite(r.posted_at)) return { at: r.posted_at, kind: "posted" };
  if (!finite(r.received_at)) return { at: null, kind: "received" };
  if (r.origin === "search") return { at: r.received_at, kind: "posted" };
  if (r.origin === "page") return { at: r.received_at, kind: "added" };
  return { at: r.received_at, kind: "received" };
}

/** Clé de tri : l'instant en millisecondes, ou -Infinity sans date (une offre sans date passe toujours en dernier). */
export const whenMs = (w: When): number => (w.at && Number.isFinite(Date.parse(w.at)) ? Date.parse(w.at) : -Infinity);
