import { requireUser } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import { computeLearning } from "@/lib/learning";
import { RECO_COLS, toReco, type RecoRow } from "@/lib/reco-query";
import { PageTitle } from "@/components/ui/page-title";
import { SyncButton } from "@/components/sync-button";
import { RecoList } from "@/components/reco-list";

export const metadata = { title: "Recommandées" };
export const dynamic = "force-dynamic";

export default async function Recommandees() {
  const { supabase, user } = await requireUser();
  const sel = () => supabase.from("recommendations").select(RECO_COLS);
  const [todo, accepted, rejected, profile, learning] = await Promise.all([
    sel().in("status", ["new", "analyzed"]).order("received_at", { ascending: false }).limit(300),
    sel().eq("status", "accepted").order("decided_at", { ascending: false }).limit(60),
    sel().eq("status", "rejected").order("decided_at", { ascending: false }).limit(100),
    getProfile(supabase, user),
    computeLearning(supabase, user.id),
  ]);

  const rows = [...(todo.data ?? []), ...(accepted.data ?? []), ...(rejected.data ?? [])] as unknown as RecoRow[];
  const recos = rows.map((r) => toReco(r, profile, learning));

  const rules = [
    learning.blockedCompanies.length ? `Entreprises masquées : ${learning.blockedCompanies.join(", ")}` : null,
    learning.penaltyWords.length ? `Titres pénalisés quand ils contiennent : ${learning.penaltyWords.join(", ")}` : null,
    learning.boostWords.length ? `Titres favorisés : ${learning.boostWords.join(", ")}` : null,
    ...(profile.preferences.max_years != null ? [`Offres exigeant plus de ${profile.preferences.max_years} ans d'expérience pénalisées`] : []),
  ].filter(Boolean) as string[];

  return (
    <>
      <PageTitle title="Recommandées" sub="Les offres trouvées dans tes alertes emploi et tes recherches, triées par compatibilité. Chaque choix affine les suivantes.">
        <SyncButton label="Chercher maintenant" />
      </PageTitle>
      <RecoList recos={recos} rules={rules} decided={learning.decided} reasons={learning.reasons} />
    </>
  );
}
