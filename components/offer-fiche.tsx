"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Pencil, X, Loader2 } from "lucide-react";
import { TEXT_FIELDS, LIST_FIELDS, type Fiche, type FicheKey } from "@/lib/offer-fiche";
import { useFeedback } from "@/components/ui/feedback";

const BUSY: Record<string, string> = { save: "Enregistrement…", analyse: "Nouvelle analyse d'après ta fiche… (20 s environ)" };
const SHORT: FicheKey[] = ["title", "company", "location", "contract", "remote", "seniority", "salary", "domain"];

/**
 * « Modifier la fiche » : tous les champs que l'analyse a lus de l'annonce, modifiables à la main (lib/offer-fiche.ts).
 * « Enregistrer » ne touche pas à l'IA ; « Enregistrer et refaire l'analyse » repart de la fiche corrigée, sans relire l'annonce.
 * `?fiche=1` dans l'adresse ouvre la fenêtre (lien du message « poste non renseigné »).
 */
export function OfferFiche({ offerId, initial, className = "btn btn-sm btn-ghost text-muted hover:text-ink" }: { offerId: string; initial: Fiche; className?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const { toast } = useFeedback();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<Record<string, string>>(() => toForm(initial));
  const [busy, setBusy] = useState<"save" | "analyse" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const asked = useRef(false);

  // Ouverture par l'adresse (une seule fois), puis l'adresse est nettoyée
  useEffect(() => {
    if (asked.current || params.get("fiche") !== "1") return;
    asked.current = true;
    history.replaceState(null, "", location.pathname);
    setOpen(true);
  }, [params]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy]);

  function show() {
    setF(toForm(initial)); // la fiche enregistrée, pas un brouillon abandonné
    setErr(null);
    setOpen(true);
  }

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  async function submit(reanalyse: boolean) {
    setErr(null);
    setBusy("save");
    let saved: { error?: string; changed?: string[] } = {};
    try {
      const res = await fetch(`/api/offers/${offerId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
      saved = await res.json().catch(() => ({ error: "Réponse illisible, réessaie." }));
    } catch {
      saved = { error: "Connexion interrompue, réessaie." };
    }
    if (saved.error) { setBusy(null); return setErr(saved.error); }
    const titleChanged = saved.changed?.includes("title");

    if (reanalyse) {
      setBusy("analyse");
      let r: { score?: number; before?: number | null; error?: string } = {};
      try {
        const res = await fetch(`/api/offers/${offerId}/reanalyze`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source: "fiche" }) });
        r = await res.json().catch(() => ({ error: "Réponse illisible, réessaie." }));
      } catch {
        r = { error: "Connexion interrompue, réessaie." };
      }
      setBusy(null);
      router.refresh();
      // La fiche est déjà enregistrée : seule l'analyse a échoué (IA saturée, limite du jour)
      if (r.error) return setErr(`Fiche enregistrée. ${r.error}`);
      setOpen(false);
      toast(r.before != null && r.before !== r.score ? `Fiche enregistrée, analyse refaite : ${r.before} % → ${r.score} %` : `Fiche enregistrée, analyse refaite : ${r.score} %`, { tone: "info", ms: 7000 });
    } else {
      setBusy(null);
      router.refresh();
      setOpen(false);
      toast(saved.changed?.length ? "Fiche enregistrée." : "Rien n'a changé.", { tone: "info" });
    }
    if (titleChanged) toast("Le nouveau poste sera sur les prochains CV : « Autre version » en écrit un avec lui.", { tone: "info", ms: 9000 });
  }

  return (
    <>
      <button type="button" className={className} onClick={show} title="Corriger ce que l'analyse a lu de l'annonce : poste, entreprise, lieu, missions, mots-clés…"><Pencil size={15} /> Modifier la fiche</button>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/45" onClick={() => !busy && setOpen(false)}>
          <form onSubmit={(e) => { e.preventDefault(); submit(false); }} onClick={(e) => e.stopPropagation()} aria-label="Fiche de l'offre"
            className="flex h-full w-full max-w-lg flex-col overflow-y-auto bg-surface p-5 shadow-2xl" style={{ animation: "toast-in .2s ease-out both" }}>
            <div className="flex items-center justify-between">
              <h2 className="display text-3xl">Fiche de l'offre</h2>
              <button type="button" className="btn btn-ghost btn-icon" onClick={() => setOpen(false)} disabled={!!busy} aria-label="Fermer"><X size={20} /></button>
            </div>
            <p className="mt-2 text-sm text-muted">
              Corrige ce que l'analyse a lu dans l'annonce. Ce que tu écris ici sert au CV, à la lettre et à l'analyse, et n'est jamais écrasé quand l'annonce est relue.
            </p>

            <div className="mt-4 grid grid-cols-2 gap-3">
              {TEXT_FIELDS.filter((t) => SHORT.includes(t.key)).map((t) => (
                <label key={t.key} className={t.key === "title" || t.key === "company" || t.key === "domain" ? "col-span-2" : ""}>
                  <span className="label">{t.label}</span>
                  <input className="field mt-1" value={f[t.key] ?? ""} maxLength={t.max} onChange={set(t.key)} autoFocus={t.key === "title" && !initial.title} />
                  {t.hint && <span className="mt-1 block text-xs text-muted">{t.hint}</span>}
                </label>
              ))}
              <label className="col-span-2">
                <span className="label">L'entreprise et l'équipe</span>
                <textarea rows={3} className="field mt-1" maxLength={1500} value={f.company_context ?? ""} onChange={set("company_context")} />
              </label>
              {LIST_FIELDS.map((l) => (
                <label key={l.key} className="col-span-2">
                  <span className="label">{l.label}<span className="ml-1.5 text-xs font-normal text-muted">un par ligne</span></span>
                  <textarea rows={l.key === "keywords" ? 5 : 4} className="field mt-1" value={f[l.key] ?? ""} onChange={set(l.key)} />
                  {l.hint && <span className="mt-1 block text-xs text-muted">{l.hint}</span>}
                </label>
              ))}
            </div>

            {busy && (
              <div className="mt-4 flex items-center gap-3 rounded-xl bg-marigold/14 px-4 py-3 text-sm font-semibold" role="status"><Loader2 size={18} className="animate-spin" /> {BUSY[busy]}</div>
            )}
            {err && <p className="mt-4 rounded-xl bg-bad/10 p-3 text-sm text-bad" role="alert">{err}</p>}

            <div className="sticky bottom-0 -mx-5 mt-6 flex flex-wrap items-center gap-2 border-t border-line bg-surface px-5 pb-1 pt-4">
              <button type="submit" className="btn" disabled={!!busy}>Enregistrer</button>
              <button type="button" className="btn btn-primary" onClick={() => submit(true)} disabled={!!busy} title="Compte pour une analyse dans ton quota du jour">Enregistrer et refaire l'analyse</button>
              <button type="button" className="btn btn-ghost ml-auto" onClick={() => setOpen(false)} disabled={!!busy}>Annuler</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

/** La fiche pour les champs du formulaire : les listes deviennent un texte, un élément par ligne. */
function toForm(x: Fiche): Record<string, string> {
  const out: Record<string, string> = {};
  for (const t of TEXT_FIELDS) out[t.key] = x[t.key] ?? "";
  for (const l of LIST_FIELDS) out[l.key] = (x[l.key] ?? []).join("\n");
  return out;
}
