/**
 * Langues du site (13 novembre : « la langue du site doit être internationale, mon pote en Turquie a le site en français »).
 * Logique pure, testée par tests/i18n.test.ts. Le français est la langue SOURCE : chaque texte du code est écrit en français, c'est sa propre clé
 * (`t("Valider mes critères")`), et les dictionnaires `en` et `tr` donnent sa traduction ; un texte sans traduction reste en français.
 */
export const LOCALES = ["fr", "en", "tr"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "fr";

/** Nom de chaque langue, écrit dans sa propre langue (c'est ainsi qu'on la reconnaît dans un sélecteur). */
export const LOCALE_NAMES: Record<Locale, string> = { fr: "Français", en: "English", tr: "Türkçe" };

/** Cookie du choix de la personne : un an, lu côté serveur avant l'affichage (pas de clignotement). */
export const LOCALE_COOKIE = "jp_lang";

export const isLocale = (v: unknown): v is Locale => typeof v === "string" && (LOCALES as readonly string[]).includes(v);

/** « tr-TR » → « tr », « EN_gb » → « en » ; null si la langue n'est pas gérée. */
export const localeOf = (tag: string | null | undefined): Locale | null => {
  const base = String(tag ?? "").trim().toLowerCase().replace(/_/g, "-").split("-")[0];
  return isLocale(base) ? base : null;
};

/** En-tête Accept-Language du navigateur : la première langue gérée, dans l'ordre de préférence (q) ; null si aucune. */
export function fromAcceptLanguage(header: string | null | undefined): Locale | null {
  if (!header) return null;
  const items = header.split(",").map((part, i) => {
    const [tag, ...params] = part.trim().split(";");
    const q = params.map((p) => /^\s*q\s*=\s*([\d.]+)\s*$/i.exec(p)?.[1]).find(Boolean);
    const weight = q === undefined ? 1 : Number(q);
    return { tag: tag.trim(), weight: Number.isFinite(weight) ? weight : 0, i };
  });
  items.sort((a, b) => b.weight - a.weight || a.i - b.i);
  for (const it of items) {
    if (it.weight <= 0) continue; // « q=0 » = refusée
    const l = localeOf(it.tag);
    if (l) return l;
  }
  return null;
}

/**
 * Langue à afficher : le choix de la personne (cookie, puis profil), à défaut la langue de son navigateur, à défaut le français.
 * Un cookie ou un profil illisible est ignoré, jamais une erreur.
 */
export const pickLocale = (o: { cookie?: string | null; profile?: string | null; acceptLanguage?: string | null }): Locale =>
  (isLocale(o.cookie) ? o.cookie : null) ?? (isLocale(o.profile) ? o.profile : null) ?? fromAcceptLanguage(o.acceptLanguage) ?? DEFAULT_LOCALE;

/** Code de langue pour Intl (dates, nombres). */
export const INTL_TAG: Record<Locale, string> = { fr: "fr-FR", en: "en-GB", tr: "tr-TR" };
