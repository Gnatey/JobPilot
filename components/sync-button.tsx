"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { useFeedback } from "@/components/ui/feedback";
import { refreshBadges } from "@/components/nav";
import { isExpiredMessage } from "@/lib/gmail-errors";

type Result = {
  gmail?: { scanned?: number; updated?: number; recommended?: number; skipped?: string; partial?: boolean; stopped?: string };
  searches?: { added: number };
  prep?: { prepared: number; stopped?: string };
  partial?: boolean;
  error?: string;
};

const MAX_PASSES = 3;

/** Lit Gmail, relance les recherches sauvegardées et analyse les meilleures offres. Si le temps manque, reprend tout seul là où ça s'est arrêté. */
export function SyncButton({ label = "Tout synchroniser", primary = false }: { label?: string; primary?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [pass, setPass] = useState(1);
  const router = useRouter();
  const { toast } = useFeedback();
  async function run() {
    setBusy(true);
    let scanned = 0, updated = 0, recos = 0, prepared = 0, skipped = false, last: Result = {};
    for (let i = 1; i <= MAX_PASSES; i++) {
      setPass(i);
      const r = (await fetch("/api/gmail/sync", { method: "POST" }).then((r) => r.json()).catch(() => ({ error: "Connexion interrompue, réessaie." }))) as Result;
      last = r;
      if (r.error) {
        if (i === 1) {
          setBusy(false);
          // Accès Gmail perdu : le message seul ne mène nulle part, on propose d'aller le reconnecter
          return toast(r.error, { tone: "err", ...(isExpiredMessage(r.error) ? { ms: 12000, action: { label: "Reconnecter", run: () => router.push("/parametres#gmail") } } : {}) });
        }
        break; // un passage précédent a déjà avancé : on garde le bilan
      }
      skipped = skipped || Boolean(r.gmail?.skipped);
      scanned += r.gmail?.scanned ?? 0; updated += r.gmail?.updated ?? 0;
      recos += (r.gmail?.recommended ?? 0) + (r.searches?.added ?? 0);
      prepared += r.prep?.prepared ?? 0;
      const ia = r.gmail?.stopped === "ia" || r.prep?.stopped === "ia" || r.prep?.stopped === "quota"; // inutile de reprendre si l'IA ne répond plus
      if (!r.partial || ia) break;
    }
    setBusy(false);
    const parts = [];
    if (skipped) parts.push("Gmail n'est pas connecté");
    else parts.push(`${scanned} emails lus, ${updated} statuts mis à jour`);
    parts.push(recos ? `${recos} nouvelle${recos > 1 ? "s" : ""} offre${recos > 1 ? "s" : ""} à trier` : "pas de nouvelle offre");
    if (prepared) parts.push(`${prepared} analysée${prepared > 1 ? "s" : ""}`);
    let msg = parts.join(", ") + ".";
    if (last.error) msg += ` ${last.error}`;
    else if (last.partial) msg += last.gmail?.stopped === "ia" || last.prep?.stopped === "ia" ? " L'IA de Google est saturée : relance dans quelques minutes, ça reprendra là où c'est resté." : " Il en reste : relance pour continuer.";
    toast(msg, { tone: skipped ? "info" : last.error || last.partial ? "info" : "ok", ms: 7000 });
    refreshBadges();
    router.refresh();
  }
  return (
    <button className={`btn ${primary ? "btn-primary" : ""}`} onClick={run} disabled={busy}>
      <RefreshCw size={16} className={busy ? "animate-spin" : ""} /> {busy ? (pass > 1 ? `Synchronisation… (suite ${pass}/${MAX_PASSES})` : "Synchronisation…") : label}
    </button>
  );
}
