"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Logo } from "@/components/nav";
import { CvUpload } from "@/components/cv-upload";
import { Combobox, type Opt } from "@/components/ui/combobox";
import { ZonePicker } from "@/components/zone-picker";
import { JOB_OPTIONS, SECTOR_OPTIONS } from "@/lib/job-families";
import { ChipGroup } from "@/components/ui/chip-group";
import {
  APPS_PER_WEEK, AVAILABILITY, CONTRACT_OPTIONS, DAILY_QUOTA, REMOTE_OPTIONS, RESPONSES, SEARCH_SINCE, YEAR_BANDS,
  emptyAnswers, missingAnswers, withZoneText,
} from "@/lib/onboarding";
import type { OnboardingAnswers } from "@/lib/types";

const DRAFT = "jp-onboarding-v3";

const JOBS = JOB_OPTIONS;
const SECTORS = SECTOR_OPTIONS;
const toOpts = (xs: string[]): Opt[] => xs.map((x) => ({ id: x, label: x }));

// Défini hors du composant : sinon les champs perdent le focus à chaque frappe
function Q({ id, title, hint, required, error, children }: { id: string; title: string; hint?: string; required?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <fieldset id={`q-${id}`} className="scroll-mt-24">
      <legend className="heading text-[1.08rem]">
        {title} <span className="ml-1 align-middle text-xs font-normal text-muted">{required ? "obligatoire" : "facultatif"}</span>
      </legend>
      {hint && <p className="mt-0.5 text-sm text-muted">{hint}</p>}
      {children}
      {error && <p className="mt-2 text-sm font-semibold text-bad" role="alert">{error}</p>}
    </fieldset>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-7 border-t border-line pt-8 first:border-t-0 first:pt-0">
      <h2 className="display text-[1.7rem]">{title}</h2>
      {children}
    </section>
  );
}

