"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export type AdminTab = {
  id: string;
  label: string;
  /** Petite mention dans l'onglet (« 2 à faire »), lue par les lecteurs d'écran avec le nom. */
  note?: string;
  /** La mention demande un geste (« 2 à faire ») : fond d'alerte plutôt que neutre. */
  warn?: boolean;
  /** Le contenu est déjà fabriqué par le serveur ; ici on ne fait que montrer un panneau à la fois. */
  panel: React.ReactNode;
};

/**
 * Onglets de la page Administration (WAI-ARIA « tabs » avec activation automatique) : flèches gauche / droite, Début / Fin, un seul onglet dans l'ordre
 * de tabulation. L'onglet ouvert s'écrit dans l'adresse (#installation, #cles, #sources, #comptes) : un rechargement, un lien (/admin#installation) ou
 * le retour du navigateur le retrouvent. Tous les panneaux sont rendus par le serveur et seulement masqués (`hidden`) : rien n'est rechargé en changeant d'onglet.
 */
export function AdminTabs({ tabs, initial }: { tabs: AdminTab[]; initial?: string }) {
  const ids = tabs.map((t) => t.id);
  const first = initial && ids.includes(initial) ? initial : ids[0];
  const [active, setActive] = useState(first);
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const fromHash = useCallback(() => {
    const h = decodeURIComponent(window.location.hash.replace(/^#/, ""));
    if (ids.includes(h)) setActive(h);
  }, [ids.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, [fromHash]);

  const open = (id: string, focus = false) => {
    setActive(id);
    try { window.history.replaceState(null, "", `#${id}`); } catch { /* adresse non modifiable : l'onglet s'ouvre quand même */ }
    if (focus) refs.current[id]?.focus();
  };

  const onKey = (e: React.KeyboardEvent, i: number) => {
    const last = tabs.length - 1;
    const to = e.key === "ArrowRight" ? (i === last ? 0 : i + 1) : e.key === "ArrowLeft" ? (i === 0 ? last : i - 1) : e.key === "Home" ? 0 : e.key === "End" ? last : -1;
    if (to < 0) return;
    e.preventDefault();
    open(tabs[to].id, true);
  };

  return (
    <div>
      <div role="tablist" aria-label="Sections de l'administration" className="admin-tabs mb-5 flex gap-1 overflow-x-auto border-b border-line">
        {tabs.map((t, i) => {
          const on = t.id === active;
          return (
            <button
              key={t.id} ref={(el) => { refs.current[t.id] = el; }} type="button" role="tab"
              id={`admin-tab-${t.id}`} aria-selected={on} aria-controls={`admin-panel-${t.id}`} tabIndex={on ? 0 : -1}
              onClick={() => open(t.id)} onKeyDown={(e) => onKey(e, i)}
              className={`-mb-px shrink-0 whitespace-nowrap rounded-t-lg border-b-2 px-3.5 py-2 text-sm font-semibold transition-colors ${on ? "border-marigold text-ink" : "border-transparent text-muted hover:text-ink"}`}
            >
              {t.label}
              {t.note && <span className={`tag ml-2 align-middle ${t.warn ? "tag-warn" : ""}`}>{t.note}</span>}
            </button>
          );
        })}
      </div>
      {tabs.map((t) => (
        <div key={t.id} role="tabpanel" id={`admin-panel-${t.id}`} aria-labelledby={`admin-tab-${t.id}`} hidden={t.id !== active} tabIndex={0} className="outline-offset-4">
          {t.panel}
        </div>
      ))}
    </div>
  );
}
