"use client";
import { useEffect, useMemo, useState } from "react";
import { Copy, ExternalLink } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useFeedback } from "@/components/ui/feedback";
import { refreshBadges } from "@/components/nav";
import { linkOf, firstOf } from "@/lib/analyze-skips";
import { appDupSummary, extras, findAppDuplicates, isBare, preChecked, traces, type AppDupGroup, type DupLine } from "@/lib/app-dups";
import { statusLabel, type Application } from "@/lib/types";
import { fmtDate, plural } from "@/lib/format";

/**
 * « Doublons » de Suivi : repère les candidatures enregistrées deux fois (voir lib/app-dups.ts). Calcul local, sans IA ; une seule lecture, celle des
 * documents (CV, lettres) rattachés aux lignes concernées, pour garder la ligne qui en a. Dans chaque groupe on garde la ligne la plus avancée ; les
 * autres sont cochées d'office SEULEMENT si elles ne portent aucun travail (note, contact, salaire, entretien, e-mail, document). Suppression avec
 * confirmation, jamais automatique. Les documents ne sont pas supprimés : ils restent, détachés de la ligne.
 */
export function SuiviDups({ apps, onOpen, onChanged }: { apps: Application[]; onOpen: (a: Application) => void; onChanged: () => void | Promise<void> }) {
  const sb = useMemo(() => supabaseBrowser(), []);
  const { toast, confirm } = useFeedback();
  const [open, setOpen] = useState(false);
  const [more, setMore] = useState(false);
  const [docs, setDocs] = useState<Record<string, number> | null>(null); // null : pas encore lus (ou lecture ratée) : rien n'est coché d'office
  const [over, setOver] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);

  // Premier passage sans documents : sert seulement à savoir QUELLES lignes interroger
  const candidates = useMemo(() => findAppDuplicates(apps), [apps]);
  const ids = useMemo(() => candidates.flatMap((g) => g.items.map((l) => l.id)).sort(), [candidates]);
  const idsKey = ids.join(",");

  useEffect(() => {
    let live = true;
    if (!ids.length) { setDocs({}); return; }
    setDocs(null);
    (async () => {
      const counts: Record<string, number> = {};
      for (let i = 0; i < ids.length; i += 100) {
        const { data, error } = await sb.from("documents").select("application_id").in("application_id", ids.slice(i, i + 100));
        if (error) return; // lecture ratée : les documents restent inconnus, rien n'est coché d'office
        for (const d of (data ?? []) as { application_id: string | null }[]) if (d.application_id) counts[d.application_id] = (counts[d.application_id] ?? 0) + 1;
      }
      if (live) setDocs(counts);
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, sb]);

  const groups = useMemo(() => (docs ? findAppDuplicates(apps, docs) : candidates), [apps, docs, candidates]);
  const byId = useMemo(() => new Map(apps.map((a) => [a.id, a])), [apps]);
  const nDocs = (l: DupLine) => docs?.[l.id] ?? 0;
  const isOn = (g: AppDupGroup, l: DupLine) => over[l.id] ?? (docs != null && preChecked(g, docs).some((x) => x.id === l.id));
  const chosen = useMemo(() => {
    const seen = new Set<string>();
    const out: DupLine[] = [];
    for (const g of groups) for (const l of extras(g)) if (isOn(g, l) && !seen.has(l.id)) { seen.add(l.id); out.push(l); }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, over, docs]);

  if (!groups.length) return null;

  async function removeChosen() {
    const list = chosen;
    if (!list.length) return;
    const loaded = list.filter((l) => !isBare(l, nDocs(l)));
    const ok = await confirm({
      title: `Supprimer ${plural(list.length, "ligne", "lignes")} en double ?`,
      body: `La ligne gardée de chaque groupe reste dans Suivi. Les documents (CV, lettres) ne sont pas supprimés, mais ne sont plus rattachés à la ligne supprimée.${
        loaded.length ? ` Attention : ${plural(loaded.length, "ligne cochée porte", "lignes cochées portent")} du travail (note, contact, entretien…) qui sera perdu.` : ""
      } Cette suppression est définitive.`,
      confirmLabel: "Supprimer",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    const { error } = await sb.from("applications").delete().in("id", list.map((l) => l.id));
    setBusy(false);
    if (error) return toast("La suppression n'a pas été enregistrée : réessaie dans un moment.", { tone: "err" });
    setOver({});
    refreshBadges();
    await onChanged();
    toast(`${plural(list.length, "ligne supprimée", "lignes supprimées")}.`);
  }

  const v = firstOf(groups, more, 8);
  return (
    <div className="mb-5 rounded-2xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <Copy size={16} aria-hidden /> {open ? "Masquer les doublons" : `Voir les doublons (${groups.length})`}
        </button>
        <p className="min-w-0 flex-1 basis-60 text-sm text-muted">{appDupSummary(groups)} Sans IA : rien n'est supprimé sans toi.</p>
      </div>
      {open && (
        <div className="mt-3 space-y-4 border-t border-line pt-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <p className="min-w-0 flex-1 basis-60 text-muted">
              Dans chaque groupe, je garde la ligne la plus avancée, puis celle qui porte le plus de travail. Je ne coche que les lignes vides ; une ligne qui porte une note, un contact
              ou un entretien reste décochée : ouvre-la pour comparer.
            </p>
            <button type="button" className="btn btn-sm border-bad bg-bad text-on-solid" disabled={!chosen.length || busy} onClick={removeChosen}>
              {chosen.length ? `Supprimer les ${chosen.length} cochée${chosen.length > 1 ? "s" : ""}` : "Aucune cochée"}
            </button>
          </div>
          {v.shown.map((g) => (
            <section key={g.id} aria-label={`Doublons : ${g.items[0].title}`}>
              <h3 className="font-semibold text-ink">{g.items[0].title} <span className="font-normal text-muted">· {g.items[0].company}</span></h3>
              <p className="text-muted">{g.reason === "offer" ? "Même offre analysée." : "Même intitulé, même entreprise."}</p>
              <ul className="mt-1 divide-y divide-line">
                {g.items.map((l) => {
                  const a = byId.get(l.id);
                  const link = linkOf(a?.url);
                  const keep = l.id === g.keepId;
                  const t = traces(l, nDocs(l));
                  const label = `${l.title}, ${l.company}, ${statusLabel(l.status).toLowerCase()}`;
                  return (
                    <li key={l.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-1.5">
                      {keep ? <span className="w-4 shrink-0" aria-hidden /> : (
                        <input
                          type="checkbox" className="h-4 w-4 shrink-0 accent-[var(--color-marigold)]" checked={isOn(g, l)}
                          onChange={(e) => setOver((o) => ({ ...o, [l.id]: e.target.checked }))} aria-label={`Supprimer ce doublon : ${label}`}
                        />
                      )}
                      <button type="button" className="min-w-0 flex-1 basis-56 break-words text-left text-ink hover:underline" onClick={() => a && onOpen(a)}>
                        {statusLabel(l.status)}
                        <span className="text-muted">
                          {l.score != null ? ` · ${l.score} %` : ""}{l.applied_at ? ` · postulée le ${fmtDate(l.applied_at)}` : ` · ajoutée le ${fmtDate(l.created_at)}`}{l.location ? ` · ${l.location}` : ""}
                        </span>
                      </button>
                      {keep && <span className="shrink-0 rounded-full bg-paper px-2 py-0.5 text-xs font-semibold text-ink">À garder</span>}
                      {t.length > 0 && <span className="shrink-0 text-xs text-muted">porte {t.join(", ")}</span>}
                      {link && (
                        <a href={link} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm shrink-0" aria-label={`Ouvrir l'annonce (s'ouvre dans un nouvel onglet) : ${label}`} title="Ouvrir l'annonce">
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
          {docs == null && <p className="text-xs text-muted">Je vérifie les documents rattachés avant de cocher quoi que ce soit…</p>}
        </div>
      )}
    </div>
  );
}
