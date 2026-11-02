"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, X, Bookmark, Trash2, ExternalLink, Search as SearchIcon, Loader2, CalendarCheck, Zap, Plus } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { PageTitle, Section, Empty } from "@/components/ui/page-title";
import { ScorePill } from "@/components/ui/score";
import { REJECT_REASONS, type Profile, type SavedCriteria, type SearchZone } from "@/lib/types";
import type { SearchCriteria } from "@/lib/sources/types";
import { fmtDate, plural, today } from "@/lib/format";
import { deptName } from "@/lib/departements";
import { CONTRACT_CODE, DEFAULT_DAILY_QUOTA, MAX_DAILY_QUOTA, zoneDepartments } from "@/lib/onboarding";
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
  fit_reason?: string | null;
};
type Saved = { id: string; name: string; criteria: SearchCriteria; auto: boolean };
type SourceReport = { id: string; label: string; ok: boolean; count: number; error?: string };
type DayStats = { total: number; left: number; yes: number; no: number };

const CONTRACTS = [{ id: "CDI", label: "CDI" }, { id: "CDD", label: "CDD" }, { id: "MIS", label: "Intérim" }, { id: "LIB", label: "Freelance" }, { id: "ALT", label: "Alternance" }, { id: "STG", label: "Stage" }];
const SINCE = [{ id: "1", label: "24 h" }, { id: "3", label: "3 jours" }, { id: "7", label: "7 jours" }, { id: "14", label: "14 jours" }, { id: "31", label: "1 mois" }];

// Aucun poste n'est présélectionné : les critères viennent de ceux que tu as validés, à défaut du questionnaire
const DEFAULT: SearchCriteria = { keywords: "", departments: [], contracts: [], experience: "", publishedWithin: "14", maxYears: null, exclude: "" };
const FRANCE: SearchZone = { scope: "france", departments: [], cities: [] };
/** Zone à partir d'une liste de départements (recherches sauvegardées avant la liste déroulante) */
const zoneOf = (depts: string[]): SearchZone => (depts.length ? { scope: "departement", departments: depts.map((code) => ({ code, name: deptName(code) })), cities: [] } : FRANCE);
const toOpt = (x: string): Opt => ({ id: x, label: x });
const sig = (c: Pick<SavedCriteria, "roles" | "zone" | "contracts" | "publishedWithin" | "remoteOnly" | "exclude" | "maxYears">) =>
  JSON.stringify([c.roles, c.zone, [...c.contracts].sort(), c.publishedWithin, !!c.remoteOnly, c.exclude ?? "", c.maxYears ?? null]);

