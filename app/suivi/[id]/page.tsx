import { notFound } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { loadDossier } from "@/lib/dossier-db";
import { Dossier } from "@/components/dossier";

export const dynamic = "force-dynamic";

/** Onglet : « Entreprise, poste » (une petite lecture, en parallèle de la page) ; « Dossier d'offre » si la candidature est introuvable. */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { supabase } = await requireUser();
    const { data } = await supabase.from("applications").select("title, company").eq("id", id).maybeSingle();
    const name = [data?.company, data?.title].filter(Boolean).join(", ");
    return { title: name ? `Dossier : ${name}` : "Dossier d'offre" };
  } catch {
    return { title: "Dossier d'offre" };
  }
}

/** Le dossier d'une candidature : tout ce qui la concerne au même endroit (journal daté, détails, documents). */
export default async function DossierPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase } = await requireUser();
  const r = await loadDossier(supabase, id);
  if (!r.ok) {
    if (r.notFound) notFound();
    throw new Error(r.error);
  }
  return <Dossier initial={r.data} />;
}
