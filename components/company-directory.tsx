"use client";
import { useId, useMemo, useState } from "react";
import { ExternalLink, Search } from "lucide-react";
import { DIRECTORY } from "@/lib/directory-data";
import { groupByType, hostOf, matchProfile, searchDirectory, type Entry } from "@/lib/directory";

/** Employeurs montrés d'abord dans chaque type ; « Voir les N autres » déplie le reste. */
const PER_TYPE = 4;
/** Résultats de recherche affichés au plus (la saisie peut être très large : « a »). */
const SEARCH_CAP = 40;

/**
 * Annuaire d'entreprises : des liens vers les pages recrutement d'employeurs de ton domaine, rangés par type. Aucune IA, aucun appel réseau, rien n'est lu
 * sur ces sites : on les ouvre soi-même dans un autre onglet. Les entreprises viennent d'un fichier du dépôt (lib/directory-data.ts) ; la page ne montre
 * que celles qui correspondent au profil (postes de la recherche, secteurs du profil), le reste se trouve par mot-clé.
 */
export function CompanyDirectory({ roles, sectors }: { roles: string[]; sectors: string[] }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const inputId = useId();
  const searching = query.trim().length >= 2;

  const rolesKey = roles.join("|");
  const sectorsKey = sectors.join("|");
  const matched = useMemo(() => matchProfile(DIRECTORY, { roles: rolesKey ? rolesKey.split("|") : [], sectors: sectorsKey ? sectorsKey.split("|") : [] }), [rolesKey, sectorsKey]);
  const found = useMemo(() => (searching ? searchDirectory(DIRECTORY, query) : []), [searching, query]);
  const shown: Entry[] = searching ? found.slice(0, SEARCH_CAP) : matched.map((m) => m.entry);
  const groups = groupByType(shown, (e) => e.type);

  return (
    <section className="mb-10" aria-labelledby="company-directory">
      <h2 id="company-directory" className="heading text-xl">Entreprises de ton domaine</h2>
      <p className="mb-3 mt-1 max-w-[65ch] text-sm text-muted">
        Un annuaire, pas des offres : chaque lien ouvre la page recrutement de l'employeur (ou un site d'emploi) dans un nouvel onglet, et tu y cherches toi-même.
        JobPilot ne lit rien sur ces sites. La liste suit tes postes et tes secteurs ; pour une entreprise ou un domaine précis, cherche par mot-clé.
      </p>

      <label htmlFor={inputId} className="label">Chercher une entreprise ou un domaine</label>
      <div className="relative mb-4 max-w-md">
        <Search size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          id={inputId} type="search" className="field !pl-9" value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="banque, santé, Capgemini…" autoComplete="off" spellCheck={false}
        />
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {searching ? (found.length ? `${found.length} résultat${found.length > 1 ? "s" : ""}` : "Aucun résultat") : ""}
      </p>

      {!searching && !matched.length && (
        <p className="max-w-[65ch] rounded-xl border border-dashed border-line p-4 text-sm text-muted">
          Choisis au moins un poste dans ta recherche (ou des secteurs dans ton profil) et l'annuaire te proposera les employeurs de ton domaine. Tu peux aussi chercher par mot-clé ci-dessus.
        </p>
      )}
      {searching && !found.length && (
        <p className="max-w-[65ch] rounded-xl border border-dashed border-line p-4 text-sm text-muted">
          Aucune entreprise ne correspond à « {query.trim()} ». Essaie un nom plus court, un secteur (« assurance », « énergie ») ou un métier (« data »).
        </p>
      )}
      {searching && found.length > SEARCH_CAP && (
        <p className="mb-3 text-sm text-muted">{found.length} résultats : les {SEARCH_CAP} premiers sont affichés, ajoute un mot pour affiner.</p>
      )}

      <div className="space-y-6">
        {groups.map((g) => {
          const key = g.type;
          const expanded = searching || !!open[key];
          const list = expanded ? g.items : g.items.slice(0, PER_TYPE);
          const hidden = g.items.length - list.length;
          return (
            <div key={key}>
              <h3 className="mb-2 text-sm font-semibold">{g.type} <span className="font-normal text-muted">({g.items.length})</span></h3>
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {list.map((e) => (
                  <li key={e.url}>
                    <a
                      href={e.url} target="_blank" rel="noopener noreferrer"
                      aria-label={`${e.name}, page recrutement (s'ouvre dans un nouvel onglet)`}
                      className="card flex h-full items-start justify-between gap-2 p-3 transition-colors hover:border-muted focus-visible:outline-2"
                    >
                      <span className="min-w-0">
                        <span className="block font-medium leading-snug">{e.name}</span>
                        <span className="block truncate text-xs text-muted">{e.sector || hostOf(e.url)}</span>
                      </span>
                      <ExternalLink size={14} aria-hidden className="mt-1 shrink-0 text-muted" />
                    </a>
                  </li>
                ))}
              </ul>
              {hidden > 0 && (
                <button type="button" className="btn btn-sm btn-ghost mt-2" aria-expanded={false} onClick={() => setOpen((o) => ({ ...o, [key]: true }))}>
                  {hidden === 1 ? "Voir 1 autre" : `Voir les ${hidden} autres`}
                </button>
              )}
              {!searching && expanded && g.items.length > PER_TYPE && (
                <button type="button" className="btn btn-sm btn-ghost mt-2" aria-expanded onClick={() => setOpen((o) => ({ ...o, [key]: false }))}>
                  Réduire
                </button>
              )}
            </div>
          );
        })}
      </div>

      {groups.length > 0 && (
        <p className="mt-4 max-w-[65ch] text-xs text-muted">
          Les adresses ont été relevées sur les sites officiels ; un lien peut avoir changé depuis. Si une page ne s'ouvre pas, cherche le nom de l'entreprise suivi de « recrutement ».
        </p>
      )}
    </section>
  );
}
