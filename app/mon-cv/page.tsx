import Link from "next/link";
import { Loader2 } from "lucide-react";
import { requireUser } from "@/lib/supabase/server";
import { PageTitle, Section, Empty } from "@/components/ui/page-title";
import { ScorePill } from "@/components/ui/score";
import { CvUpload } from "@/components/cv-upload";
import { AutoRefresh } from "@/components/auto-refresh";
import { diagState } from "@/lib/diagnostic-state";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mon CV" };

export default async function MonCv() {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("diagnostics").select("id, kind, files, content, applied, created_at").order("created_at", { ascending: false }).limit(30);
  const list = (data ?? []).map((d) => ({ ...d, st: diagState(d.content, d.created_at) }));
  const scores = list.flatMap((d) => (d.st.state === "done" ? [d.st.diagnostic.overall_score] : [])).reverse();
  const running = list.some((d) => d.st.state === "pending");

  return (
    <>
      <AutoRefresh active={running} />
      <PageTitle title="Mon CV" sub="Redépose ton CV quand tu le modifies : l'app l'analyse, te dit ce qui a progressé et peut mettre ton profil maître à jour." >
        <Link href="/bienvenue" className="btn">Refaire le questionnaire</Link>
      </PageTitle>

      <Section title="Analyser une nouvelle version">
        <CvUpload kind="refresh" submitLabel="Analyser ce CV" />
      </Section>

      <Section title="Contrôler mes CV">
        <p className="max-w-[62ch] text-muted">Compare chaque CV enregistré à ton profil maître : une formation absente, un poste ou des dates qui ne collent pas, un chiffre que ton profil ne dit pas. Rien n'est modifié.</p>
        <Link href="/mon-cv/controle" className="btn mt-3">Contrôler mes CV</Link>
      </Section>

      <Section title="Historique" aside={scores.length > 1 && <span className="text-sm text-muted">Score : {scores.join(" → ")}</span>}>
        {!list.length ? <Empty>Aucune analyse pour l'instant.</Empty> : (
          <ul className="list">
            {list.map((d) => (
              <li key={d.id}>
                <Link href={`/diagnostic/${d.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-paper/60">
                  {d.st.state === "done" ? <ScorePill value={d.st.diagnostic.overall_score} />
                    : d.st.state === "pending" ? <span className="tag tag-warn gap-1"><Loader2 size={13} className="animate-spin" /> En cours</span>
                    : <span className="tag tag-bad">Échouée</span>}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{d.kind === "onboarding" ? "Diagnostic d'accueil" : "Analyse de CV"}, {fmtDate(d.created_at)}</p>
                    <p className="truncate text-sm text-muted">
                      {d.files?.join(", ")}{d.st.state === "done" && !d.applied ? ", profil pas encore mis à jour" : ""}{d.st.state === "error" ? `, ${d.st.canRetry ? "à relancer" : "à refaire"}` : ""}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
