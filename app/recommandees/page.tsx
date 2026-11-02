import { requireUser } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import { computeLearning } from "@/lib/learning";
import { ensureFit } from "@/lib/fit-stock";
import { RECO_COLS, toReco, type RecoRow } from "@/lib/reco-query";
import { PageTitle } from "@/components/ui/page-title";
import { SyncButton } from "@/components/sync-button";
import { RecoList } from "@/components/reco-list";

export const metadata = { title: "Recommandées" };
export const dynamic = "force-dynamic";

export default async function Recommandees() {
  const { supabase, user } = await requireUser();
  const sel = () => supabase.from("recommendations").select(RECO_COLS);
  const profile = await getProfile(supabase, user);
  await ensureFit(supabase, user.id, profile).catch(() => null); // profil ou recherche modifiés : les offres déjà reçues sont revues une fois
  const [todo, accepted, rejected, hidden, learning] = await Promise.all([
    sel().in("status", ["new", "analyzed"]).order("received_at", { ascending: false }).limit(300),
    sel().eq("status", "accepted").order("decided_at", { ascending: false }).limit(60),
    sel().eq("status", "rejected").order("decided_at", { ascending: false }).limit(100),
    sel().eq("status", "filtered").order("received_at", { ascending: false }).limit(150),
    computeLearning(supabase, user.id),
  ]);

  const rows = [...(todo.data ?? []), ...(accepted.data ?? []), ...(rejected.data ?? []), ...(hidden.data ?? [])] as unknown as RecoRow[];
  const recos = rows.map((r) => toReco(r, profile, learning));

  const rules = [
    learning.blockedCompanies.length ? `Entreprises masquées : ${learning.blockedCompanies.join(", ")}` : null,
    learning.penaltyWords.length ? `Titres pénalisés quand ils contiennent : ${learning.penaltyWords.join(", ")}` : null,
    learning.boostWords.length ? `Titres favorisés : ${learning.boostWords.join(", ")}` : null,
    ...(profile.preferences.contracts?.length ? [`Offres masquées (onglet Masquées) : ${[...["Stage", "Alternance"].filter((k) => !profile.preferences.contracts.includes(k)).map((k) => k.toLowerCase()), "métiers éloignés de tes postes"].join(", ")}`] : []),
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
