"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ClipboardPaste, X, Loader2, ChevronDown } from "lucide-react";
import { TEXT_FIELDS, LIST_FIELDS, type Fiche, type FicheKey } from "@/lib/offer-fiche";
import { MIN_PASTED, MAX_PASTED, textHint } from "@/lib/offer-text";
import { useFeedback } from "@/components/ui/feedback";

const BUSY: Record<string, string> = {
  save: "Enregistrement…",
  analyse: "Nouvelle analyse d'après ta fiche… (20 s environ)",
  reread: "Relecture de l'annonce entière, puis nouvelle analyse… (30 s environ)",
};
const SHORT: FicheKey[] = ["title", "company", "location", "contract", "remote", "seniority", "salary", "domain"];
type Reply = { error?: string; score?: number; before?: number | null; changed?: string[] };

/**
 * « Coller l'annonce » (17 novembre 2026, paquet 24 ; Juliana : « mieux vaut modifier l'affichage "Modifier la fiche" pour mettre à la place l'affichage où on
 * part pour coller toute l'offre »). La fenêtre s'ouvre sur l'annonce : la zone de texte porte le texte gardé (`rawText`), la personne le complète ou le
 * remplace, et « Relire et refaire l'analyse » (route reanalyze, `text`) remplit toute la fiche d'après l'annonce entière puis refait score et écarts.
 * La correction champ par champ (lib/offer-fiche.ts) reste en dessous, repliée : « Enregistrer la fiche » ne touche pas à l'IA, « Enregistrer et refaire
 * l'analyse » repart de la fiche corrigée sans relire l'annonce. Ce qui est écrit à la main n'est jamais écrasé par une relecture.
 * `?fiche=1` dans l'adresse ouvre la fenêtre sur la correction à la main (lien du message « poste non renseigné »).
 */
