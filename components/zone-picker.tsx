"use client";
import { useCallback } from "react";
import { Combobox, type Opt } from "@/components/ui/combobox";
import { DEPARTEMENTS, IDF_CODES } from "@/lib/departements";
import { MAX_ZONE } from "@/lib/onboarding";
import type { SearchZone } from "@/lib/types";
import { useT } from "@/components/i18n";

const DEPT_OPTIONS: Opt[] = [
  ...DEPARTEMENTS.filter((d) => IDF_CODES.includes(d.code)).map((d) => ({ id: d.code, label: `${d.name} (${d.code})`, group: "Île-de-France" })),
  ...DEPARTEMENTS.filter((d) => !IDF_CODES.includes(d.code)).map((d) => ({ id: d.code, label: `${d.name} (${d.code})`, group: "Autres départements" })),
];

/** Recherche de communes sur geo.api.gouv.fr (service public, gratuit, sans clé) : par nom, par code postal (5 chiffres) ou par département (2-3 chiffres). */
async function searchCities(q: string, signal: AbortSignal): Promise<Opt[]> {
  const digits = /^\d+$/.test(q);
  if (digits && (q.length === 4 || q.length > 5)) return []; // code postal incomplet : le message d'aide s'affiche
  const byDept = digits && q.length <= 3;
  const param = byDept ? `codeDepartement=${q}` : digits ? `codePostal=${q}` : `nom=${encodeURIComponent(q)}&boost=population`;
  const res = await fetch(`https://geo.api.gouv.fr/communes?${param}&fields=nom,departement,population&limit=${byDept ? 200 : 8}`, { signal });
  if (!res.ok) throw new Error("geo");
  let rows = (await res.json()) as { nom: string; population?: number; departement?: { code: string; nom: string } }[];
  if (byDept) rows = rows.sort((a, b) => (b.population ?? 0) - (a.population ?? 0)).slice(0, 8); // les plus grandes communes du département d'abord
  return rows
    .filter((r) => r.departement?.code)
    .map((r) => ({ id: `${r.nom}|${r.departement!.code}`, label: `${r.nom} (${r.departement!.code})`, hint: r.departement!.nom }));
}

const cityHint = (q: string) => (/^\d+$/.test(q) ? (q.length === 4 || q.length > 5 ? "Un code postal a 5 chiffres (ex : 93300). Tape 2 chiffres pour voir les villes d'un département." : "Aucune ville pour ce numéro.") : null);

const EMPTY: SearchZone = { scope: "france", departments: [], cities: [] };

/** Zone de recherche : liste déroulante France / Département / Ville, puis choix précis selon le cas. */
export function ZonePicker({ value, onChange, invalid }: { value: SearchZone | null; onChange: (z: SearchZone | null) => void; invalid?: boolean }) {
  const t = useT();
  const z = value ?? EMPTY;
  const load = useCallback(searchCities, []);

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="label block">{t("Zone de recherche")}</span>
        <select
          className="field mt-1 max-w-sm appearance-none bg-[length:1.1rem] bg-[right_0.8rem_center] bg-no-repeat pr-10"
          style={{ backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23788' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='m6 9 6 6 6-6'/></svg>\")" }}
          value={value?.scope ?? ""} aria-invalid={invalid || undefined} id="zone-scope"
          onChange={(e) => onChange(e.target.value ? { ...z, scope: e.target.value as SearchZone["scope"] } : null)}
        >
          <option value="" disabled>{t("Choisis une zone…")}</option>
          <option value="france">{t("France uniquement")}</option>
          <option value="departement">{t("Département")}</option>
          <option value="ville">{t("Ville")}</option>
        </select>
      </label>

      {value?.scope === "departement" && (
        <div>
          <Combobox label={t("Départements")} placeholder={t("Nom ou numéro (ex : 75)")} options={DEPT_OPTIONS} max={MAX_ZONE} maxMessage={`${MAX_ZONE} départements au maximum.`} invalid={invalid}
            value={z.departments.map((d) => ({ id: d.code, label: `${d.name} (${d.code})` }))}
            onChange={(v) => onChange({ ...z, departments: v.map((o) => ({ code: o.id, name: o.label.replace(/ \(.*\)$/, "") })) })} />
          <p className="mt-1.5 text-sm text-muted">{t("Jusqu'à")} {MAX_ZONE} {t("départements.")}</p>
        </div>
      )}

      {value?.scope === "ville" && (
        <div>
          <Combobox label={t("Villes")} placeholder={t("Nom de ville, code postal ou n° de département")} load={load} minChars={2} emptyHint={cityHint} max={MAX_ZONE} maxMessage={`${MAX_ZONE} villes au maximum.`} invalid={invalid}
            value={z.cities.map((c) => ({ id: `${c.name}|${c.dept}`, label: `${c.name} (${c.dept})`, hint: c.deptName }))}
            onChange={(v) => onChange({
              ...z,
              cities: v.map((o) => { const [name, dept] = o.id.split("|"); return { name, dept, deptName: o.hint ?? z.cities.find((c) => c.name === name && c.dept === dept)?.deptName }; }),
            })} />
          <p className="mt-1.5 text-sm text-muted">{t("Jusqu'à")} {MAX_ZONE} {t("villes.")}</p>
        </div>
      )}

      {value?.scope === "france" && <p className="text-sm text-muted">{t("Les offres de toute la France seront proposées.")}</p>}
    </div>
  );
}
