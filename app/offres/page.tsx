import Link from "next/link";
import { Plus } from "lucide-react";
import { httpUrlOrNull, normalizeJobUrl } from "@/lib/fetch-offer";
import { requireUser } from "@/lib/supabase/server";
import { PageTitle, Empty } from "@/components/ui/page-title";
import { fmtDate } from "@/lib/format";
import { statusLabel } from "@/lib/types";
import type { ListItem } from "@/lib/offers-filter";
import { pickApplication } from "@/lib/app-pick";
import { OffersWorkspace } from "@/components/offers-workspace";
import { partitionOffers } from "@/lib/offers-todo";
import { fetchAll } from "@/lib/paged";
import { hasPostedColumn } from "@/lib/posted-db";
import { whenLabel } from "@/lib/posted";
import { indexRecoDates, lineWhen, type RecoDate } from "@/lib/offers-when";

export const dynamic = "force-dynamic";
export const metadata = { title: "Offres & CV" };

export default async function Offres() {
  const { supabase } = await requireUser();
  const withPosted = await hasPostedColumn(supabase); // date de publication sur le site (mise à jour 7) : lue seulement si la colonne existe
  const [{ data: offers }, { data: apps }, { data: docs }, { data: loose }, { data: waitingRecos }, texts, recoDates] = await Promise.all([
    // toutes les offres : avec `limit(300)`, une vieille offre « À postuler » disparaissait de cette liste dès que 300 offres plus récentes existaient
    fetchAll((a, b) => supabase.from("offers").select("id, title, company, location, url, score, decision, created_at, analysis->company_type, analysis->estimated").order("created_at", { ascending: false }).order("id").range(a, b)),
    // toutes les lignes, page après page : Supabase coupe sinon à 1 000 sans le dire
    fetchAll((a, b) => supabase.from("applications").select("offer_id, status").not("offer_id", "is", null).order("id").range(a, b)),
    fetchAll((a, b) => supabase.from("documents").select("offer_id").eq("kind", "cv").order("id").range(a, b)),
    // « Je candidate » sans analyse : la candidature est déjà « À postuler », l'offre n'a simplement pas encore été analysée
    fetchAll((a, b) => supabase.from("applications").select("id, title, company, location, url, created_at").eq("status", "a_postuler").is("offer_id", null).order("id").range(a, b)),
    // Offres déjà analysées mais pas encore tranchées dans Recommandées : elles y restent (avec leur score) tant que tu n'as rien décidé
    fetchAll((a, b) => supabase.from("recommendations").select("offer_id").in("status", ["new", "analyzed"]).not("offer_id", "is", null).order("id").range(a, b)),
    // Lignes qui portent déjà un texte d'annonce collé ou gardé (leurs identifiants seulement) ; table absente (base pas encore à jour) : aucune, sans erreur
    fetchAll((a, b) => supabase.from("application_texts").select("application_id").order("application_id").range(a, b)),
    // Dates des recommandations (rattachées à une offre analysée ou à une adresse) : la date de publication d'une ligne vient de là
    fetchAll((a, b) => supabase.from("recommendations").select(withPosted ? "offer_id, url, received_at, origin, posted_at" : "offer_id, url, received_at, origin").order("id").range(a, b)),
  ]);
  const dates = indexRecoDates(recoDates.error ? [] : (recoDates.data as unknown as RecoDate[]), normalizeJobUrl);
  const withText = new Set(texts.error ? [] : texts.data.map((t) => t.application_id as string));
  // Une offre peut avoir plusieurs lignes dans Suivi (doublons) : on retient celle qui est la plus avancée
  const byOffer = new Map<string, { status: string }[]>();
  for (const a of apps ?? []) byOffer.set(a.offer_id, [...(byOffer.get(a.offer_id) ?? []), a]);
  const status = new Map([...byOffer].map(([id, rows]) => [id, pickApplication(rows)!.status]));
  // Cette page ne garde que ce qu'il reste à faire : offres « À postuler », ou analysées à la main et pas encore tranchées.
  // Une offre venue de Recommandées et pas encore décidée y reste ; postulées, abandonnées, refusées… sont dans Suivi ; les offres écartées nourrissent l'apprentissage sans encombrer la liste.
  const { todo, waiting, elsewhere: hidden } = partitionOffers(offers ?? [], status, new Set((waitingRecos ?? []).map((r) => r.offer_id as string)));
  const cvCount = new Map<string, number>();
  for (const d of docs ?? []) cvCount.set(d.offer_id, (cvCount.get(d.offer_id) ?? 0) + 1);
  /** Date de la ligne (publication sur le site si on la connaît, sinon arrivée de l'alerte, sinon ajout) : `at` pour le tri, `meta` pour l'affichage. */
  const datesOf = (line: { offer_id: string | null; url: string | null; created_at: string }, lead: string) => {
    const w = lineWhen(dates, line, normalizeJobUrl);
    return { at: w.at ?? line.created_at, atKind: w.kind, meta: `${lead}, ${whenLabel(w) || fmtDate(line.created_at)}` };
  };
  const items: ListItem[] = [
    ...todo.map((o): ListItem => ({
      key: o.id, kind: "offer", href: `/offres/${o.id}`, ad: httpUrlOrNull((o as unknown as { url?: string | null }).url), score: o.score as number | null, rough: Boolean((o as unknown as { estimated?: boolean | null }).estimated), title: o.title as string, company: (o.company as string | null) ?? "",
      sub: [o.company, o.location, (o as unknown as { company_type?: string | null }).company_type].filter(Boolean).join(", "),
      state: status.has(o.id) ? statusLabel(status.get(o.id)!) : null,
      ...datesOf({ offer_id: o.id as string, url: (o as unknown as { url?: string | null }).url ?? null, created_at: o.created_at as string }, `${cvCount.get(o.id) ? `${cvCount.get(o.id)} CV` : "Aucun CV"}`),
      cv: cvCount.get(o.id) ?? 0,
    })),
    ...(loose ?? []).map((a): ListItem => ({
      // Un clic ouvre la fiche : l'analyse se lance (lien prérempli, ou texte à coller) puis la fiche s'affiche, rattachée à cette candidature.
      // Pas de pourcentage : sans analyse complète, il n'y en a pas (un ancien pré-tri copié dans le suivi n'est pas un score).
      key: a.id, kind: "app", href: `/offres/nouvelle?auto=1&app=${a.id}${a.url ? `&url=${encodeURIComponent(a.url)}` : "&needtext=1"}`, ad: httpUrlOrNull(a.url), score: null, title: a.title as string, company: (a.company as string | null) ?? "",
      sub: [a.company, a.location].filter(Boolean).join(", "),
      state: statusLabel("a_postuler"),
      ...datesOf({ offer_id: null, url: (a.url as string | null) ?? null, created_at: a.created_at as string }, "À analyser"),
      cv: 0, hasText: withText.has(a.id as string),
    })),
  ].sort((a, b) => b.at.localeCompare(a.at)); // les plus récentes d'abord ; la liste se retrie à l'écran (récentes, anciennes, score)

  return (
    <>
      <PageTitle title="Offres & CV" sub="Les offres à postuler, leur score et les CV générés pour elles. Celles que tu n'as pas encore tranchées restent dans Recommandées, les candidatures envoyées sont dans Suivi.">
        <Link href="/offres/nouvelle" className="btn btn-primary"><Plus size={16} /> Analyser une offre</Link>
      </PageTitle>
      {!items.length ? (
        <Empty action={<Link href="/offres/nouvelle" className="btn btn-primary">{offers?.length ? "Analyser une offre" : "Analyser ma première offre"}</Link>}>
          {offers?.length
            ? "Rien à traiter ici : tes offres sont dans Suivi ou attendent ta décision dans Recommandées. Colle un lien ou le texte d'une annonce pour en analyser une nouvelle."
            : "Aucune offre analysée. Colle un lien ou le texte d'une annonce pour obtenir ton score et un CV sur mesure."}
        </Empty>
      ) : (
        <OffersWorkspace
          items={items}
          lines={(loose ?? []).map((a) => ({ id: a.id as string, title: a.title as string, url: (a.url as string | null) ?? null }))}
          // Offres déjà analysées avec une adresse : « Vérifier les annonces » les relit aussi (une annonce peut disparaître après son analyse)
          offerLines={todo.flatMap((o) => { const url = httpUrlOrNull((o as unknown as { url?: string | null }).url); return url ? [{ id: o.id as string, title: o.title as string, url, kind: "offer" as const, cv: cvCount.get(o.id) ?? 0 }] : []; })}
        />
      )}
      {waiting > 0 && (
        <p className="mt-4 text-sm text-muted">
          {waiting} {waiting > 1 ? "offres analysées attendent" : "offre analysée attend"} ta décision dans <Link href="/recommandees" className="link font-semibold">Recommandées</Link>, avec {waiting > 1 ? "leur score" : "son score"}.
        </p>
      )}
      {hidden > 0 && (
        <p className="mt-4 text-sm text-muted">
          {hidden} {hidden > 1 ? "autres offres sont" : "autre offre est"} déjà dans <Link href="/suivi" className="link font-semibold">Suivi</Link> (postulées, abandonnées ou refusées).
        </p>
      )}
    </>
  );
}