export function OfferFiche({ offerId, initial, rawText = "", className = "btn btn-sm btn-ghost text-muted hover:text-ink" }: { offerId: string; initial: Fiche; rawText?: string; className?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const { toast } = useFeedback();
  const [open, setOpen] = useState(false);
  const [manual, setManual] = useState(false);
  const [text, setText] = useState(rawText);
  const [f, setF] = useState<Record<string, string>>(() => toForm(initial));
  const [busy, setBusy] = useState<"save" | "analyse" | "reread" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const asked = useRef(false);
  const base = useMemo(() => toForm(initial), [initial]);
  const dirty = Object.keys(base).some((k) => (f[k] ?? "") !== base[k]); // corrections à la main pas encore enregistrées
  const n = text.trim().length;
  const hint = textHint(n);

  // Ouverture par l'adresse (une seule fois), sur la correction à la main, puis l'adresse est nettoyée
  useEffect(() => {
    if (asked.current || params.get("fiche") !== "1") return;
    asked.current = true;
    history.replaceState(null, "", location.pathname);
    setManual(true);
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
    setText(rawText);
    setManual(false);
    setErr(null);
    setOpen(true);
  }

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  async function call(url: string, init: { method: string; body: unknown }): Promise<Reply> {
    try {
      const res = await fetch(url, { method: init.method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(init.body) });
      return (await res.json().catch(() => ({ error: "Réponse illisible, réessaie." }))) as Reply;
    } catch {
      return { error: "Connexion interrompue, réessaie." };
    }
  }

  /** L'analyse refaite (d'après la fiche ou l'annonce collée) : message final, la fiche ou le texte étant déjà enregistrés si elle échoue. */
  function finish(r: Reply, done: string, saved: string) {
    router.refresh();
    if (r.error) return setErr(saved ? `${saved} ${r.error}` : r.error);
    setOpen(false);
    toast(r.before != null && r.before !== r.score ? `${done} : ${r.before} % → ${r.score} %` : `${done} : ${r.score} %`, { tone: "info", ms: 7000 });
  }

  // Corrections à la main : enregistrer seul, ou enregistrer puis refaire l'analyse d'après la fiche
  async function submit(reanalyse: boolean) {
    setErr(null);
    setBusy("save");
    const saved = await call(`/api/offers/${offerId}`, { method: "PATCH", body: f });
    if (saved.error) { setBusy(null); return setErr(saved.error); }
    const titleChanged = saved.changed?.includes("title");

    if (reanalyse) {
      setBusy("analyse");
      const r = await call(`/api/offers/${offerId}/reanalyze`, { method: "POST", body: { source: "fiche" } });
      setBusy(null);
      // La fiche est déjà enregistrée : seule l'analyse a échoué (IA saturée, limite du jour)
      finish(r, "Fiche enregistrée, analyse refaite", "Fiche enregistrée.");
    } else {
      setBusy(null);
      router.refresh();
      setOpen(false);
      toast(saved.changed?.length ? "Fiche enregistrée." : "Rien n'a changé.", { tone: "info" });
    }
    if (titleChanged) toast("Le nouveau poste sera sur les prochains CV : « Autre version » en écrit un avec lui.", { tone: "info", ms: 9000 });
  }

  // Annonce collée : le texte entier est relu par l'IA, qui remplit la fiche et refait l'analyse. Les corrections à la main en attente sont enregistrées d'abord
  // (elles sont alors gardées : une relecture n'écrase jamais ce que la personne a écrit).
  async function reread() {
    if (n < MIN_PASTED) return;
    setErr(null);
    let note = "";
    if (dirty) {
      setBusy("save");
      const saved = await call(`/api/offers/${offerId}`, { method: "PATCH", body: f });
      if (saved.error) { setBusy(null); return setErr(saved.error); }
      note = "Tes corrections sont enregistrées.";
    }
    setBusy("reread");
    const r = await call(`/api/offers/${offerId}/reanalyze`, { method: "POST", body: { text } });
    setBusy(null);
    finish(r, "Annonce relue, analyse refaite", note);
  }

  return (
    <>
      <button type="button" className={className} onClick={show} title="Coller l'annonce entière pour que l'analyse la relise et refasse la fiche, le score et les écarts. La fiche se corrige aussi à la main."><ClipboardPaste size={15} /> Coller l'annonce</button>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/45" onClick={() => !busy && setOpen(false)}>
          <form onSubmit={(e) => { e.preventDefault(); submit(false); }} onClick={(e) => e.stopPropagation()} aria-label="Coller l'annonce"
            className="flex h-full w-full max-w-lg flex-col overflow-y-auto bg-surface p-5 shadow-2xl" style={{ animation: "toast-in .2s ease-out both" }}>
            <div className="flex items-center justify-between">
              <h2 className="display text-3xl">Coller l'annonce</h2>
              <button type="button" className="btn btn-ghost btn-icon" onClick={() => setOpen(false)} disabled={!!busy} aria-label="Fermer"><X size={20} /></button>
            </div>
            <p className="mt-2 text-sm text-muted">
              Colle le texte entier de l'annonce, depuis le haut de la page jusqu'à la fin. L'analyse le relit, remplit toute la fiche, puis refait le score et les écarts.
            </p>

            <label className="mt-4 block">
              <span className="label">Texte de l'annonce</span>
              <textarea
                rows={12}
                className="field mt-1 min-h-48 resize-y font-[inherit] text-[15px] leading-relaxed"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Colle ici l'annonce : Ctrl + V (ou Cmd + V sur Mac)."
                autoFocus={!rawText}
                disabled={busy === "reread"}
                aria-describedby="annonce-aide"
              />
            </label>
            <div id="annonce-aide" className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3 text-xs text-muted">
              <span className={hint ? "text-marigold-deep" : ""}>{hint || (rawText && text === rawText ? "Texte gardé pour cette offre." : "")}</span>
              <span aria-live="polite">{n.toLocaleString("fr-FR")} signes{n > MAX_PASTED ? ` : au-delà de ${MAX_PASTED.toLocaleString("fr-FR")}, la fin est ignorée` : ""}</span>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button type="button" className="btn btn-primary" onClick={reread} disabled={!!busy || n < MIN_PASTED} title="Compte pour une analyse dans ton quota du jour">Relire et refaire l'analyse</button>
              <button type="button" className="btn btn-ghost ml-auto" onClick={() => setOpen(false)} disabled={!!busy}>Fermer</button>
            </div>
            <p className="mt-2 text-xs text-muted">
              Une analyse de ton quota du jour. Ce que tu as corrigé à la main dans la fiche est gardé, jamais écrasé par la relecture.
              {dirty && " Tes corrections en cours (plus bas) seront enregistrées d'abord."}
            </p>

            {busy && (
              <div className="mt-4 flex items-center gap-3 rounded-xl bg-marigold/14 px-4 py-3 text-sm font-semibold" role="status"><Loader2 size={18} className="animate-spin" /> {BUSY[busy]}</div>
            )}
            {err && <p className="mt-4 rounded-xl bg-bad/10 p-3 text-sm text-bad" role="alert">{err}</p>}

            <details className="mt-6 border-t border-line pt-4" open={manual} onToggle={(e) => setManual(e.currentTarget.open)}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold [&::-webkit-details-marker]:hidden">
                <span>Corriger la fiche à la main<span className="block text-sm font-normal text-muted">poste, entreprise, lieu, missions…</span></span>
                <ChevronDown size={18} className={`shrink-0 transition-transform ${manual ? "rotate-180" : ""}`} aria-hidden />
              </summary>
              <p className="mt-2 text-sm text-muted">
                Corrige ce que l'analyse a lu dans l'annonce. Ce que tu écris ici sert au CV, à la lettre et à l'analyse, et n'est jamais écrasé quand l'annonce est relue.
              </p>

              <div className="mt-4 grid grid-cols-2 gap-3">
                {TEXT_FIELDS.filter((t) => SHORT.includes(t.key)).map((t) => (
                  <label key={t.key} className={t.key === "title" || t.key === "company" || t.key === "domain" ? "col-span-2" : ""}>
                    <span className="label">{t.label}</span>
                    <input className="field mt-1" value={f[t.key] ?? ""} maxLength={t.max} onChange={set(t.key)} autoFocus={manual && t.key === "title" && !initial.title} />
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

              <div className="mt-5 flex flex-wrap items-center gap-2">
                <button type="submit" className="btn" disabled={!!busy}>Enregistrer la fiche</button>
                <button type="button" className="btn" onClick={() => submit(true)} disabled={!!busy} title="Repart de la fiche corrigée, sans relire l'annonce. Compte pour une analyse dans ton quota du jour">Enregistrer et refaire l'analyse</button>
              </div>
            </details>
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
