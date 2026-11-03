"use client";
import { Copy } from "lucide-react";
import { useFeedback } from "@/components/ui/feedback";

/** Copie l'identifiant complet d'un compte, pour le chercher dans Supabase (Authentication > Users). */
export function CopyId({ id, code }: { id: string; code: string }) {
  const { toast } = useFeedback();
  return (
    <button
      type="button"
      className="btn btn-ghost btn-icon !h-8 !w-8"
      aria-label={`Copier l'identifiant complet du compte ${code}`}
      title="Copier l'identifiant complet"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(id);
          toast("Identifiant copié. Colle-le dans la recherche de Supabase (Authentication > Users).", { ms: 2600 });
        } catch {
          toast("Copie impossible.", { tone: "err", ms: 2000 });
        }
      }}
    >
      <Copy size={15} aria-hidden />
    </button>
  );
}
