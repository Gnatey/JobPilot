"use client";
import { createContext, useContext, useMemo } from "react";
import { makeT, type TFn } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/locales";
import en from "@/lib/i18n/en";
import tr from "@/lib/i18n/tr";

const Ctx = createContext<Locale>("fr");

/** Donne la langue aux composants clients. Les dictionnaires sont dans le code partagé (mis en cache par le navigateur), pas recopiés dans chaque page. */
export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <Ctx.Provider value={locale}>{children}</Ctx.Provider>;
}

export const useLocale = () => useContext(Ctx);

/** `const t = useT(); t("Valider mes critères")` ; variables : `t("{1} offres", [n])`. Même langue que le serveur : pas de décalage à l'affichage. */
export function useT(): TFn {
  const locale = useContext(Ctx);
  return useMemo(() => makeT(locale === "en" ? en : locale === "tr" ? tr : null), [locale]);
}
