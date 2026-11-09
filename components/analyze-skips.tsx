"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardPaste, ExternalLink, Loader2 } from "lucide-react";
import { useFeedback } from "@/components/ui/feedback";
import { refreshBadges } from "@/components/nav";
import { OfferRowDelete } from "@/components/offer-row-delete";
import { GONE_REASON, bulkMessage, firstOf, groupBySite, groupSkips, isOfferSkip, linkOf, pasteHref, selectedSkips, siteAdvice, type Skip } from "@/lib/analyze-skips";
import { syncSkips, type LineState } from "@/lib/skip-sync";

type Check = { on: boolean; set: (on: boolean) => void };

/** Une ligne du bilan : le poste, un lien pour ouvrir l'annonce et vérifier, la corbeille. */
function Row({ s, onRemoved, check, paste }: { s: Skip; onRemoved: (ids: string[]) => void; check?: Check; paste?: "paste" | "view" }) {
  const link = linkOf(s.url);
  return (
    <li className="flex items-center gap-2 py-1">
      {check && (
        <input
          type="checkbox" className="h-4 w-4 shrink-0 accent-[var(--color-marigold)]" checked={check.on} onChange={(e) => check.set(e.target.checked)}
          aria-label={`Inclure dans la suppression : ${s.title}`}
        />
      )}
      <span className="min-w-0 flex-1 break-words text-ink">
        {s.title}
        {s.why && <span className="block text-xs text-muted">Preuve : {s.why}</span>}
        {isOfferSkip(s) && <span className="block text-xs text-muted">Offre déjà analysée{s.cv ? ` : ${s.cv} CV supprimé${s.cv > 1 ? "s" : ""} avec elle` : ""}</span>}
      </span>
      {link ? (
        <a href={link} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm shrink-0" aria-label={`Ouvrir l'annonce : ${s.title}`} title="Ouvrir l'annonce">
          <ExternalLink size={16} aria-hidden /> <span className="hidden sm:inline">Annonce</span>
        </a>
      ) : <span className="shrink-0 text-xs text-muted">pas de lien</span>}
      {paste && !isOfferSkip(s) && (
        <a href={pasteHref(s.appId, s.url)} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm shrink-0"
          aria-label={`${paste === "view" ? "Voir le texte collé" : "Coller le texte de l'annonce"} : ${s.title}`} title={paste === "view" ? "Voir le texte collé" : "Coller le texte de l'annonce"}>
          <ClipboardPaste size={16} aria-hidden /> <span className="hidden sm:inline">{paste === "view" ? "Voir le texte" : "Coller le texte"}</span>
        </a>
      )}
      <OfferRowDelete kind={isOfferSkip(s) ? "offer" : "app"} id={s.appId} label={s.title} fixedReason={s.kind === "gone" ? GONE_REASON : undefined} onDeleted={() => onRemoved([s.appId])} />
    </li>
  );
}

/**
 * Bilan des lignes que « Tout analyser » n'a pas pu analyser, rangées par cause. Toutes sont listées (jamais « et 11 autres ») avec un lien vers
 * l'annonce pour vérifier. Les annonces plus disponibles sont cochées d'office : on ouvre les liens, on décoche celles qu'on veut garder,
 * puis « Supprimer » les retire d'un coup d'Offres & CV et de Suivi (jamais une ligne envoyée : le serveur refuse). La raison notée est
 * « Offre plus disponible », neutre pour le tri.
 * Le bilan est un instantané, mais « Coller le texte » s'ouvre dans un autre onglet : à l'affichage, puis à chaque retour sur cet onglet, il demande
 * l'état actuel des lignes (lib/skip-sync.ts). Une ligne analysée depuis, supprimée ou passée dans Suivi en sort ; une ligne qui porte maintenant un
 * texte collé quitte « illisibles » et « disparues » pour « Texte déjà collé, prêtes à analyser » (jamais cochée pour suppression).
 * `onAnalyze` : lance l'analyse de ces lignes-là (même file, mêmes arrêts que « Tout analyser »).
 */
