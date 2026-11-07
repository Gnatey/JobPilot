"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Copy, ExternalLink, Loader2 } from "lucide-react";
import { useFeedback } from "@/components/ui/feedback";
import { refreshBadges } from "@/components/nav";
import { bulkMessage, firstOf, linkOf } from "@/lib/analyze-skips";
import { droppable, dupSummary, findDuplicates, type DupGroup, type DupItem } from "@/lib/offer-dups";

const day = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });

/**
 * « Doublons » : repère les lignes d'Offres & CV qui sont la même annonce (voir lib/offer-dups.ts). Calcul local, sans IA ni requête.
 * Dans chaque groupe, la meilleure ligne est gardée ; les autres sont cochées d'office quand le doublon est sûr (même intitulé et même entreprise),
 * à relire sinon. Les liens « Annonce » servent à vérifier. Une ligne qui a un CV n'est jamais proposée. Suppression en lot avec confirmation.
 */
export function OfferDups({ items }: { items: DupItem[] }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const groups = useMemo(() => findDuplicates(items), [items]);
  const [open, setOpen] = useState(false);
  const [more, setMore] = useState(false);
  const [over, setOver] = useState<Record<string, boolean>>({}); // choix de la personne ; sinon : coché si le doublon est sûr
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const dlg = useRef<HTMLDialogElement>(null);

  const isOn = (g: DupGroup, it: DupItem) => droppable(g, it) && (over[it.key] ?? g.sure);
  const chosen = useMemo(() => {
    const seen = new Set<string>();
    const out: DupItem[] = [];
    for (const g of groups) for (const it of g.items) if (droppable(g, it) && (over[it.key] ?? g.sure) && !seen.has(it.key)) { seen.add(it.key); out.push(it); }
    return out;
  }, [groups, over]);

  useEffect(() => {
    const el = dlg.current;
    if (confirm && el && !el.open) el.showModal();
  }, [confirm]);

  if (!groups.length) return null;

  function closeDialog() {
    if (busy) return;
    dlg.current?.close();
    setConfirm(false);
  }

  async function removeChosen() {
    const list = chosen;
    if (!list.length) return;
    setBusy(true);
    let deleted = 0;
    let failed = 0;
    for (let i = 0; i < list.length; i++) {
      setStep(i + 1);
      const it = list[i];
      const res = await fetch(it.kind === "offer" ? `/api/offers/${it.key}` : `/api/applications/${it.key}`, {
        method: "DELETE", headers: { "Content-Type": "application/json" }, body: "{}", // sans raison : un doublon ne dit rien de tes goûts
      }).catch(() => null);
      if (res?.ok) deleted++;
      else {
        failed++;
        if (res?.status === 401) { failed += list.length - i - 1; break; }
      }
    }
    setBusy(false);
    dlg.current?.close();
    setConfirm(false);
    if (deleted) { refreshBadges(); router.refresh(); }
    toast(bulkMessage(deleted, failed), { tone: failed ? "err" : "info" });
  }

  const v = firstOf(groups, more, 8);
  return (
    <div className="mb-4 rounded-2xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <Copy size={16} aria-hidden /> {open ? "Masquer les doublons" : `Voir les doublons (${groups.length})`}
        </button>
        <p className="min-w-0 flex-1 basis-60 text-sm text-muted">{dupSummary(groups)} Sans IA : rien n'est supprimé sans toi.</p>
      </div>
      {open && (
        <div className="mt-3 space-y-4 border-t border-line pt-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <p className="min-w-0 flex-1 basis-60 text-muted">
              Dans chaque groupe, je garde la meilleure ligne (celle qui a un CV, sinon l'offre déjà analysée, sinon la plus ancienne). Ouvre les liens pour vérifier, décoche ce que tu veux garder.
            </p>
            <button type="button" className="btn btn-sm border-bad bg-bad text-on-solid" disabled={!chosen.length} onClick={() => setConfirm(true)}>
              {chosen.length ? `Supprimer les ${chosen.length} cochée${chosen.length > 1 ? "s" : ""}` : "Aucune cochée"}
            </button>
          </div>
          {v.shown.map((g) => (
            <section key={g.id} aria-label={`Doublons : ${g.items[0].title}`}>
              <h3 className="font-semibold text-ink">{g.items[0].title}</h3>
              <p className="text-muted">{g.sure ? "Même intitulé, même entreprise." : "Même intitulé, entreprise différente ou non précisée : à relire avant de supprimer (rien n'est coché)."}</p>
              <ul className="mt-1 divide-y divide-line">
                {g.items.map((it) => {
                  const link = linkOf(it.ad);
                  const can = droppable(g, it);
                  return (
                    <li key={it.key} className="flex items-center gap-2 py-1">
                      {can ? (
                        <input
                          type="checkbox" className="h-4 w-4 shrink-0 accent-[var(--color-marigold)]" checked={isOn(g, it)}
                          onChange={(e) => setOver((o) => ({ ...o, [it.key]: e.target.checked }))} aria-label={`Supprimer ce doublon : ${it.title}, ${it.company || "entreprise ?"}`}
                        />
                      ) : <span className="w-4 shrink-0" aria-hidden />}
                      <Link href={it.href} className="min-w-0 flex-1 break-words text-ink hover:underline">
                        {it.company || "Entreprise ?"} <span className="text-muted">· {it.kind === "offer" ? (it.cv ? `analysée, ${it.cv} CV` : "analysée") : "à analyser"} · {day(it.at)}</span>
                      </Link>
                      {it.key === g.keepId ? <span className="shrink-0 rounded-full bg-paper px-2 py-0.5 text-xs font-semibold text-ink">À garder</span>
                        : !can ? <span className="shrink-0 text-xs text-muted">a un CV : gardée</span> : null}
                      {link && (
                        <a href={link} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm shrink-0" aria-label={`Ouvrir l'annonce : ${it.title}, ${it.company || "entreprise ?"}`} title="Ouvrir l'annonce">
                          <ExternalLink size={16} aria-hidden /> <span className="hidden sm:inline">Annonce</span>
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          {v.hidden > 0 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMore(true)}>Voir les {v.hidden} autres groupes</button>}
        </div>
      )}

      <dialog
        ref={dlg} aria-label="Supprimer les doublons cochés"
        onCancel={(e) => { e.preventDefault(); closeDialog(); }}
        onClick={(e) => { if (e.target === dlg.current) closeDialog(); }}
        className="m-auto w-[min(92vw,30rem)] rounded-2xl border border-line bg-surface p-0 shadow-lift"
      >
        {confirm && (
          <div className="p-5">
            <h2 className="heading text-lg">Supprimer {chosen.length} ligne{chosen.length > 1 ? "s" : ""} en double ?</h2>
            <p className="mt-2 text-sm text-muted">
              Les lignes cochées sont supprimées d'Offres & CV (et, pour une offre analysée, son analyse et la ligne de Suivi qui l'accompagne). La ligne « À garder » de chaque groupe reste.
              Cette action est définitive. Une candidature déjà envoyée n'est jamais supprimée ici.
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
              {busy && <><Loader2 size={16} className="animate-spin text-muted" aria-label="Suppression en cours" /><span className="text-sm text-muted">{step} / {chosen.length}</span></>}
              <button type="button" className="btn btn-ghost" onClick={closeDialog} disabled={busy}>Annuler</button>
              <button type="button" className="btn border-bad bg-bad text-on-solid" onClick={removeChosen} disabled={busy || !chosen.length}>Supprimer</button>
            </div>
          </div>
        )}
      </dialog>
    </div>
  );
}
