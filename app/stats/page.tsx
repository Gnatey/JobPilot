import { requireUser } from "@/lib/supabase/server";
import { computeStats } from "@/lib/stats";
import { PageTitle, Section, Empty } from "@/components/ui/page-title";
import { WeeklyChart, StatusDonut, RateList } from "@/components/stats-charts";
import { InsightsButton } from "@/components/insights-button";
import { rejectLabel } from "@/lib/types";
import { fmtDate } from "@/lib/format";
import type { Insights } from "@/lib/ai";

export const dynamic = "force-dynamic";
export const metadata = { title: "Stats" };

export default async function Stats() {
  const { supabase } = await requireUser();
  const [stats, { data: insight }] = await Promise.all([
    computeStats(supabase),
    supabase.from("insights").select("content, created_at").order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const t = stats.totals;
  const ins = insight?.content as (Insights & { sample?: number }) | undefined;
  const PRIO = { haute: "text-bad", moyenne: "text-marigold-deep", basse: "text-muted" } as const;

  return (
    <>
      <PageTitle title="Stats" sub="Où ta recherche avance, où elle bloque, et quoi changer.">
        <InsightsButton />
      </PageTitle>

      <Section title="Le conseil de la semaine" aside={insight && <span className="text-sm text-muted">Analyse du {fmtDate(insight.created_at)}, sur {ins?.sample ?? 0} candidatures</span>}>
        {!ins ? (
          <Empty>Clique sur « Analyser mes résultats » : l'IA lit tes chiffres et te dit quoi changer. Plus utile à partir d'une quinzaine de candidatures envoyées.</Empty>
        ) : (
          <div className="grid gap-6 md:grid-cols-[1.3fr_1fr]">
            <div>
              <p className="max-w-prose text-[1.05rem] leading-relaxed">{ins.diagnosis}</p>
              <p className="mt-4 rounded-xl border-l-4 border-marigold bg-surface px-4 py-3 font-semibold">{ins.weekly_goal}</p>
            </div>
            <ol className="space-y-3">
              {ins.actions.map((a, i) => (
                <li key={i} className="flex gap-3">
                  <span className="display text-xl text-muted">{i + 1}</span>
                  <div><p className="font-semibold">{a.action} <span className={`text-xs font-normal ${PRIO[a.priority]}`}>priorité {a.priority}</span></p><p className="text-sm text-muted">{a.why}</p></div>
                </li>
              ))}
            </ol>
          </div>
        )}
      </Section>

      <Section title="Tes chiffres clés">
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            ["Taux de réponse", `${t.response_rate} %`, "Réponses reçues ÷ candidatures envoyées"],
            ["Taux d'entretien", `${t.interview_rate} %`, "Entretiens obtenus ÷ candidatures envoyées"],
            ["Délai moyen de réponse", t.avg_days_to_response != null ? `${t.avg_days_to_response} j` : "—", "Entre l'envoi et la première réponse"],
            ["Sans nouvelles", `${t.ghosted}`, "Envoyées depuis plus de 3 semaines, sans réponse"],
          ].map(([k, v, help]) => (
            <div key={k} className="card !p-4"><dt className="text-sm font-semibold">{k}</dt><dd className="display mt-1 text-[2rem] tabular-nums">{v}</dd><dd className="mt-0.5 text-xs text-muted">{help}</dd></div>
          ))}
        </dl>
      </Section>

      <Section title="Où en sont tes candidatures">
        {t.tracked ? <StatusDonut parts={stats.by_status} /> : <Empty>Aucune candidature pour l'instant. Elles apparaîtront ici dès que tu en ajoutes une dans le Suivi.</Empty>}
      </Section>

      <Section title="Candidatures par semaine">
        <WeeklyChart weeks={stats.weeks} />
      </Section>

      <Section title="Qu'est-ce qui marche le mieux ?" aside={<span className="hidden text-sm text-muted sm:inline">Compté sur les candidatures envoyées</span>}>
        {t.sent < 10 && (
          <p className="mb-5 rounded-xl border-l-4 border-marigold bg-surface px-4 py-3 text-sm">
            Il est trop tôt pour comparer : avec {t.sent} candidature{t.sent > 1 ? "s" : ""} envoyée{t.sent > 1 ? "s" : ""}, un seul retour change tous les pourcentages. Reviens quand tu en auras une dizaine.
          </p>
        )}
        <div className="grid gap-x-12 gap-y-8 md:grid-cols-2">
          <div><h3 className="heading mb-3">Selon le site où tu as trouvé l'offre</h3><RateList rows={stats.by_channel} /></div>
          <div><h3 className="heading mb-3">Selon le CV envoyé</h3><RateList rows={stats.by_variant} /></div>
          <div><h3 className="heading mb-3">Selon le score de compatibilité</h3><RateList rows={stats.by_score} /></div>
          <div><h3 className="heading mb-3">Selon le type de contrat</h3><RateList rows={stats.by_contract} /></div>
        </div>
      </Section>

      <Section title="Tri des offres proposées">
        <p className="text-muted">
          {stats.triage.received} reçues : {stats.triage.accepted} acceptées, {stats.triage.rejected} écartées, {stats.triage.pending} à trier
          {stats.triage.acceptance_rate != null ? `. Tu retiens ${stats.triage.acceptance_rate} % des offres que tu tries.` : "."}
        </p>
        {Object.keys(stats.triage.reject_reasons).length > 0 && (
          <table className="mt-3 w-full max-w-md text-sm">
            <tbody className="divide-y divide-line">
              {Object.entries(stats.triage.reject_reasons).sort((a, b) => b[1] - a[1]).map(([k, n]) => (
                <tr key={k}><td className="py-1.5">{rejectLabel(k)}</td><td className="py-1.5 text-right tabular-nums">{n}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </>
  );
}
