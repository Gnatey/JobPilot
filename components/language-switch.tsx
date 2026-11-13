"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Languages } from "lucide-react";
import { LOCALES, LOCALE_COOKIE, LOCALE_NAMES, isLocale } from "@/lib/i18n/locales";
import { useLocale, useT } from "./i18n";

/**
 * Sélecteur de langue. Le choix est écrit dans un cookie (un an) lu par le serveur : toutes les pages suivent, sans clignotement.
 * Connectée, la personne le retrouve aussi dans son profil (`preferences.lang`) : les textes écrits par l'IA pour elle suivent la même langue.
 */
export function LanguageSwitch({ signedIn = false, className = "" }: { signedIn?: boolean; className?: string }) {
  const locale = useLocale();
  const t = useT();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function change(next: string) {
    if (!isLocale(next) || next === locale) return;
    setBusy(true);
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    if (signedIn) await fetch("/api/language", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lang: next }) }).catch(() => null);
    router.refresh();
    setBusy(false);
  }

  return (
    <label className={`inline-flex items-center gap-2 text-sm ${className}`}>
      <Languages size={16} aria-hidden className="shrink-0 text-muted" />
      <span className="sr-only">{t("Langue du site")}</span>
      <select value={locale} disabled={busy} onChange={(e) => change(e.target.value)} className="input !py-1.5 !pr-8 text-sm" aria-label={t("Langue du site")}>
        {LOCALES.map((l) => <option key={l} value={l} lang={l}>{LOCALE_NAMES[l]}</option>)}
      </select>
    </label>
  );
}
