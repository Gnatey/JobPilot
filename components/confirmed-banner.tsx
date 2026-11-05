"use client";
import { useEffect, useState } from "react";
import { CircleCheck, X } from "lucide-react";
import { CONFIRMED_COOKIE } from "@/lib/auth-return";

/** Phrase verte à l'arrivée dans l'appli juste après le clic sur le lien de confirmation du mail (témoin posé par /auth/confirme). */
export function ConfirmedBanner() {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    try {
      if (!document.cookie.split("; ").some((c) => c === `${CONFIRMED_COOKIE}=1`)) return;
      document.cookie = `${CONFIRMED_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`; // une seule fois
      setShown(true);
      const t = setTimeout(() => setShown(false), 12_000);
      return () => clearTimeout(t);
    } catch {
      // cookies illisibles : tant pis, la personne est de toute façon connectée
    }
  }, []);
  if (!shown) return null;
  return (
    <p className="mb-6 flex items-start gap-2.5 rounded-2xl border border-good/40 bg-good/10 p-4 text-sm text-ink" role="status">
      <CircleCheck size={20} className="mt-px shrink-0 text-good" aria-hidden />
      <span className="flex-1 font-medium">Ton adresse est confirmée. Bienvenue sur JobPilot !</span>
      <button type="button" className="hit rounded-full p-1 text-muted hover:bg-paper" onClick={() => setShown(false)} aria-label="Fermer ce message"><X size={16} aria-hidden /></button>
    </p>
  );
}
