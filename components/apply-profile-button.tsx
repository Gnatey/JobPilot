"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFeedback } from "@/components/ui/feedback";

export function ApplyProfileButton({ id }: { id: string }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const { toast } = useFeedback();
  return (
    <button className="btn btn-primary" disabled={busy} onClick={async () => {
      setBusy(true);
      const res = await fetch("/api/cv/apply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }).catch(() => null);
      setBusy(false);
      if (!res?.ok) return toast("Le profil n'a pas pu être mis à jour, réessaie.", { tone: "err" });
      toast("Profil maître mis à jour. Rien n'a été supprimé.");
      router.refresh();
    }}>
      {busy ? "Mise à jour…" : "Mettre à jour mon profil"}
    </button>
  );
}
