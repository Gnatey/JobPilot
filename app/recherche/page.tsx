"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, X, Bookmark, BellRing, Trash2, ExternalLink, Search as SearchIcon, Loader2 } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { PageTitle, Section, Empty } from "@/components/ui/page-title";
import { ScorePill } from "@/components/ui/score";
import { REJECT_REASONS, type Profile, type SearchZone } from "@/lib/types";
import type { SearchCriteria } from "@/lib/sources/types";
import { fmtDate, plural } from "@/lib/format";
import { deptName } from "@/lib/departements";
import { zoneDepartments } from "@/lib/onboarding";
import { JOB_OPTIONS, MAX_ROLES, splitRoles } from "@/lib/job-families";
import { Combobox, type Opt } from "@/components/ui/combobox";
import { ZonePicker } from "@/components/zone-picker";
import { ChipGroup } from "@/components/ui/chip-group";
import { OtherBoards } from "@/components/other-boards";
import { useFeedback } from "@/components/ui/feedback";
import { refreshBadges } from "@/components/nav";

type Result = {
  key: string; source: string; id: string; title: string; company: string; location: string; contract: string; salary: string; experience: string;
  date: string; url: string; description: string; quick_score: number; matched: string[]; penalties: string[]; offer_id: string | null; decision: string | null;
};
type Saved = { id: string; name: string; criteria: SearchCriteria; auto: boolean };
type SourceReport = { id: string; label: string; ok: boolean; count: number; error?: string };

// Codes de contrat des sources correspondant aux choix du questionnaire d'accueil
const CONTRACT_ID: Record<string, string> = { CDI: "CDI", CDD: "CDD", "Intérim": "MIS", Freelance: "LIB", Alternance: "ALT", Stage: "STG" };
const CONTRACTS = [{ id: "CDI", label: "CDI" }, { id: "CDD", label: "CDD" }, { id: "MIS", label: "Intérim" }, { id: "LIB", label: "Freelance" }, { id: "ALT", label: "Alternance" }, { id: "STG", label: "Stage" }];
const SINCE = [{ id: "1", label: "24 h" }, { id: "3", label: "3 jours" }, { id: "7", label: "7 jours" }, { id: "14", label: "14 jours" }, { id: "31", label: "1 mois" }];

const DEFAULT: SearchCriteria = { keywords: "", departments: [], contracts: ["CDI", "CDD"], experience: "", publishedWithin: "14", maxYears: null, exclude: "" };
const FRANCE: SearchZone = { scope: "france", departments: [], cities: [] };
/** Zone à partir d'une liste de départements (recherches sauvegardées avant la liste déroulante) */
const zoneOf = (depts: string[]): SearchZone => (depts.length ? { scope: "departement", departments: depts.map((code) => ({ code, name: deptName(code) })), cities: [] } : FRANCE);
const toOpt = (x: string): Opt => ({ id: x, label: x });

