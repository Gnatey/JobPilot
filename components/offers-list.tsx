"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink, Search, X } from "lucide-react";
import { ScorePill } from "@/components/ui/score";
import { Empty } from "@/components/ui/page-title";
import { OfferRowDelete } from "@/components/offer-row-delete";
import { PAGE_SIZE, TOOLS_FROM, filterCounts, nextBatch, selectItems, visibleFilters, type FilterId, type ListItem } from "@/lib/offers-filter";

/** Sélection des lignes « À analyser » (cases à cocher). Sans elle, la liste est en lecture seule comme avant. */
export type Selection = { ids: ReadonlySet<string>; toggle: (id: string) => void; setMany: (ids: string[], on: boolean) => void };

/** Liste d'Offres & CV : recherche, filtres (avec CV / sans CV / à analyser) et affichage par paquets de 30. */
export function OffersList({ items, selection }: { items: ListItem[]; selection?: Selection }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<FilterId>("all");
  const [shown, setShown] = useState(PAGE_SIZE);
  const counts = useMemo(() => filterCounts(items), [items]);
  const rows = useMemo(() => selectItems(items, q, filter), [items, q, filter]);
  const filters = visibleFilters(counts, filter);
  const tools = items.length >= TOOLS_FROM;
  const active = q.trim() !== "" || filter !== "all";
  const batch = nextBatch(rows.length, shown);
  const visible = rows.slice(0, shown);
  // Lignes « À analyser » de la recherche en cours (toutes, pas seulement les 30 affichées) : « Cocher les N » les prend toutes
  const pickable = selection ? rows.filter((r) => r.kind === "app").map((r) => r.key) : [];
  const unchecked = selection ? pickable.filter((id) => !selection.ids.has(id)).length : 0;

  // Une nouvelle recherche ou un autre filtre repart des 30 premières lignes
  const search = (v: string) => { setQ(v); setShown(PAGE_SIZE); };
  const pick = (f: FilterId) => { setFilter(f); setShown(PAGE_SIZE); };
  const reset = () => { setQ(""); setFilter("all"); setShown(PAGE_SIZE); };

  return (
    <>
      {tools && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <label className="relative min-w-52 flex-1">
            <Search size={16} aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
            <input type="search" className="field !pl-10" placeholder="Rechercher un poste, une entreprise, une ville…" value={q} onChange={(e) => search(e.target.value)} aria-label="Rechercher dans Offres & CV" />
          </label>
          {filters.length > 0 && (
            <div className="flex w-full flex-wrap rounded-3xl border border-line bg-surface p-0.5 sm:w-auto" role="group" aria-label="Filtrer les offres">
              {filters.map((f) => (
                <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => pick(f.id)}
                  className={`rounded-full px-2.5 py-1.5 text-sm sm:px-3.5 ${filter === f.id ? "bg-ink font-semibold text-paper" : "text-muted"}`}>
                  {f.label}<span className={`ml-1.5 tabular-nums ${filter === f.id ? "" : "text-muted"}`}>{counts[f.id]}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {(tools || pickable.length > 0) && (
        <p className="mb-3 text-sm text-muted" role="status" aria-live="polite">
          {tools && (active
            ? <>{rows.length} {rows.length > 1 ? "offres correspondent" : "offre correspond"} sur {items.length}. <button type="button" className="link hit font-semibold" onClick={reset}>Tout afficher</button></>
            : <>{items.length} offres à traiter.</>)}
          {selection && pickable.length > 0 && (
            <>
              {tools ? " " : ""}
              {unchecked > 0 && <button type="button" className="link hit font-semibold" onClick={() => selection.setMany(pickable, true)}>Cocher les {unchecked === pickable.length ? pickable.length : `${unchecked} restantes`} à analyser</button>}
              {unchecked < pickable.length && <>{unchecked > 0 ? " · " : ""}<button type="button" className="link hit font-semibold" onClick={() => selection.setMany(pickable, false)}>Tout décocher</button></>}
            </>
          )}
        </p>
      )}

      {rows.length === 0 ? (
        <Empty action={<button type="button" className="btn" onClick={reset}><X size={16} aria-hidden /> Effacer la recherche et le filtre</button>}>
          Aucune offre ne correspond{q.trim() ? ` à « ${q.trim()} »` : ""}. Essaie un autre mot, ou change de filtre.
        </Empty>
      ) : (
        <ul className="list">
          {visible.map((it) => (
            <li key={it.key} className="flex items-center hover:bg-paper/60">
              {selection && it.kind === "app" && (
                <label className="flex shrink-0 cursor-pointer items-center self-stretch pl-4 pr-2">
                  <input
                    type="checkbox" className="h-4 w-4 accent-[var(--color-marigold)]" checked={selection.ids.has(it.key)} onChange={() => selection.toggle(it.key)}
                    aria-label={`Cocher pour analyser : ${it.title}`}
                  />
                </label>
              )}
              <Link href={it.href} className={`flex min-w-0 flex-1 items-center gap-3 py-3 ${selection && it.kind === "app" ? "pl-2 pr-4" : "px-4"}`}>
                {!(selection && it.kind === "app") && <ScorePill value={it.score} rough={it.rough} />}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{it.title}</p>
                  <p className="truncate text-sm text-muted">{it.sub}</p>
                  {it.hasText && <p className="truncate text-xs font-semibold text-good">Texte collé, prête à analyser</p>}
                </div>
                <div className="hidden shrink-0 text-right text-sm sm:block">
                  <p>{it.state ?? <span className="text-muted">À décider</span>}</p>
                  <p className="text-muted">{it.meta}</p>
                </div>
              </Link>
              {it.ad && (
                <a href={it.ad} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm shrink-0" aria-label={`Ouvrir l'annonce : ${it.title}`} title="Ouvrir l'annonce">
                  <ExternalLink size={16} aria-hidden /> <span className="hidden sm:inline">Annonce</span>
                </a>
              )}
              <OfferRowDelete kind={it.kind} id={it.key} label={it.title} />
            </li>
          ))}
        </ul>
      )}

      {batch > 0 && (
        <div className="mt-4 flex flex-col items-center gap-1.5">
          <button type="button" className="btn" onClick={() => setShown((n) => n + PAGE_SIZE)}>Voir les {batch} autres</button>
          <p className="text-sm text-muted">{visible.length} affichées sur {rows.length}</p>
        </div>
      )}
    </>
  );
}
