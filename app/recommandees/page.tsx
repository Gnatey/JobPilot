import { requireUser } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import { computeLearning } from "@/lib/learning";
import { ensureFit } from "@/lib/fit-stock";
import { archiveOld } from "@/lib/reco-age-db";
import { toReco, olderThanLoaded, type RecoRow } from "@/lib/reco-query";
import { recoCols } from "@/lib/posted-db";
import { PageTitle } from "@/components/ui/page-title";
import { SyncButton } from "@/components/sync-button";
import { RecoList } from "@/components/reco-list";

export const metadata = { title: "Recommandées" };
export const dynamic = "force-dynamic";

export default async function Recommandees() {
  const { supabase, user } = await requireUser();
  const cols = await recoCols(supabase); // avec la date de publication quand la base est à jour (mise à jour 7)
  const sel = () => supabase.from("recommendations").select(cols);
  const profile = await getProfile(supabase, user);
  await ensureFit(supabase, user.id, profile).catch(() => null); // profil ou recherche modifiés : les offres déjà reçues sont revues une fois
  await archiveOld(supabase, user.id); // offres non décidées depuis plus de 3 semaines : rangées dans Masquées (« Garder dans ma liste » les remet)
  // Chaque onglet affiche les offres les plus récentes (la page reste légère) ; les totaux exacts viennent de requêtes de comptage,
  // pour que le chiffre de l'onglet ne s'arrête jamais en silence à la taille de la liste
  const total = () => supabase.from("recommendations").select("id", { count: "exact", head: true });
  const [todo, accepted, rejected, hidden, learning, nTodo, nTodoFit, nAccepted, nRejected, nHidden] = await Promise.all([
    sel().in("status", ["new", "analyzed"]).order("received_at", { ascending: false }).limit(300),
    sel().eq("status", "accepted").order("decided_at", { ascending: false }).limit(60),
    sel().eq("status", "rejected").order("decided_at", { ascending: false }).limit(100),
    sel().eq("status", "filtered").order("received_at", { ascending: false }).limit(150),
    computeLearning(supabase, user.id),
    total().in("status", ["new", "analyzed"]),
    total().in("status", ["new", "analyzed"]).eq("senior", false),
    total().eq("status", "accepted"),
    total().eq("status", "rejected"),
    total().eq("status", "filtered"),
  ]);
  const more = olderThanLoaded;
  const todoRows = (todo.data ?? []) as unknown as RecoRow[];
  const rest = {
    todo: more(nTodo.count, todoRows.length),
    todoFit: more(nTodoFit.count, todoRows.filter((r) => !r.senior).length),
    accepted: more(nAccepted.count, accepted.data?.length ?? 0),
    rejected: more(nRejected.count, rejected.data?.length ?? 0),
    hidden: more(nHidden.count, hidden.data?.length ?? 0),
  };

  const rows = [...(todo.data ?? []), ...(accepted.data ?? []), ...(rejected.data ?? []), ...(hidden.data ?? [])] as unknown as RecoRow[];
  const recos = rows.map((r) => toReco(r, profile, learning));

  const rules = [
    learning.blockedCompanies.length ? `Entreprises masquées : ${learning.blockedCompanies.join(", ")}` : null,
    learning.penaltyWords.length ? `Titres pénalisés quand ils contiennent : ${learning.penaltyWords.join(", ")}` : null,
    learning.boostWords.length ? `Titres favorisés : ${learning.boostWords.join(", ")}` : null,
    ...(profile.preferences.contracts?.length ? [`Offres masquées (onglet Masquées) : ${[...["Stage", "Alternance"].filter((k) => !profile.preferences.contracts.includes(k)).map((k) => k.toLowerCase()), "métiers éloignés de tes postes"].join(", ")}`] : []),
    `Offres sans décision depuis plus de 3 semaines : rangées dans Masquées (« Garder dans ma liste » les remet)`,
    ...(profile.preferences.max_years != null ? [`Offres exigeant plus de ${profile.preferences.max_years} ans d'expérience pénalisées`] : []),
  ].filter(Boolean) as string[];

  return (
    <>
      <PageTitle title="Recommandées" sub="Les offres trouvées dans tes alertes emploi et tes recherches, triées par compatibilité. Chaque choix affine les suivantes.">
        <SyncButton label="Chercher maintenant" />
      </PageTitle>
      <RecoList recos={recos} rest={rest} rules={rules} decided={learning.decided} reasons={learning.reasons} />
    </>
  );
}