export default function Recherche() {
  const sb = useMemo(() => supabaseBrowser(), []);
  const router = useRouter();
  const { toast, confirm } = useFeedback();
  const [targets, setTargets] = useState<string[]>([]);
  const [c, setC] = useState<SearchCriteria>(DEFAULT);
  const [zone, setZone] = useState<SearchZone | null>(FRANCE);
  const [quota, setQuota] = useState(DEFAULT_DAILY_QUOTA);
  const [loaded, setLoaded] = useState(false);
  const [savedSig, setSavedSig] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [fromQuestionnaire, setFromQuestionnaire] = useState(false);
  const [working, setWorking] = useState<"save" | "day" | "more" | null>(null);
  const [day, setDay] = useState<DayStats | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [results, setResults] = useState<Result[] | null>(null);
  const [showFar, setShowFar] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, string>>({});
  const [sources, setSources] = useState<{ id: string; label: string }[] | null>(null); // sources d'offres branchées (null = pas encore connu)
  const [report, setReport] = useState<SourceReport[]>([]);
  const auto = (sources?.length ?? 0) > 0;

  const roles = splitRoles(c.keywords);
  const setRoles = (xs: string[]) => setC((x) => ({ ...x, keywords: xs.join(", ") }));
  /** Critères envoyés à l'API de recherche : la zone choisie devient une liste de départements */
  const criteriaNow = (): SearchCriteria => ({ ...c, departments: zoneDepartments(zone), cities: zone?.scope === "ville" ? zone.cities.map((x) => x.name) : [] });
  /** Critères à valider (format enregistré dans le profil) */
  const formCriteria = (): Omit<SavedCriteria, "saved_at"> => ({ roles, zone, contracts: c.contracts, publishedWithin: c.publishedWithin, remoteOnly: !!c.remoteOnly, exclude: c.exclude ?? "", maxYears: c.maxYears ?? null });
  const dirty = loaded && savedSig !== sig(formCriteria());

  const loadDay = useCallback(async (ids: string[]) => {
    if (!ids.length) return setDay(null);
    const { data } = await sb.from("recommendations").select("id, status").in("id", ids.slice(0, 300));
    const st = (data ?? []).map((r) => r.status as string);
    setDay({ total: ids.length, left: st.filter((s) => s === "new" || s === "analyzed").length, yes: st.filter((s) => s === "accepted").length, no: st.filter((s) => s === "rejected").length });
  }, [sb]);

  async function loadSaved() {
    const { data } = await sb.from("searches").select("*").order("created_at", { ascending: false });
    setSaved((data ?? []) as Saved[]);
  }

  useEffect(() => {
    sb.from("profiles").select("data").maybeSingle().then(({ data }) => {
      const p = data?.data as Profile | undefined;
      setTargets(p?.targets?.map((x) => x.title).filter(Boolean) ?? []);
      const pref = p?.preferences;
      setQuota(Math.max(1, Math.min(MAX_DAILY_QUOTA, pref?.daily_quota ?? DEFAULT_DAILY_QUOTA)));
      const crit = pref?.criteria;
      if (crit?.roles?.length) {
        // Les critères validés, tels que tu les as laissés
        setC({ ...DEFAULT, keywords: crit.roles.join(", "), contracts: crit.contracts, publishedWithin: crit.publishedWithin, remoteOnly: crit.remoteOnly, exclude: crit.exclude ?? "", maxYears: crit.maxYears ?? null });
        setZone(crit.zone ?? pref?.search_zone ?? FRANCE);
        setSavedSig(sig({ roles: crit.roles, zone: crit.zone ?? pref?.search_zone ?? FRANCE, contracts: crit.contracts, publishedWithin: crit.publishedWithin, remoteOnly: !!crit.remoteOnly, exclude: crit.exclude ?? "", maxYears: crit.maxYears ?? null }));
        setSavedAt(crit.saved_at);
      } else {
        // Première visite : ce que tu as répondu au questionnaire
        const t = (p?.targets?.map((x) => x.title).filter(Boolean) ?? []).slice(0, MAX_ROLES);
        const fc = [...new Set((pref?.contracts ?? []).map((k) => CONTRACT_CODE[k]).filter(Boolean))];
        setC({ ...DEFAULT, keywords: t.join(", "), contracts: fc, maxYears: pref?.max_years ?? null });
        setZone(pref?.search_zone ?? FRANCE);
        setFromQuestionnaire(true);
      }
      if (pref?.day?.date === today()) loadDay(pref.day.ids);
      setLoaded(true);
    });
    fetch("/api/sources").then((r) => r.json()).then((j) => setSources(j.sources ?? [])).catch(() => setSources([]));
    loadSaved();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sb]);

  /** Bouton 1 : enregistre les critères (ils remplacent les précédents). Renvoie true si c'est fait. */
  async function saveCriteria(quiet = false): Promise<boolean> {
    if (!roles.length) { setErr("Choisis au moins un poste."); return false; }
    setErr(null);
    const form = formCriteria();
    const r = await fetch("/api/criteria", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, daily_quota: quota }) })
      .then((x) => x.json()).catch(() => ({ error: "Connexion interrompue, réessaie." }));
    if (r.error) { setErr(r.error); return false; }
    setSavedSig(sig(form));
    setSavedAt(r.saved_at ?? new Date().toISOString());
    setFromQuestionnaire(false);
    refreshBadges();
    if (r.changed) setDay(null);
    if (!quiet) {
      toast(r.paused ? `Critères enregistrés. ${plural(r.paused, "ancienne recherche automatique est", "anciennes recherches automatiques sont")} en pause.` : "Critères enregistrés : ils remplacent les précédents.");
      loadSaved();
    }
    return true;
  }

  async function onSave() {
    setWorking("save");
    setNotice(null);
    await saveCriteria();
    setWorking(null);
  }

  /** Bouton 2 : prépare la liste du jour (enregistre d'abord les critères s'ils ont changé) puis ouvre le Tri rapide. */
  async function prepareDay(more = false) {
    setWorking(more ? "more" : "day");
    setNotice(null);
    if (!more && (dirty || savedSig === null) && !(await saveCriteria(true))) return setWorking(null);
    const r = await fetch("/api/day", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ more }) })
      .then((x) => x.json()).catch(() => ({ error: "Connexion interrompue, réessaie." }));
    setWorking(null);
    if (r.error) return setErr(r.error);
    refreshBadges();
    if (r.ids?.length) await loadDay(r.ids);
    if (r.message) { setNotice(r.message); if (r.added || r.left) toast(r.message, { tone: "info", ms: 9000 }); }
    if (r.left > 0) router.push("/recommandees/tri?jour=1");
  }

  async function run(given?: SearchCriteria) {
    const criteria = given ?? criteriaNow();
    if (!splitRoles(criteria.keywords).length) return setErr("Choisis au moins un poste.");
    setBusy(true);
    setErr(null);
    const r = await fetch("/api/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(criteria) }).then((r) => r.json()).catch(() => ({ error: "Connexion interrompue, réessaie." }));
    setBusy(false);
    if (r.error) return setErr(r.error);
    setResults(r.results);
    setReport(r.sources ?? []);
    setDone({});
    setShowFar(false);
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
    const top = results.filter((r) => r.quick_score >= 50 && !r.fit_reason && !done[r.key]);
    if (!top.length) return;
    setBusy(true);
    await store(top);
    setBusy(false);
    refreshBadges();
    toast(`${plural(top.length, "offre rangée", "offres rangées")} dans Recommandées.`);
    setDone((d) => ({ ...d, ...Object.fromEntries(top.map((t) => [t.key, "Rangée dans Recommandées"])) }));
  }

  const far = results?.filter((r) => r.fit_reason).length ?? 0;
  const shown = results ? results.filter((r) => showFar || !r.fit_reason) : [];

  return (
    <>
      <PageTitle title="Recherche (En cours de développement 😶‍🌫️)" sub="Dis ce que tu cherches aujourd'hui. Valide tes critères (ils remplacent les précédents), puis prépare ta journée : l'app choisit tes meilleures offres et ouvre le Tri rapide." />

      {day && (
        <section className="mb-6 rounded-2xl border border-line bg-surface p-4 md:p-5" aria-label="Ma journée">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="min-w-0">
              <p className="heading flex items-center gap-2"><CalendarCheck size={18} className="text-marigold-deep" /> Ma journée</p>
              <p className="mt-0.5 text-sm text-muted">
                {plural(day.total, "offre préparée", "offres préparées")}, {day.yes} retenue{day.yes > 1 ? "s" : ""} sur {quota} visée{quota > 1 ? "s" : ""}
                {day.no ? `, ${day.no} écartée${day.no > 1 ? "s" : ""}` : ""}, {day.left} à trancher.
              </p>
            </div>
            <div className="ml-auto flex flex-wrap gap-2">
              {day.left > 0 && <Link href="/recommandees/tri?jour=1" className="btn btn-primary btn-sm"><Zap size={15} /> Reprendre le tri</Link>}
              <button type="button" className="btn btn-sm" disabled={working !== null} onClick={() => prepareDay(true)}>
                {working === "more" ? <><Loader2 size={15} className="animate-spin" /> Recherche…</> : <><Plus size={15} /> Voir d'autres offres du même type</>}
              </button>
            </div>
          </div>
        </section>
      )}

      <form onSubmit={(e) => e.preventDefault()} className="card mb-10 space-y-7 p-5 md:p-6">
        <div>
          <h2 className="heading">Mes critères</h2>
          <p className="mt-0.5 text-sm text-muted">
            {fromQuestionnaire ? "Repris de ton questionnaire : change ce que tu veux pour aujourd'hui." : "Change ce que tu veux pour aujourd'hui."} Les nouveaux critères remplacent les anciens.{!fromQuestionnaire && savedAt ? ` Dernier enregistrement : ${fmtDate(savedAt)}` : ""}
          </p>
        </div>

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
          <fieldset>
            <legend className="heading">Contrat</legend>
            <ChipGroup multi className="mt-2" label="Types de contrat" options={CONTRACTS.map((x) => x.label)}
              value={c.contracts.map((id) => CONTRACTS.find((x) => x.id === id)?.label ?? "")}
              onChange={(v) => setC({ ...c, contracts: v.map((l) => CONTRACTS.find((x) => x.label === l)?.id ?? "") })} />
            <p className="mt-1.5 text-sm text-muted">{c.contracts.length ? "Clique à nouveau pour retirer un choix. Les stages et alternances n'apparaissent que si tu les coches." : "Aucun choix : tous les contrats sont proposés, sauf stages et alternances."}</p>
          </fieldset>
          <fieldset>
            <legend className="heading">Publiées depuis</legend>
            <ChipGroup keepOne className="mt-2" label="Période" options={SINCE.map((x) => x.label)} value={[SINCE.find((x) => x.id === c.publishedWithin)?.label ?? ""]}
              onChange={(v) => { const id = SINCE.find((x) => x.label === v[0])?.id; if (id) setC({ ...c, publishedWithin: id as SearchCriteria["publishedWithin"] }); }} />
          </fieldset>
        </div>

        <div className="grid gap-x-12 gap-y-7 lg:grid-cols-2">
          <fieldset className="space-y-2">
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
          </fieldset>
          <fieldset>
            <legend className="heading">Candidatures par jour</legend>
            <p className="mt-0.5 text-sm text-muted">La taille de ta liste du jour.</p>
            <input aria-label="Candidatures visées par jour" type="number" min={1} max={MAX_DAILY_QUOTA} className="field mt-2 !w-24 text-center" value={quota}
              onChange={(e) => setQuota(Number(e.target.value))}
              onBlur={() => setQuota((q) => Math.max(1, Math.min(MAX_DAILY_QUOTA, Math.round(q) || DEFAULT_DAILY_QUOTA)))} />
          </fieldset>
        </div>

        <div className="grid gap-4 border-t border-line pt-6 md:grid-cols-2">
          <div>
            <button type="button" className="btn btn-xl w-full justify-center" onClick={onSave} disabled={working !== null}>
              {working === "save" ? <><Loader2 size={18} className="animate-spin" /> Enregistrement…</> : <><span className="grid h-6 w-6 place-items-center rounded-full bg-ink text-xs font-bold text-paper" aria-hidden>1</span> Valider mes critères</>}
            </button>
            <p className="mt-2 text-sm text-muted">{dirty || fromQuestionnaire ? "Garde ces critères à la place des précédents. La recherche automatique du matin les suit." : "Critères enregistrés. La recherche automatique du matin les suit."}</p>
          </div>
          <div>
            <button type="button" className="btn btn-primary btn-xl w-full justify-center" onClick={() => prepareDay(false)} disabled={working !== null}>
              {working === "day" ? <><Loader2 size={18} className="animate-spin" /> Je prépare ta liste…</> : <><span className="grid h-6 w-6 place-items-center rounded-full bg-chrome text-xs font-bold text-marigold" aria-hidden>2</span> Préparer ma journée ({quota})</>}
            </button>
            <p className="mt-2 text-sm text-muted">Choisit tes {quota} meilleures offres parmi celles déjà reçues (et cherche sur le web s'il en manque), puis ouvre le Tri rapide. Pas d'IA ici : l'analyse complète se lance quand tu prépares le CV d'une offre retenue.</p>
          </div>
        </div>

        {err && (
          <p className="rounded-xl bg-bad/10 p-3 text-sm text-bad" role="alert">
            {err}
          </p>
        )}
        {notice && (
          <p className="rounded-xl bg-marigold/10 p-3 text-sm" role="status">
            {notice}
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

      {auto && (
        <Section title="Explorer le web">
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn" disabled={busy} onClick={() => run()}>{busy ? <><Loader2 size={16} className="animate-spin" /> Recherche…</> : <><SearchIcon size={16} /> Voir les offres trouvées avec ces critères</>}</button>
            <p className="text-sm text-muted">Un aperçu pour parcourir à la main. Pour gagner du temps, « Préparer ma journée » fait le tri pour toi.</p>
          </div>
        </Section>
      )}

      {results && report.some((r) => !r.ok) && (
        <p className="mb-3 rounded-xl bg-marigold/10 p-3 text-sm" role="status">
          {report.filter((r) => !r.ok).map((r) => `${r.label} n'a pas répondu (${r.error}).`).join(" ")} Les autres sources ont répondu.
        </p>
      )}
      {results && (
        <Section title={`${shown.length} offre${shown.length > 1 ? "s" : ""}`}
          aside={shown.some((r) => r.quick_score >= 50) && <button className="btn btn-sm" onClick={storeTop} disabled={busy}><Bookmark size={15} /> Ranger les bonnes pistes et celles à regarder</button>}>
          {far > 0 && (
            <label className="mb-3 flex items-start gap-2 text-sm">
              <input type="checkbox" checked={showFar} onChange={(e) => setShowFar(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-marigold)]" />
              <span>Afficher aussi {plural(far, "offre éloignée", "offres éloignées")} de mes postes {!showFar && <span className="text-muted">(masquée{far > 1 ? "s" : ""})</span>}</span>
            </label>
          )}
          {!shown.length ? <Empty>Aucune offre. Élargis la zone, la période ou les mots-clés.</Empty> : (
            <ul className="list">
              {shown.map((o) => (
                <li key={o.key} className="px-4 py-3">
                  <div className="flex items-start gap-3">
                    <div className="w-[5.6rem] shrink-0 pt-0.5 text-center"><ScorePill value={o.quick_score} estimate /></div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold leading-snug">{o.title}</p>
                      <p className="text-sm text-muted">{[o.company, o.location, o.contract, o.salary].filter(Boolean).join(", ")}</p>
                      <p className="text-xs text-muted">{[o.experience, o.date ? `publiée le ${fmtDate(o.date)}` : "", `via ${o.source}`].filter(Boolean).join(", ")}</p>
                      {o.matched.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1">{o.matched.map((m) => <span key={m} className="tag tag-good">{m}</span>)}</div>}
                      {o.penalties.length > 0 && <p className="mt-1 text-xs text-bad">{o.penalties.join(" ; ")}</p>}
                      {o.fit_reason && <p className="mt-1 text-xs text-muted">Éloignée de tes postes visés.</p>}
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

      <Section title="Recherches automatiques">
        {!saved.length ? <Empty>Aucune. « Valider mes critères » crée la recherche du matin : ses nouvelles offres arrivent dans Recommandées.</Empty> : (
          <ul className="list">
            {saved.map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                <button className="min-w-0 flex-1 text-left" onClick={() => { setC({ ...DEFAULT, ...s.criteria }); setZone(s.criteria.cities?.length ? zone : zoneOf(s.criteria.departments ?? [])); if (auto) run(s.criteria); }}>
                  <p className="truncate font-semibold">{s.name}</p>
                  <p className="text-sm text-muted">{s.auto ? "Relancée chaque matin" : "En pause"}{s.criteria.keywords ? `, ${s.criteria.keywords}` : ""}</p>
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