export function SkipReport({ skips, onRemoved, onAnalyze }: { skips: Skip[]; onRemoved: (ids: string[]) => void; onAnalyze?: (ids: string[]) => void }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [kept, setKept] = useState<Set<string>>(new Set()); // lignes qui portent un texte collé
  const live = useRef({ skips, onRemoved });
  live.current = { skips, onRemoved };
  const shown = skips.map((s): Skip => (kept.has(s.appId) ? { ...s, kind: "kept" } : s));
  const g = groupSkips(shown);
  const [keep, setKeep] = useState<Set<string>>(new Set()); // décochées : à garder
  const [more, setMore] = useState<{ failed: boolean; sites: Record<string, boolean> }>({ failed: false, sites: {} });
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const dlg = useRef<HTMLDialogElement>(null);
  const chosen = selectedSkips(g.gone, keep);

  useEffect(() => {
    const el = dlg.current;
    if (open && el && !el.open) el.showModal();
  }, [open]);

  // Mise à jour d'après l'état réel des lignes : à l'affichage, puis au retour sur l'onglet (jamais plus d'une fois toutes les 1,5 s)
  useEffect(() => {
    let off = false;
    let running = false;
    let last = 0;
    async function sync() {
      if (running || off || Date.now() - last < 1500 || !live.current.skips.length) return;
      running = true;
      try {
        const r = await syncSkips(live.current.skips, async (ids, target) => {
          const res = await fetch("/api/offers/lines", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(target === "offer" ? { offer_ids: ids } : { app_ids: ids }) }).catch(() => null);
          if (!res?.ok) return null; // lecture ratée : on ne retire rien
          const j = (await res.json().catch(() => null)) as { lines?: LineState[] } | null;
          return Array.isArray(j?.lines) ? j.lines : null;
        });
        if (off) return;
        setKept(new Set(r.kept));
        if (r.drop.length) { live.current.onRemoved(r.drop); refreshBadges(); router.refresh(); }
      } finally {
        running = false;
        last = Date.now();
      }
    }
    void sync();
    const back = () => { if (document.visibilityState === "visible") void sync(); };
    document.addEventListener("visibilitychange", back);
    window.addEventListener("focus", back);
    return () => { off = true; document.removeEventListener("visibilitychange", back); window.removeEventListener("focus", back); };
  }, [router]);

  function close() {
    if (busy) return;
    dlg.current?.close();
    setOpen(false);
  }

  async function removeChosen() {
    const list = chosen;
    if (!list.length) return;
    setBusy(true);
    const deleted: string[] = [];
    let failed = 0;
    for (let i = 0; i < list.length; i++) {
      setStep(i + 1);
      const res = await fetch(isOfferSkip(list[i]) ? `/api/offers/${list[i].appId}` : `/api/applications/${list[i].appId}`, {
        method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: GONE_REASON }),
      }).catch(() => null);
      if (res?.ok) deleted.push(list[i].appId);
      else {
        failed++;
        if (res?.status === 401) { failed += list.length - i - 1; break; } // session expirée : inutile d'insister
      }
    }
    setBusy(false);
    dlg.current?.close();
    setOpen(false);
    if (deleted.length) { onRemoved(deleted); refreshBadges(); router.refresh(); }
    toast(bulkMessage(deleted.length, failed), { tone: failed ? "err" : "info" });
  }

  const sites = groupBySite(g.unreadable);
  const fa = firstOf(g.failed, more.failed);
  const toggle = (id: string, on: boolean) => setKeep((k) => { const n = new Set(k); if (on) n.delete(id); else n.add(id); return n; });

  return (
    <div className="mt-3 space-y-4">
      {g.kept.length > 0 && (
        <section aria-label="Texte déjà collé, prêtes à analyser">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="min-w-0 flex-1 basis-60 font-semibold text-ink">Texte déjà collé : prêtes à analyser ({g.kept.length})</h3>
            {onAnalyze && (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => onAnalyze(g.kept.map((s) => s.appId))}>
                Analyser {g.kept.length > 1 ? `ces ${g.kept.length} lignes` : "cette ligne"}
              </button>
            )}
          </div>
          <p className="text-muted">Le texte de ces annonces est déjà sur la ligne : elles ne sont plus illisibles. L'analyse le lit sans rouvrir le site (2 actions IA chacune).</p>
          <ul className="mt-1 divide-y divide-line">{g.kept.map((s) => <Row key={s.appId} s={s} onRemoved={onRemoved} paste="view" />)}</ul>
        </section>
      )}
      {g.gone.length > 0 && (
        <section aria-label="Annonces plus disponibles">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="min-w-0 flex-1 basis-60 font-semibold text-ink">Annonces plus disponibles ({g.gone.length})</h3>
            <button type="button" className="btn btn-sm border-bad bg-bad text-on-solid" disabled={!chosen.length} onClick={() => setOpen(true)}>
              {chosen.length ? `Supprimer les ${chosen.length} cochée${chosen.length > 1 ? "s" : ""}` : "Aucune cochée"}
            </button>
          </div>
          <p className="text-muted">Ouvre chaque lien pour vérifier que l'annonce a bien disparu. Décoche celles que tu veux garder, puis supprime les autres d'un coup.</p>
          <ul className="mt-1 divide-y divide-line">
            {g.gone.map((s) => <Row key={s.appId} s={s} onRemoved={onRemoved} check={{ on: !keep.has(s.appId), set: (on) => toggle(s.appId, on) }} />)}
          </ul>
        </section>
      )}
      {sites.map(({ site, items }) => {
        const v = firstOf(items, Boolean(more.sites[site]));
        return (
          <section key={site} aria-label={`Annonces illisibles : ${site}`}>
            <h3 className="font-semibold text-ink">Annonces illisibles : {site} ({items.length})</h3>
            <p className="text-muted">{siteAdvice(site)}</p>
            <ul className="mt-1 divide-y divide-line">{v.shown.map((s) => <Row key={s.appId} s={s} onRemoved={onRemoved} paste="paste" />)}</ul>
            {v.hidden > 0 && <button type="button" className="btn btn-ghost btn-sm mt-1" onClick={() => setMore((m) => ({ ...m, sites: { ...m.sites, [site]: true } }))}>Voir les {v.hidden} autres</button>}
          </section>
        );
      })}
      {g.failed.length > 0 && (
        <section aria-label="Analyses à relancer">
          <h3 className="font-semibold text-ink">À relancer ({g.failed.length})</h3>
          <p className="text-muted">Un incident passager : clique de nouveau sur « Tout analyser ».</p>
          <ul className="mt-1 divide-y divide-line">{fa.shown.map((s) => <Row key={s.appId} s={s} onRemoved={onRemoved} />)}</ul>
          {fa.hidden > 0 && <button type="button" className="btn btn-ghost btn-sm mt-1" onClick={() => setMore((m) => ({ ...m, failed: true }))}>Voir les {fa.hidden} autres</button>}
        </section>
      )}

      <dialog
        ref={dlg}
        aria-label="Supprimer les annonces plus disponibles"
        onCancel={(e) => { e.preventDefault(); close(); }}
        onClick={(e) => { if (e.target === dlg.current) close(); }}
        className="m-auto w-[min(92vw,30rem)] rounded-2xl border border-line bg-surface p-0 shadow-lift"
      >
        {open && (
          <div className="p-5">
            <h2 className="heading text-lg">Supprimer {chosen.length} ligne{chosen.length > 1 ? "s" : ""} ?</h2>
            <p className="mt-2 text-sm text-muted">
              Ces lignes seront supprimées d'Offres & CV et de Suivi, avec la raison « Offre plus disponible ». Cette action est définitive.
              Une candidature déjà envoyée n'est jamais supprimée ici.
            </p>
            {chosen.some(isOfferSkip) && (
              <p className="mt-2 text-sm text-muted">
                {chosen.filter(isOfferSkip).length} {chosen.filter(isOfferSkip).length > 1 ? "offres déjà analysées" : "offre déjà analysée"} : l'analyse
                {chosen.some((s) => (s.cv ?? 0) > 0) ? ` et les ${chosen.reduce((n, s) => n + (isOfferSkip(s) ? s.cv ?? 0 : 0), 0)} CV générés` : " et les documents"} partent avec {chosen.filter(isOfferSkip).length > 1 ? "elles" : "elle"}.
              </p>
            )}
            <p className="mt-2 text-sm text-muted">As-tu ouvert les liens pour vérifier ? Annule et décoche celles que tu veux garder.</p>
            <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
              {busy && <><Loader2 size={16} className="animate-spin text-muted" aria-label="Suppression en cours" /><span className="text-sm text-muted">{step} / {chosen.length}</span></>}
              <button type="button" className="btn btn-ghost" onClick={close} disabled={busy}>Annuler</button>
              <button type="button" className="btn border-bad bg-bad text-on-solid" onClick={removeChosen} disabled={busy || !chosen.length}>Supprimer</button>
            </div>
          </div>
        )}
      </dialog>
    </div>
  );
}
