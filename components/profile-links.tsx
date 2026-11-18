"use client";
import { ExternalLink, Plus, Trash2 } from "lucide-react";
import { duplicateIndexes, linkHref, linkNote, normalizeLinkUrl } from "@/lib/link-url";

type L = { label: string; url: string };

/**
 * Liens du profil (LinkedIn, GitHub, portfolio, démonstrations) : une ligne par lien, « Ouvrir » dans un nouvel onglet quand l'adresse est bonne,
 * « Ajouter un lien » pour en créer un. Ils s'affichent sous le nom sur les CV (quatre au plus, choisis selon l'offre).
 * Une adresse incomplète (« Streamlit ») est signalée sur sa ligne : elle ne sert à rien tant qu'elle l'est, et n'est pas écrite sur un CV.
 */
export function ProfileLinks({ links, onChange }: { links: L[]; onChange: (next: L[]) => void }) {
  const set = (i: number, patch: Partial<L>) => onChange(links.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const dups = duplicateIndexes(links);
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <span className="label" id="profile-links-title">Liens</span>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => onChange([...links, { label: "", url: "" }])}><Plus size={15} /> Ajouter un lien</button>
      </div>
      <p className="mt-0.5 text-xs text-muted">Ils apparaissent sous ton nom sur tes CV, cliquables. Quatre au plus par CV, choisis selon l'offre.</p>

      {dups.size > 0 && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-marigold/50 bg-marigold/10 p-3 text-sm" role="status">
          <span>{dups.size === 1 ? "1 lien est en double" : `${dups.size} liens sont en double`} (même adresse, ou un libellé déjà présent avec sa vraie adresse).</span>
          <button type="button" className="btn btn-sm btn-primary" onClick={() => onChange(links.filter((_, i) => !dups.has(i)))}>{dups.size === 1 ? "Retirer le doublon" : `Retirer les ${dups.size} doublons`}</button>
        </div>
      )}
      {links.length === 0 && <p className="mt-2 text-sm text-muted">Aucun lien. Ajoute ton LinkedIn, ton GitHub ou ton portfolio.</p>}
      <ul className="mt-2 space-y-2" aria-labelledby="profile-links-title">
        {links.map((l, i) => {
          const href = linkHref(l.url);
          const note = linkNote(l);
          return (
            <li key={i} className={`card p-3 ${dups.has(i) ? "border-marigold/60" : ""}`}>
              <div className="grid gap-2 sm:grid-cols-[1fr_2fr_auto] sm:items-center">
                <input className="field" aria-label={`Libellé du lien ${i + 1}`} placeholder="Libellé (ex. GitHub)" value={l.label} onChange={(e) => set(i, { label: e.target.value })} />
                <input
                  className="field font-mono text-sm" aria-label={`Adresse du lien ${i + 1}`} placeholder="https://…"
                  inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false}
                  value={l.url} aria-invalid={!!note && !!l.url.trim()} aria-describedby={note ? `profile-link-note-${i}` : undefined}
                  onChange={(e) => set(i, { url: e.target.value })}
                  onBlur={() => { const n = normalizeLinkUrl(l.url); if (n !== l.url) set(i, { url: n }); }} />
                <div className="flex items-center justify-end gap-1">
                  {href
                    ? <a className="btn btn-sm btn-ghost" href={href} target="_blank" rel="noopener noreferrer" aria-label={`Ouvrir ${l.label.trim() || href}, s'ouvre dans un nouvel onglet`}><ExternalLink size={15} /> Ouvrir</a>
                    : <button type="button" className="btn btn-sm btn-ghost" disabled aria-label="Ouvrir : l'adresse n'est pas complète"><ExternalLink size={15} /> Ouvrir</button>}
                  <button type="button" className="btn btn-ghost btn-icon text-bad" aria-label={`Supprimer le lien ${l.label.trim() || i + 1}`} onClick={() => onChange(links.filter((_, j) => j !== i))}><Trash2 size={16} /></button>
                </div>
              </div>
              {dups.has(i) && <p className="mt-1.5 text-xs text-muted">Doublon : le même lien figure déjà plus haut.</p>}
              {note && <p id={`profile-link-note-${i}`} className="mt-1.5 text-xs text-bad">{note}</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
