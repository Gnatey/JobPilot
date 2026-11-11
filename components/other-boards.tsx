"use client";
import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { ChipGroup } from "@/components/ui/chip-group";
import Link from "next/link";
import type { SearchZone } from "@/lib/types";

/** `days` vide : aucune limite de date (la période est décochée dans Recherche), le lien n'en porte pas. */
type Site = { name: string; url: (q: string, where: string, days: string) => string };

/** Pages de recherche des autres sites d'emploi, préremplies avec ton poste et ta zone (aucun accès à leurs données : tu les ouvres toi-même). */
const SITES: Site[] = [
  { name: "Indeed", url: (q, l, d) => `https://fr.indeed.com/jobs?q=${enc(q)}&l=${enc(l)}${d ? `&fromage=${d}` : ""}` },
  { name: "LinkedIn", url: (q, l, d) => `https://www.linkedin.com/jobs/search/?keywords=${enc(q)}&location=${enc(l || "France")}${d ? `&f_TPR=r${Number(d) * 86400}` : ""}` },
  { name: "HelloWork", url: (q, l) => `https://www.hellowork.com/fr-fr/emploi/recherche.html?k=${enc(q)}&l=${enc(l)}` },
  { name: "Welcome to the Jungle", url: (q, l) => `https://www.welcometothejungle.com/fr/jobs?query=${enc(q)}&aroundQuery=${enc(l)}` },
  { name: "Meteojob", url: (q, l) => `https://www.meteojob.com/jobs?what=${enc(q)}&where=${enc(l)}` },
  { name: "APEC", url: (q) => `https://www.apec.fr/candidat/recherche-emploi.html/emploi?motsCles=${enc(q)}` },
  { name: "France Travail", url: (q) => `https://candidat.francetravail.fr/offres/recherche?motsCles=${enc(q)}` },
];
const enc = encodeURIComponent;
const KEY = "jp-boards";
const DEFAULT = SITES.slice(0, 4).map((s) => s.name);

export function OtherBoards({ roles, zone, days, auto }: { roles: string[]; zone: SearchZone | null; days: string; auto: boolean }) {
  const [chosen, setChosen] = useState<string[]>(DEFAULT);
  const [role, setRole] = useState("");
  useEffect(() => {
    try { const v = JSON.parse(localStorage.getItem(KEY) ?? "null"); if (Array.isArray(v)) setChosen(v.filter((x) => SITES.some((s) => s.name === x))); } catch {}
  }, []);
  const pick = (v: string[]) => { setChosen(v); try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {} };

  const q = roles.includes(role) ? role : roles[0] ?? "";
  const where = zone?.scope === "ville" ? zone.cities[0]?.name ?? "" : zone?.scope === "departement" ? zone.departments[0]?.name ?? "" : "";
  const since = days === "0" ? "" : days === "1" ? "1" : days === "3" ? "3" : days === "7" ? "7" : days === "31" ? "30" : "14";

  return (
    <section className="mb-10" aria-labelledby="other-boards">
      <h2 id="other-boards" className="heading text-xl">{auto ? "Chercher aussi sur les autres sites" : "Chercher sur les sites d'emploi"}</h2>
      <p className="mb-3 mt-1 max-w-[65ch] text-sm text-muted">
        Choisis les sites qui t'intéressent : chaque bouton ouvre leur page de résultats avec ton poste et ta zone déjà remplis. Quand une annonce te plaît, copie son lien (ou son texte) dans <Link href="/offres/nouvelle" className="link">Analyser une offre</Link> : l'app calcule ton score, puis prépare le CV et la lettre.
      </p>
      <ChipGroup multi label="Sites d'emploi" options={SITES.map((s) => s.name)} value={chosen} onChange={pick} />
      {roles.length > 1 && (
        <label className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="label">Poste à chercher</span>
          <select className="field !w-auto !py-1.5" value={q} onChange={(e) => setRole(e.target.value)}>{roles.map((r) => <option key={r}>{r}</option>)}</select>
        </label>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {!q ? <p className="text-sm text-muted">Choisis d'abord un poste ci-dessus.</p> : SITES.filter((s) => chosen.includes(s.name)).map((s) => (
          <a key={s.name} href={s.url(q, where, since)} target="_blank" rel="noreferrer" className="btn"><ExternalLink size={15} /> {s.name}</a>
        ))}
        {q && !chosen.length && <p className="text-sm text-muted">Aucun site choisi : coche ceux que tu veux utiliser.</p>}
      </div>
      {!!q && chosen.length > 0 && (
        <p className="mt-3 max-w-[65ch] text-sm text-muted">
          Chaque site s'ouvre dans un nouvel onglet. Si l'un te demande de te connecter, fais-le dans cet onglet : ta recherche reste remplie. Ton compte sur ces sites n'est jamais lu par JobPilot.
        </p>
      )}
    </section>
  );
}
