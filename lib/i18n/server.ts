import { cookies, headers } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, pickLocale, type Locale } from "./locales";
import { translate, type Dict, type Vars } from "./translate";
import en from "./en";
import tr from "./tr";

/** Dictionnaire d'une langue (le français est la langue source : pas de dictionnaire). */
export const dictOf = (l: Locale): Dict | null => (l === "en" ? en : l === "tr" ? tr : null);

/** Langue de la requête en cours : le choix de la personne (cookie), sinon la langue de son navigateur, sinon le français. Hors requête : le français. */
export async function getLocale(): Promise<Locale> {
  try {
    const [c, h] = await Promise.all([cookies(), headers()]);
    return pickLocale({ cookie: c.get(LOCALE_COOKIE)?.value, acceptLanguage: h.get("accept-language") });
  } catch {
    return DEFAULT_LOCALE;
  }
}

/** `t` d'un composant serveur ou d'une route : `const t = await getT(); t("Bonjour")`. */
export async function getT(): Promise<(text: string, vars?: Vars) => string> {
  const dict = dictOf(await getLocale());
  return (text, vars) => translate(dict, text, vars);
}
