"use client";
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { rejectLabel } from "@/lib/types";
import { useFeedback } from "@/components/ui/feedback";
import { refreshBadges } from "@/components/nav";

type R = { id: string; title?: string | null };
export type Decision = "accept" | "reject" | "restore";

async function call(id: string, decision: Decision, reason?: string, toSuivi?: boolean) {
  try {
    const res = await fetch(`/api/recommendations/${id}/decide`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision, reason, to_suivi: toSuivi || undefined }) });
    const j = await res.json().catch(() => ({}));
    return res.ok && !j.error ? j : { error: j.error ?? "L'action a échoué, réessaie." };
  } catch {
    return { error: "Connexion interrompue, réessaie." };
  }
}

/**
 * « Je candidate » / « Pas pour moi » avec retour immédiat, annulation en un clic et compteurs à jour.
 * onUndo permet à l'écran de remettre l'offre dans sa liste.
 * toSuivi (Tri rapide) : un « non » range en plus l'offre dans Suivi, en Abandonné ; « Annuler » l'en retire.
 */
export function useRecoDecision(onUndo?: (id: string) => void, opts: { toSuivi?: boolean } = {}) {
  const toSuivi = opts.toSuivi ?? false;
  const { toast } = useFeedback();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  const decide = useCallback(async (r: R, decision: Decision, reason?: string) => {
    setBusy(r.id);
    const res = await call(r.id, decision, reason, toSuivi);
    setBusy(null);
    if (res.error) { toast(res.error, { tone: "err" }); return null; }
    refreshBadges();
    if (decision === "restore") { toast("Remise dans les offres à trier", { tone: "info" }); return res; }
    const name = r.title ? ` : ${r.title}` : "";
    toast(
      decision === "accept" ? `Ajoutée au suivi${name}` : `${toSuivi ? "Abandonnée" : "Écartée"}${reason ? ` (${rejectLabel(reason).toLowerCase()})` : ""}${name}`,
      { action: { label: "Annuler", run: async () => { const u = await call(r.id, "restore"); if (u.error) toast(u.error, { tone: "err" }); else { onUndo?.(r.id); refreshBadges(); router.refresh(); } } } }
    );
    return res;
  }, [toast, router, onUndo, toSuivi]);

  return { decide, busy };
}

/** Écarte ou restaure plusieurs offres d'un coup. */
export async function bulkDecision(ids: string[], decision: "reject" | "restore", reason?: string) {
  const res = await fetch("/api/recommendations/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids, decision, reason }) });
  const j = await res.json().catch(() => ({}));
  return res.ok && !j.error ? { ok: true as const } : { ok: false as const, error: (j.error as string) ?? "L'action a échoué." };
}
