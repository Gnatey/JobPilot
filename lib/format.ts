/** Dates : tout est calculé à l'heure de Paris, sur le serveur comme dans le navigateur. */
const TZ = "Europe/Paris";

export const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: TZ });

const noon = (d: string) => Date.parse(`${d.slice(0, 10)}T12:00:00Z`);

/** Date (AAAA-MM-JJ) dans n jours, à partir d'aujourd'hui ou d'une date donnée. */
export function addDays(n: number, from: string = today()) {
  return new Date(noon(from) + n * 864e5).toISOString().slice(0, 10);
}
/** Nombre de jours entre deux dates (b - a). */
export const dayDiff = (a: string, b: string) => Math.round((noon(b) - noon(a)) / 864e5);
export const daysAgo = (d?: string | null) => (d ? dayDiff(d, today()) : null);

export const fmtDate = (d?: string | null) =>
  d ? new Date(d.length <= 10 ? `${d}T12:00:00Z` : d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: TZ }) : "";

export const fmtDateTime = (d?: string | null) =>
  d ? new Date(d).toLocaleString("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: TZ }) : "";

export const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

/** « il y a 3 j », « hier », « il y a 2 sem. » */
export function ago(d?: string | null) {
  const n = daysAgo(d);
  if (n == null) return "";
  if (n <= 0) return "aujourd'hui";
  if (n === 1) return "hier";
  if (n < 14) return `il y a ${n} j`;
  if (n < 60) return `il y a ${Math.round(n / 7)} sem.`;
  return `il y a ${Math.round(n / 30)} mois`;
}

/** « aujourd'hui », « demain », « dans 3 j », « en retard de 2 j » */
export function until(d?: string | null) {
  if (!d) return "";
  const n = dayDiff(today(), d);
  if (n === 0) return "aujourd'hui";
  if (n === 1) return "demain";
  if (n > 1) return `dans ${n} j`;
  return `en retard de ${-n} j`;
}

export function greeting() {
  // « en-GB » + h23 donne « 10 » ; « fr-FR » donnait « 10 h », illisible comme nombre, d'où un « Bonsoir » à toute heure
  const h = parseInt(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: TZ }).format(new Date()), 10);
  return h >= 5 && h < 18 ? "Bonjour" : "Bonsoir";
}
export function weekday() {
  return new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: TZ });
}
/** Lundi de la semaine en cours (AAAA-MM-JJ) */
export function weekStart() {
  const t = today();
  const dow = new Date(noon(t)).getUTCDay(); // 0 = dimanche
  return addDays(-((dow + 6) % 7), t);
}
/** Jour (AAAA-MM-JJ, heure de Paris) d'un horodatage. */
export const dateOf = (ts: string) => new Date(ts).toLocaleDateString("sv-SE", { timeZone: TZ });
