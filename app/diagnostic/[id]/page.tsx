import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { Gauge } from "@/components/ui/score";
import { Section } from "@/components/ui/page-title";
import { ApplyProfileButton } from "@/components/apply-profile-button";
import { AnalysisFailed, AnalysisProgress } from "@/components/analysis-progress";
import { diagState } from "@/lib/diagnostic-state";
import { fmtDate } from "@/lib/format";
import type { Profile } from "@/lib/types";
import { getT } from "@/lib/i18n/server";
import { tx } from "@/lib/i18n/translate";

export const dynamic = "force-dynamic";
export const metadata = { title: tx("Diagnostic") };

const SEV = { bloquant: "text-bad", important: "text-marigold-deep", mineur: "text-muted" } as const;
const PRIO = { haute: "text-bad", moyenne: "text-marigold-deep", basse: "text-muted" } as const;

export default async function DiagnosticPage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getT();
  const { id } = await params;
  const { supabase } = await requireUser();
  const [{ data: d }, { data: prof }] = await Promise.all([
    supabase.from("diagnostics").select("*").eq("id", id).maybeSingle(),
    supabase.from("profiles").select("data").maybeSingle(),
  ]);
  if (!d) notFound();
  const st = diagState(d.content, d.created_at);
  const title = d.kind === "onboarding" ? "Diagnostic d'accueil" : "Analyse de CV";
  const meta = `${title} du ${fmtDate(d.created_at)}${d.files?.length ? `, ${d.files.join(", ")}` : ""}`;

  // Analyse lancée en arrière-plan : on attend le résultat ici, la page se met à jour toute seule
  if (st.state !== "done") {
    return (
      <>
        <p className="text-sm text-muted">{t(meta)}</p>
        <h1 className="display mb-6 mt-3 text-[2rem] md:text-[2.5rem]">{st.state === "pending" ? t("Ton CV est en cours d'analyse") : t("Ton CV n'a pas pu être analysé")}</h1>
        {st.state === "pending" ? <AnalysisProgress startedAt={st.startedAt} /> : <AnalysisFailed id={d.id} message={st.message} canRetry={st.canRetry} detail={st.detail} />}
        {d.kind === "onboarding" && st.state === "pending" && (
          <p className="mt-5 max-w-[60ch] text-sm text-muted">{t("Tes réponses au questionnaire sont déjà enregistrées : tu peux déjà")} <Link className="link" href="/recherche">{t("chercher des offres")}</Link> {t("pendant l'analyse.")}</p>
        )}
      </>
    );
  }

  const c = st.diagnostic;
  const proposed = d.proposed_profile as Profile | null;
  const current = prof?.data as Profile | undefined;
  const order = { bloquant: 0, important: 1, mineur: 2 };
  const issues = [...(c.issues ?? [])].sort((a, b) => order[a.severity] - order[b.severity]);

  // Résumé de ce que la mise à jour du profil ajouterait
  const added = proposed && current && !d.applied
    ? {
        exps: proposed.experiences.length - current.experiences.length,
        achievements: proposed.experiences.reduce((n, e) => n + e.achievements.length, 0) - current.experiences.reduce((n, e) => n + e.achievements.length, 0),
        skills: Object.values(proposed.skills).flat().length - Object.values(current.skills).flat().length,
      }
    : null;

  return (
    <>
      <p className="text-sm text-muted">{t(meta)}</p>
      <div className="mb-8 mt-3 flex flex-col gap-5 sm:flex-row sm:items-center">
        <Gauge value={c.overall_score} size={136} label={t("qualité du CV")} />
        <div className="min-w-0 flex-1">
          <h1 className="display text-[2rem] md:text-[2.5rem]">
            {c.overall_score >= 85 ? t("Ton CV est prêt") : c.overall_score >= 60 ? t("Une bonne base, à retravailler") : t("Ton CV te dessert")}
          </h1>
          <p className="mt-2 max-w-prose">{t(c.verdict)}</p>
        </div>
      </div>

      {d.kind === "onboarding" && d.applied && (
        <div className="mb-8 rounded-2xl border border-good/40 bg-good/10 p-4">
          <p className="font-semibold">{t("Ton profil maître est prêt.")}</p>
          <p className="mt-1 text-sm">{t("Il regroupe tout ce que contiennent tes CV et sert de base à chaque CV généré pour une offre. Relis-le, puis analyse ta première offre.")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/profil" className="btn">{t("Relire mon profil")}</Link>
            <Link href="/offres/nouvelle" className="btn btn-primary">{t("Analyser une offre")}</Link>
          </div>
        </div>
      )}

      {added && (
        <div className="mb-8 rounded-2xl border border-marigold/50 bg-marigold/10 p-4">
          <p className="font-semibold">{t("Mettre à jour ton profil maître avec ce CV ?")}</p>
          <p className="mt-1 text-sm">
            {t("Rien n'est supprimé : l'app ajoute ce qui est nouveau")}
            {added.exps > 0 ? t(", dont {1} expérience{2}", [added.exps, added.exps > 1 ? "s" : ""]) : ""}
            {added.achievements > 0 ? t(", {1} réalisation{2}", [added.achievements, added.achievements > 1 ? "s" : ""]) : ""}
            {added.skills > 0 ? t(", {1} compétence{2}", [added.skills, added.skills > 1 ? "s" : ""]) : ""}.
          </p>
          <div className="mt-3"><ApplyProfileButton id={d.id} /></div>
        </div>
      )}

      {c.changes_since_last && c.changes_since_last.length > 0 && (
        <Section title={t("Ce qui a changé depuis la dernière fois")}>
          <ul className="list-disc space-y-1 pl-5">{c.changes_since_last.map((x) => <li key={x}>{t(x)}</li>)}</ul>
        </Section>
      )}

      <Section title={t("Plan d'action")}>
        <ol className="space-y-3">
          {(c.actions ?? []).map((a, i) => (
            <li key={i} className="flex gap-3">
              <span className="display text-xl text-muted">{i + 1}</span>
              <div><p className="font-semibold">{t(a.action)} <span className={`text-xs font-normal ${PRIO[a.priority]}`}>{t("priorité")} {t(a.priority)}</span></p><p className="text-sm text-muted">{t(a.why)}</p></div>
            </li>
          ))}
        </ol>
      </Section>

      <Section title={t("Positionnement")}>
        <p className="max-w-[66ch]">{t(c.positioning?.comment)}</p>
        <ul className="mt-3 space-y-2">
          {(c.positioning?.recommended_targets ?? []).map((r) => <li key={r.title}><p className="font-semibold">{t(r.title)}</p><p className="text-sm text-muted">{t(r.why)}</p></li>)}
        </ul>
      </Section>

      <Section title={t("À corriger")}>
        <ul className="space-y-3">
          {issues.map((x, i) => (
            <li key={i}>
              <p className="font-semibold">{t(x.issue)} <span className={`text-xs font-normal ${SEV[x.severity]}`}>{t(x.severity)}</span></p>
              <p className="text-sm text-muted">{t(x.fix)}</p>
            </li>
          ))}
        </ul>
      </Section>

      <div className="grid gap-x-10 md:grid-cols-2">
        <Section title={t("Tes points forts")}><ul className="list-disc space-y-1 pl-5">{(c.strengths ?? []).map((x) => <li key={x}>{t(x)}</li>)}</ul></Section>
        <Section title={t("Chiffres qui manquent")}><ul className="list-disc space-y-1 pl-5">{(c.missing_metrics ?? []).map((x) => <li key={x}>{t(x)}</li>)}</ul></Section>
        {(c.inconsistencies ?? []).length > 0 && <Section title={t("Incohérences repérées")}><ul className="list-disc space-y-1 pl-5">{c.inconsistencies.map((x) => <li key={x}>{t(x)}</li>)}</ul></Section>}
        <Section title={t("Lecture par les robots de tri (ATS)")}>
          <ul className="space-y-1">
            {(c.ats?.ok ?? []).map((x) => <li key={x} className="flex gap-2"><span className="text-good">✓</span>{t(x)}</li>)}
            {(c.ats?.problems ?? []).map((x) => <li key={x} className="flex gap-2"><span className="text-bad">✗</span>{t(x)}</li>)}
          </ul>
        </Section>
      </div>

      <Section title={t("Ta stratégie de recherche")}><p className="max-w-[66ch]">{t(c.search_strategy)}</p></Section>

      <div className="flex flex-wrap gap-2">
        <Link href="/mon-cv" className="btn">{t("Mes analyses de CV")}</Link>
        <Link href="/" className="btn btn-ghost">{t("Retour à l'accueil")}</Link>
      </div>
    </>
  );
}