export default function Recherche() {
  const sb = useMemo(() => supabaseBrowser(), []);
  const router = useRouter();
  const { toast, ask, confirm } = useFeedback();
  const [targets, setTargets] = useState<string[]>([]);
  const [c, setC] = useState<SearchCriteria>(DEFAULT);
  const [results, setResults] = useState<Result[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, string>>({});
  const [zone, setZone] = useState<SearchZone | null>(FRANCE);
  const [sources, setSources] = useState<{ id: string; label: string }[] | null>(null); // sources d'offres branchées (null = pas encore connu)
  const [report, setReport] = useState<SourceReport[]>([]);
  const auto = (sources?.length ?? 0) > 0;

  useEffect(() => {
    let last: (SearchCriteria & { zone?: SearchZone }) | null = null;
    try { last = JSON.parse(localStorage.getItem("jp-search") ?? "null"); } catch {}
    if (last?.keywords) { setC({ ...DEFAULT, ...last }); setZone(last.zone ?? zoneOf(last.departments ?? [])); }
    sb.from("profiles").select("data").maybeSingle().then(({ data }) => {
      const p = data?.data as Profile | undefined;
      const t = p?.targets?.map((x) => x.title).filter(Boolean) ?? [];
      setTargets(t);
      if (!last?.keywords) {
        if (t[0]) setC((x) => ({ ...x, keywords: x.keywords || t[0] }));
        setC((x) => ({ ...x, maxYears: p?.preferences?.max_years ?? null }));
        // Zone et contrats choisis dans le questionnaire d'accueil
        if (p?.preferences?.search_zone) setZone(p.preferences.search_zone);
        const fc = [...new Set((p?.preferences?.contracts ?? []).map((k) => CONTRACT_ID[k]).filter(Boolean))];
        if (fc.length) setC((x) => ({ ...x, contracts: fc }));
      }
    });
    fetch("/api/sources").then((r) => r.json()).then((j) => setSources(j.sources ?? [])).catch(() => setSources([]));
    loadSaved();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sb]);

  async function loadSaved() {
    const { data } = await sb.from("searches").select("*").order("created_at", { ascending: false });
    setSaved((data ?? []) as Saved[]);
  }

  const roles = splitRoles(c.keywords);
  const setRoles = (xs: string[]) => setC((x) => ({ ...x, keywords: xs.join(", ") }));
  /** Critères envoyés à l'API : la zone choisie devient une liste de départements */
  const criteriaNow = (): SearchCriteria => ({ ...c, departments: zoneDepartments(zone), cities: zone?.scope === "ville" ? zone.cities.map((x) => x.name) : [] });

  async function run(e?: React.FormEvent, given?: SearchCriteria) {
    e?.preventDefault();
    const criteria = given ?? criteriaNow();
    if (!splitRoles(criteria.keywords).length) return setErr("Choisis au moins un poste.");
    setBusy(true);
    setErr(null);
    try { localStorage.setItem("jp-search", JSON.stringify({ ...criteria, zone: given ? zoneOf(criteria.departments) : zone })); } catch {}
    const r = await fetch("/api/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(criteria) }).then((r) => r.json()).catch(() => ({ error: "Connexion interrompue, réessaie." }));
    setBusy(false);
    if (r.error) return setErr(r.error);
    setResults(r.results);
    setReport(r.sources ?? []);
    setDone({});
  }

  async function store(items: Result[]) {
    const r = await fetch("/api/recommendations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items }) }).then((r) => r.json()).catch(() => ({}));
    return (r.ids ?? {}) as Record<string, string>;
  }

  async function decide(o: Result, decision: "accept" | "reject" | "store", reason?: string) {
    setRowBusy(o.key);
    const ids = await store([o]);
    if (!ids[o.key]) { setRowBusy(null); return toast("Impossible d'enregistrer cette offre, réessaie.", { tone: "err" }); }
    if (decision === "store") {
      setRowBusy(null);
      refreshBadges();
      return setDone((d) => ({ ...d, [o.key]: "Rangée dans Recommandées" }));
    }
    const res = await fetch(`/api/recommendations/${ids[o.key]}/decide`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision, reason }),
    }).then((r) => r.json()).catch(() => ({ error: "Connexion interrompue, réessaie." }));
    setRowBusy(null);
    setRejecting(null);
    if (res.error) return toast(res.error, { tone: "err" });
    refreshBadges();
    if (decision === "accept") {
      toast("Ajoutée à ton suivi.", { action: { label: "Préparer le CV", run: () => router.push(res.offer_id ? `/offres/${res.offer_id}?go=cv` : `/offres/nouvelle?auto=1&then=cv&reco=${ids[o.key]}&url=${encodeURIComponent(o.url)}`) } });
      setDone((d) => ({ ...d, [o.key]: "Dans ton suivi" }));
    } else setDone((d) => ({ ...d, [o.key]: "Écartée" }));
  }

  async function storeTop() {
    if (!results) return;
    const top = results.filter((r) => r.quick_score >= 50 && !done[r.key]);
    if (!top.length) return;
    setBusy(true);
    await store(top);
    setBusy(false);
    refreshBadges();
    toast(`${plural(top.length, "offre rangée", "offres rangées")} dans Recommandées.`);
    setDone((d) => ({ ...d, ...Object.fromEntries(top.map((t) => [t.key, "Rangée dans Recommandées"])) }));
  }

  async function saveSearch() {
    const now = criteriaNow();
    if (!splitRoles(now.keywords).length) return setErr("Choisis au moins un poste.");
    const name = await ask({ title: "Recevoir chaque matin", label: "Nom de cette recherche", initial: `${splitRoles(now.keywords).join(" / ")} (${now.departments.join(", ") || "France"})`, confirmLabel: "Activer" });
    if (!name) return;
    const { error } = await sb.from("searches").insert({ name, criteria: now, auto: true });
    if (error) return toast("La recherche n'a pas pu être sauvegardée.", { tone: "err" });
    toast("C'est noté : les nouvelles offres arriveront chaque matin dans Recommandées.");
    loadSaved();
  }

  return (
    <>
      <PageTitle title="Recherche (En cours de développement 😶‍🌫️)" sub={auto ? `Choisis le poste et la zone : l'app interroge ${sources!.map((x) => x.label).join(" et ")} et note chaque offre avec ton profil. Sauvegarde la recherche pour recevoir les nouvelles offres chaque matin.` : "Choisis le poste et la zone : l'app ouvre les sites d'emploi avec ta recherche déjà remplie. Les offres de tes alertes Gmail arrivent notées dans Recommandées."} />

      <form onSubmit={run} className="card mb-10 space-y-7 p-5 md:p-6">
        <div className="grid gap-x-12 gap-y-7 lg:grid-cols-2">
          <fieldset>
            <legend className="heading">Quel poste cherches-tu ?</legend>
            <p className="mt-0.5 text-sm text-muted">Choisis dans la liste ou écris le tien. {MAX_ROLES} postes au maximum.</p>
            <div className="mt-2">
              <Combobox label="Postes recherchés" placeholder="Ex : Data Analyst, Business Analyst…" options={JOB_OPTIONS} allowCustom max={MAX_ROLES} maxMessage={`${MAX_ROLES} postes au maximum par recherche.`}
                value={roles.map(toOpt)} onChange={(v) => setRoles(v.map((o) => o.label))} />
            </div>
            {targets.length > 0 && (
              <div className="mt-3">
                <p className="label">Tes cibles</p>
                <ChipGroup multi label="Tes cibles" className="mt-1.5" options={targets} value={roles.filter((r) => targets.includes(r))}
                  onChange={(v) => { if (v.length > roles.filter((r) => targets.includes(r)).length && roles.length >= MAX_ROLES) return setErr(`${MAX_ROLES} postes au maximum par recherche.`); setErr(null); setRoles([...roles.filter((r) => !targets.includes(r)), ...v]); }} />
              </div>
            )}
          </fieldset>

          <fieldset>
            <legend className="heading">Où ?</legend>
            <div className="mt-2"><ZonePicker value={zone} onChange={setZone} /></div>
          </fieldset>
        </div>

        <div className="grid gap-x-12 gap-y-7 lg:grid-cols-2">
          {auto && <fieldset>
            <legend className="heading">Contrat</legend>
            <ChipGroup multi className="mt-2" label="Types de contrat" options={CONTRACTS.map((x) => x.label)}
              value={c.contracts.map((id) => CONTRACTS.find((x) => x.id === id)?.label ?? "")}
              onChange={(v) => setC({ ...c, contracts: v.map((l) => CONTRACTS.find((x) => x.label === l)?.id ?? "") })} />
            <p className="mt-1.5 text-sm text-muted">{c.contracts.length ? "Clique à nouveau pour retirer un choix." : "Aucun choix : tous les contrats sont proposés."}</p>
          </fieldset>}
          <fieldset>
            <legend className="heading">Publiées depuis</legend>
            <ChipGroup keepOne className="mt-2" label="Période" options={SINCE.map((x) => x.label)} value={[SINCE.find((x) => x.id === c.publishedWithin)?.label ?? ""]}
              onChange={(v) => { const id = SINCE.find((x) => x.label === v[0])?.id; if (id) setC({ ...c, publishedWithin: id as SearchCriteria["publishedWithin"] }); }} />
          </fieldset>
        </div>

        {auto && <fieldset className="space-y-2">
          <legend className="heading">Filtres</legend>
          <label className="flex items-center gap-2">
            <input type="checkbox" className="h-4 w-4 accent-[var(--color-marigold)]" checked={c.maxYears != null} onChange={(e) => setC({ ...c, maxYears: e.target.checked ? 3 : null })} />
            Adaptées à mon expérience (pas plus de {c.maxYears ?? 3} ans demandés)
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" className="h-4 w-4 accent-[var(--color-marigold)]" checked={!!c.remoteOnly} onChange={(e) => setC({ ...c, remoteOnly: e.target.checked })} />
            Télétravail possible uniquement
          </label>
          <label className="block max-w-xl">
            <span className="label">Mots à exclure, séparés par des virgules</span>
            <input className="field mt-1" value={c.exclude ?? ""} onChange={(e) => setC({ ...c, exclude: e.target.value })} />
          </label>
        </fieldset>}

        {auto && <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary btn-xl" disabled={busy}>{busy ? <><Loader2 size={18} className="animate-spin" /> Recherche…</> : <><SearchIcon size={18} /> Lancer la recherche</>}</button>
          <button type="button" className="btn btn-xl" onClick={saveSearch}><BellRing size={16} /> Recevoir chaque matin</button>
        </div>}
        {err && (
          <p className="rounded-xl bg-bad/10 p-3 text-sm text-bad" role="alert">
            {err}
          </p>
        )}
      </form>

      {sources && !auto && (
        <p className="mb-8 max-w-[65ch] rounded-xl bg-surface p-4 text-sm" role="note">
          <strong>Pas de recherche automatique ici.</strong> Les offres arrivent autrement : tes alertes emploi lues dans Gmail (rangées dans <Link href="/recommandees" className="link">Recommandées</Link>) et le copier-coller ci-dessous.
          Pour brancher une source automatique, voir <Link href="/parametres#sources" className="link">Réglages, Sources d'offres</Link>.
        </p>
      )}

      <OtherBoards roles={roles} zone={zone} days={c.publishedWithin} auto={auto} />

      {results && report.some((r) => !r.ok) && (
        <p className="mb-3 rounded-xl bg-marigold/10 p-3 text-sm" role="status">
          {report.filter((r) => !r.ok).map((r) => `${r.label} n'a pas répondu (${r.error}).`).join(" ")} Les autres sources ont répondu.
        </p>
      )}
      {results && (
        <Section title={`${results.length} offre${results.length > 1 ? "s" : ""}`}
          aside={results.some((r) => r.quick_score >= 50) && <button className="btn btn-sm" onClick={storeTop} disabled={busy}><Bookmark size={15} /> Ranger les bonnes pistes et celles à regarder</button>}>
          {!results.length ? <Empty>Aucune offre. Élargis la zone, la période ou les mots-clés.</Empty> : (
            <ul className="list">
              {results.map((o) => (
                <li key={o.key} className="px-4 py-3">
                  <div className="flex items-start gap-3">
                    <div className="w-[5.6rem] shrink-0 pt-0.5 text-center"><ScorePill value={o.quick_score} estimate /></div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold leading-snug">{o.title}</p>
                      <p className="text-sm text-muted">{[o.company, o.location, o.contract, o.salary].filter(Boolean).join(", ")}</p>
                      <p className="text-xs text-muted">{[o.experience, o.date ? `publiée le ${fmtDate(o.date)}` : "", `via ${o.source}`].filter(Boolean).join(", ")}</p>
                      {o.matched.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1">{o.matched.map((m) => <span key={m} className="tag tag-good">{m}</span>)}</div>}
                      {o.penalties.length > 0 && <p className="mt-1 text-xs text-bad">{o.penalties.join(" ; ")}</p>}
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 md:pl-[6.5rem]">
                    {done[o.key] ? <p className="py-2 text-sm font-semibold">{done[o.key]}</p> : o.decision === "accepted" ? <p className="py-2 text-sm font-semibold">Déjà dans ton suivi</p> : (
                      <>
                        <button className="btn btn-sm btn-primary" disabled={rowBusy === o.key} onClick={() => decide(o, "accept")}><Check size={15} /> Je candidate</button>
                        <button className="btn btn-sm" onClick={() => setRejecting(rejecting === o.key ? null : o.key)}><X size={15} /> Pas pour moi</button>
                        <button className="btn btn-sm btn-ghost" disabled={rowBusy === o.key} onClick={() => decide(o, "store")}><Bookmark size={15} /> Ranger</button>
                      </>
                    )}
                    {o.offer_id && <Link href={`/offres/${o.offer_id}`} className="btn btn-sm btn-ghost">Analyse</Link>}
                    <a href={o.url} target="_blank" rel="noreferrer" className="btn btn-sm btn-ghost"><ExternalLink size={15} /> Annonce</a>
                  </div>
                  {rejecting === o.key && (
                    <div className="mt-2 flex flex-wrap gap-1.5 md:pl-[6.5rem]">
                      {REJECT_REASONS.map((x) => <button key={x.id} className="chip" onClick={() => decide(o, "reject", x.id)}>{x.label}</button>)}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      <Section title="Recherches sauvegardées">
        {!saved.length ? <Empty>Aucune. « Recevoir chaque matin » ajoute la recherche ici : ses nouvelles offres arrivent dans Recommandées.</Empty> : (
          <ul className="list">
            {saved.map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                <button className="min-w-0 flex-1 text-left" onClick={() => { setC(s.criteria); setZone(zoneOf(s.criteria.departments ?? [])); run(undefined, s.criteria); }}>
                  <p className="truncate font-semibold">{s.name}</p>
                  <p className="text-sm text-muted">{s.auto ? "Relancée chaque matin" : "En pause"}</p>
                </button>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="h-4 w-4 accent-[var(--color-marigold)]" checked={s.auto}
                    onChange={async (e) => { await sb.from("searches").update({ auto: e.target.checked }).eq("id", s.id); loadSaved(); }} /> Auto
                </label>
                <button className="btn btn-ghost btn-icon text-bad" aria-label={`Supprimer ${s.name}`} onClick={async () => {
                  if (!(await confirm({ title: "Supprimer cette recherche ?", body: s.name, confirmLabel: "Supprimer", danger: true }))) return;
                  await sb.from("searches").delete().eq("id", s.id); loadSaved();
                }}><Trash2 size={16} /></button>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
