import { notFound } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import { DocumentView } from "@/components/document-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Document" };

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  const [{ data: doc }, profile] = await Promise.all([
    supabase.from("documents").select("*, offers(id, title, company, extracted, analysis)").eq("id", id).maybeSingle(),
    getProfile(supabase, user),
  ]);
  if (!doc) notFound();
  let reusedFrom: string | null = null;
  if (doc.reused_from) {
    const { data } = await supabase.from("documents").select("offers(title, company)").eq("id", doc.reused_from).maybeSingle();
    const o = data?.offers as unknown as { title: string; company: string } | null;
    reusedFrom = o ? `${o.title} chez ${o.company}` : "une autre offre";
  }
  const rec = (doc.offers as unknown as { analysis?: { recommended_template?: string } | null } | null)?.analysis?.recommended_template ?? null;
  // Pour une lettre : le CV de la même offre (modèle et titre à reprendre)
  let sibling: { template: string | null; headline: string | null } | null = null;
  if (doc.kind === "lettre" && doc.offer_id) {
    const { data: cv } = await supabase.from("documents").select("template, content").eq("offer_id", doc.offer_id).eq("kind", "cv").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (cv) sibling = { template: cv.template ?? null, headline: (cv.content as { headline?: string } | null)?.headline ?? null };
  }
  return <DocumentView doc={doc} identity={profile.identity} reusedFrom={reusedFrom} recommended={rec} sibling={sibling} />;
}