export function OnboardingForm({ initial }: { initial?: Partial<OnboardingAnswers> }) {
  const router = useRouter();
  const [a, setA] = useState<OnboardingAnswers>({ ...emptyAnswers(), ...initial });
  const [step, setStep] = useState<1 | 2>(1);
  const [tried, setTried] = useState(false);
  const restored = useRef(false);
  const set = <K extends keyof OnboardingAnswers>(k: K) => (v: OnboardingAnswers[K]) => setA((x) => ({ ...x, [k]: v }));

  // Brouillon : si la page se recharge ou si tu pars un moment, tes réponses sont conservées
  useEffect(() => {
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT) ?? "null");
      if (d?.a) setA({ ...emptyAnswers(), ...d.a });
      if (d?.step === 2) setStep(2);
    } catch {}
    restored.current = true;
  }, []);
  useEffect(() => {
    if (!restored.current) return;
    try { localStorage.setItem(DRAFT, JSON.stringify({ a, step })); } catch {}
  }, [a, step]);

  const missing = useMemo(() => missingAnswers(a), [a]);
  const err = (key: string) => (tried ? missing.find((m) => m.key === key)?.message : undefined);
  const clearDraft = () => { try { localStorage.removeItem(DRAFT); } catch {} };

  function next(e: React.FormEvent) {
    e.preventDefault();
    if (missing.length) {
      setTried(true);
      const el = document.getElementById(`q-${missing[0].key}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      el?.querySelector<HTMLElement>("input, select, button")?.focus({ preventScroll: true });
      return;
    }
    setStep(2);
    window.scrollTo(0, 0);
  }

  async function signOut() {
    await supabaseBrowser().auth.signOut();
    router.replace("/");
    router.refresh();
  }

  async function skip() {
    const res = await fetch("/api/onboarding/skip", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ answers: withZoneText(a) }) })
      .then((r) => r.json()).catch(() => ({ error: "Connexion interrompue, réessaie." }));
    if (res.error) throw new Error(res.error);
    clearDraft();
    router.replace("/");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-2xl px-1 pb-10 pt-2 md:pt-0">
      <div className="flex items-center justify-between gap-3">
        <Logo />
        <button type="button" onClick={signOut} className="btn btn-ghost btn-sm"><LogOut size={15} /> Se déconnecter</button>
      </div>
      <div className="mt-8 flex items-center gap-3 text-sm text-muted">
        <span className="h-1.5 w-24 overflow-hidden rounded-full bg-line" aria-hidden><span className="block h-full rounded-full bg-marigold transition-all" style={{ width: step === 1 ? "50%" : "100%" }} /></span>
        Étape {step} sur 2
      </div>
      <h1 className="display mt-3 text-[2.3rem]">{step === 1 ? "Parle-moi de ta recherche" : "Dépose ton CV"}</h1>
      <p className="mt-2 text-muted">
        {step === 1
          ? "Deux minutes de questions. Elles règlent ta recherche d'offres et servent à juger ton CV par rapport à ce que tu vises vraiment. Seules les questions marquées « obligatoire » doivent être remplies."
          : "L'app en tire ton profil maître (la base de tous tes futurs CV) et un diagnostic franc : positionnement, crédibilité, lisibilité par les robots de tri, plan d'action."}
      </p>

      {step === 1 ? (
        <form className="mt-8 space-y-9" onSubmit={next} noValidate>
          <Block title="Ce que tu cherches">
            <Q id="target_roles" required title="Quels postes vises-tu ?" hint="Choisis dans la liste, rangée par familles de métiers, ou écris le tien. 5 postes au maximum." error={err("target_roles")}>
              <div className="mt-3">
                <Combobox label="Postes visés" placeholder="Cherche un poste : Data Analyst…" options={JOBS} allowCustom max={5} maxMessage="5 postes au maximum : retire-en un pour en ajouter un autre."
                  invalid={!!err("target_roles")} value={toOpts(a.target_roles)} onChange={(v) => set("target_roles")(v.map((o) => o.label))} />
              </div>
            </Q>
            <Q id="contracts" required title="Quels types de contrat ?" hint="Un ou plusieurs. Clique à nouveau sur un choix pour le retirer." error={err("contracts")}>
              <ChipGroup multi label="Types de contrat" options={CONTRACT_OPTIONS} value={a.contracts} onChange={set("contracts")} invalid={!!err("contracts")} />
            </Q>
            <Q id="sectors" title="Quels secteurs t'intéressent ?" hint="Laisse vide si tout t'intéresse. Tu peux aussi écrire le tien.">
              <div className="mt-3">
                <Combobox label="Secteurs" placeholder="Cherche un secteur : banque…" options={SECTORS} allowCustom max={6} maxMessage="6 secteurs au maximum."
                  value={toOpts(a.sectors)} onChange={(v) => set("sectors")(v.map((o) => o.label))} />
              </div>
            </Q>
          </Block>

          <Block title="Où">
            <Q id="zone" required title="Où cherches-tu ?" error={err("zone")}>
              <div className="mt-3">
                <ZonePicker value={a.zone} onChange={set("zone")} invalid={!!err("zone")} />
              </div>
            </Q>
            <Q id="remote" title="Présentiel ou télétravail ?" hint="Sans choix, on ne filtre pas.">
              <ChipGroup multi label="Mode de travail" options={REMOTE_OPTIONS} value={a.remote} onChange={set("remote")} />
            </Q>
          </Block>

          <Block title="Toi">
            <Q id="experience_years" required title="Combien d'années d'expérience as-tu ?" hint="Alternances et stages comptent, mais compte honnêtement. Coche plusieurs tranches si tu vises des niveaux différents." error={err("experience_years")}>
              <ChipGroup multi label="Années d'expérience" options={YEAR_BANDS.map((b) => b.label)} value={a.experience_years} onChange={set("experience_years")} invalid={!!err("experience_years")} />
            </Q>
            <Q id="availability" required title="Quand peux-tu commencer ?" error={err("availability")}>
              <ChipGroup label="Disponibilité" options={AVAILABILITY} value={a.availability ? [a.availability] : []} onChange={(v) => set("availability")(v[0] ?? "")} invalid={!!err("availability")} />
            </Q>
            <Q id="salary" title="Salaire visé" hint="Si tu as une idée. Elle ne sert qu'à te signaler les offres trop basses.">
              <input className="field mt-3 max-w-sm" placeholder="ex : 35-40 k€ brut par an" value={a.salary} onChange={(e) => set("salary")(e.target.value)} />
            </Q>
          </Block>

          <Block title="Ta recherche jusqu'ici">
            <Q id="search_since" required title="Où en est ta recherche ?" error={err("search_since")}>
              <ChipGroup label="Durée de la recherche" options={SEARCH_SINCE} value={a.search_since ? [a.search_since] : []} onChange={(v) => set("search_since")(v[0] ?? "")} invalid={!!err("search_since")} />
            </Q>
            <Q id="applications_per_week" required title="Combien de candidatures par semaine, en moyenne ?" error={err("applications_per_week")}>
              <ChipGroup label="Candidatures par semaine" options={APPS_PER_WEEK} value={a.applications_per_week ? [a.applications_per_week] : []} onChange={(v) => set("applications_per_week")(v[0] ?? "")} invalid={!!err("applications_per_week")} />
            </Q>
            <Q id="daily_quota" title="Combien de candidatures veux-tu envoyer par jour ?" hint="L'app te prépare ce nombre d'offres chaque jour (page Recherche). Tu pourras le changer quand tu veux.">
              <ChipGroup label="Candidatures par jour" options={DAILY_QUOTA} value={a.daily_quota ? [a.daily_quota] : []} onChange={(v) => set("daily_quota")(v[0] ?? "")} />
            </Q>
            <Q id="responses" title="Qu'est-ce que tu obtiens ?">
              <ChipGroup label="Réponses obtenues" options={RESPONSES} value={a.responses ? [a.responses] : []} onChange={(v) => set("responses")(v[0] ?? "")} />
            </Q>
            <Q id="blockers" title="Qu'est-ce qui coince, selon toi ?" hint="Une phrase suffit.">
              <textarea rows={3} aria-label="Ce qui coince dans ta recherche" className="field mt-3" value={a.blockers} onChange={(e) => set("blockers")(e.target.value)} />
            </Q>
          </Block>

          <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line bg-paper/90 px-4 py-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:px-0 md:backdrop-blur-none">
            <button className="btn btn-primary btn-xl">Continuer</button>
            <p className={`text-sm ${tried && missing.length ? "font-semibold text-bad" : "text-muted"}`} role="status">
              {missing.length ? `Il reste ${missing.length} ${missing.length > 1 ? "réponses obligatoires" : "réponse obligatoire"}.` : "Tout est rempli."}
            </p>
          </div>
        </form>
      ) : (
        <div className="mt-8">
          <CvUpload kind="onboarding" answers={withZoneText(a)} submitLabel="Lancer le diagnostic" onDone={clearDraft} onSkip={skip} skipLabel="Passer cette étape" />
          <button type="button" className="btn btn-sm btn-ghost mt-6" onClick={() => setStep(1)}>Revenir aux questions</button>
        </div>
      )}
    </div>
  );
}
