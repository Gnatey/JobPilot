"use client";
import { useEffect, useState } from "react";
import { makeT } from "@/lib/i18n/translate";
import { LOCALE_COOKIE, localeOf, type Locale } from "@/lib/i18n/locales";
import en from "@/lib/i18n/en";
import tr from "@/lib/i18n/tr";

/** Dernier filet de sécurité : si même la mise en page plante. Pas de dépendance au reste de l'app (la langue se relit seule : cookie, puis navigateur). */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [locale, setLocale] = useState<Locale>("fr");
  useEffect(() => {
    try {
      const cookie = document.cookie.split("; ").find((c) => c.startsWith(`${LOCALE_COOKIE}=`))?.split("=")[1];
      setLocale(localeOf(cookie) ?? localeOf(navigator.language) ?? "fr");
    } catch { /* le français */ }
  }, []);
  const t = makeT(locale === "en" ? en : locale === "tr" ? tr : null);
  return (
    <html lang={locale}>
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#f2f4f9", color: "#151c38", display: "grid", minHeight: "100vh", placeItems: "center", padding: 24 }}>
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <h1 style={{ fontSize: 28, margin: 0 }}>{t("JobPilot a rencontré un problème")}</h1>
          <p style={{ color: "#566083" }}>{t("Tes données sont en sécurité. Recharge la page, ou réessaie dans un instant.")}</p>
          <button onClick={reset} style={{ marginTop: 12, padding: "12px 22px", borderRadius: 999, border: 0, background: "#f5b800", color: "#151c38", fontWeight: 700, fontSize: 16, cursor: "pointer" }}>{t("Réessayer")}</button>
        </div>
      </body>
    </html>
  );
}
