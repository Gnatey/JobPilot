"use client";
import { useEffect, useState } from "react";

export const STEPS = ["Lecture de l'offre", "Extraction des exigences", "Comparaison avec ton profil", "Calcul du score"];

export type AnalyzeBody = { url?: string; text?: string; reco_id?: string; app_id?: string; force?: boolean };
export type AnalyzeResult = { id?: string; existing?: boolean; error?: string; needsText?: boolean };

/** Lance l'analyse d'une offre. Renvoie toujours un objet, jamais d'exception. */
export async function analyzeOffer(body: AnalyzeBody): Promise<AnalyzeResult> {
  try {
    const res = await fetch("/api/offers/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || j.error) return { error: j.error ?? "L'analyse a échoué, réessaie.", needsText: res.status === 422 };
    return { id: j.id, existing: j.existing };
  } catch {
    return { error: "Connexion interrompue, réessaie." };
  }
}

/** Texte d'avancement qui change toutes les 4 secondes pendant l'analyse (l'IA met ~20 s). */
export function useSteps(busy: boolean, steps: string[] = STEPS, every = 4000) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!busy) { setI(0); return; }
    const t = setInterval(() => setI((s) => Math.min(s + 1, steps.length - 1)), every);
    return () => clearInterval(t);
  }, [busy, steps.length, every]);
  return steps[i];
}

export const isUrl = (s: string) => /^https?:\/\/\S+$/i.test(s.trim());

export type CaptureItem = { id: string; url: string; title: string };
export type CaptureResult = { found?: number; added?: number; already?: number; source?: string; items?: CaptureItem[]; error?: string };

/** Envoie une page de résultats (reçue du favori) pour en extraire toutes les offres. */
export async function captureList(body: { url: string; title: string; page: string; links: { t: string; h: string }[] }): Promise<CaptureResult> {
  try {
    const res = await fetch("/api/offers/capture", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || j.error) return { error: j.error ?? "Je n'ai pas réussi à lire cette page, réessaie." };
    return j;
  } catch {
    return { error: "Connexion interrompue, réessaie." };
  }
}
