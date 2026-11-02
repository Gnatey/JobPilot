import Link from "next/link";
import { Plus } from "lucide-react";
import { requireUser } from "@/lib/supabase/server";
import { PageTitle, Empty } from "@/components/ui/page-title";
import { ScorePill } from "@/components/ui/score";
import { fmtDate } from "@/lib/format";
import { statusLabel } from "@/lib/types";
import { OfferRowDelete } from "@/components/offer-row-delete";
import { pickApplication } from "@/lib/app-pick";

export const dynamic = "force-dynamic";
export const metadata = { title: "Offres & CV" };

export default async function Offres() {
  const { supabase } = await requireUser();
  const [{ data: offers }, { data: apps }, { data: docs }, { data: loose }] = await Promise.all([
    supabase.from("offers").select("id, title, company, location, score, decision, created_at, analysis->company_type").order("created_at", { ascending: false }).limit(300),
    supabase.from("applications").select("offer_id, status").not("offer_id", "is", null),
    supabase.from("documents").select("offer_id").eq("kind", "cv"),
    // « Je candidate » sans analyse : la candidature est déjà « À postuler », l'offre n'a simplement pas encore été analysée
    supabase.from("applications").select("id, title, company, location, url, created_at").eq("status", "a_postuler").is("offer_id", null),
  ]);
  // Une offre peut avoir plusieurs lignes dans Suivi (doublons) : on retient celle qui est la plus avancée
  const byOffer = new Map<string, { status: string }[]>();
  for (const a of apps ?? []) byOffer.set(a.offer_id, [...(byOffer.get(a.offer_id) ?? []), a]);
  const status = new Map([...byOffer].map(([id, rows]) => [id, pickApplication(rows)!.status]));
  // Cette page ne garde que ce qu'il reste à faire : offres « À postuler » ou pas encore tranchées.
  // Postulées, abandonnées, refusées… sont dans Suivi ; les offres écartées nourrissent l'apprentissage sans encombrer la liste.
  const todo = (offers ?? []).filter((o) => (status.has(o.id) ? status.get(o.id) === "a_postuler" : o.decision !== "rejected"));
  const cvCount = new Map<string, number>();
  for (const d of docs ?? []) cvCount.set(d.offer_id, (cvCount.get(d.offer_id) ?? 0) + 1);
  const hidden = (offers?.length ?? 0) - todo.length;
  type Item = { key: string; kind: "offer" | "app"; href: string; score: number | null; title: string; sub: string; state: React.ReactNode; meta: string; at: string };
  const items: Item[] = [
    ...todo.map((o) => ({
      key: o.id, kind: "offer" as const, href: `/offres/${o.id}`, score: o.score as number | null, title: o.title as string,
      sub: [o.company, o.location, (o as unknown as { company_type?: string | null }).company_type].filter(Boolean).join(", "),
      state: (status.has(o.id) ? statusLabel(status.get(o.id)!) : <span className="text-muted">À décider</span>) as React.ReactNode,
      meta: `${cvCount.get(o.id) ? `${cvCount.get(o.id)} CV` : "Aucun CV"}, ${fmtDate(o.created_at)}`, at: o.created_at as string,
    })),
    ...(loose ?? []).map((a) => ({
      // Un clic ouvre la fiche : l'analyse se lance (lien prérempli, ou texte à coller) puis la fiche s'affiche, rattachée à cette candidature.
      // Pas de pourcentage : sans analyse complète, il n'y en a pas (un ancien pré-tri copié dans le suivi n'est pas un score).
      key: a.id, kind: "app" as const, href: `/offres/nouvelle?auto=1&app=${a.id}${a.url ? `&url=${encodeURIComponent(a.url)}` : "&needtext=1"}`, score: null, title: a.title as string,
      sub: [a.company, a.location].filter(Boolean).join(", "),
      state: statusLabel("a_postuler") as React.ReactNode,
      meta: `À analyser, ${fmtDate(a.created_at)}`, at: a.created_at as string,
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <>
      <PageTitle title="Offres & CV" sub="Les offres analysées qu'il te reste à traiter, leur score et les CV générés pour elles. Le reste est dans Suivi.">
        <Link href="/offres/nouvelle" className="btn btn-primary"><Plus size={16} /> Analyser une offre</Link>
      </PageTitle>
      {!items.length ? (
        <Empty action={<Link href="/offres/nouvelle" className="btn btn-primary">{offers?.length ? "Analyser une offre" : "Analyser ma première offre"}</Link>}>
          {offers?.length
            ? "Rien à traiter ici : tes offres sont toutes dans Suivi. Colle un lien ou le texte d'une annonce pour en analyser une nouvelle."
            : "Aucune offre analysée. Colle un lien ou le texte d'une annonce pour obtenir ton score et un CV sur mesure."}
        </Empty>
      ) : (
        <ul className="list">
          {items.map((it) => (
            <li key={it.key} className="flex items-center hover:bg-paper/60">
              <Link href={it.href} className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3">
                <ScorePill value={it.score} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{it.title}</p>
                  <p className="truncate text-sm text-muted">{it.sub}</p>
                </div>
                <div className="hidden shrink-0 text-right text-sm sm:block">
                  <p>{it.state}</p>
                  <p className="text-muted">{it.meta}</p>
                </div>
              </Link>
              <OfferRowDelete kind={it.kind} id={it.key} label={it.title} />
            </li>
          ))}
        </ul>
      )}
      {hidden > 0 && (
        <p className="mt-4 text-sm text-muted">
          {hidden} {hidden > 1 ? "autres offres sont" : "autre offre est"} déjà dans <Link href="/suivi" className="link font-semibold">Suivi</Link> (postulées, abandonnées ou refusées).
        </p>
      )}
    </>
  );
}
