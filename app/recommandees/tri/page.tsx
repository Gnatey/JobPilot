import { requireUser } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import { computeLearning } from "@/lib/learning";
import { RECO_COLS, toReco, type RecoRow } from "@/lib/reco-query";
import { TriageDeck } from "@/components/triage-deck";

export const metadata = { title: "Tri rapide" };
export const dynamic = "force-dynamic";

export default async function Tri() {
  const { supabase, user } = await requireUser();
  const [{ data }, profile, learning] = await Promise.all([
    supabase.from("recommendations").select(RECO_COLS).in("status", ["new", "analyzed"]).eq("senior", false).order("quick_score", { ascending: false }).limit(80),
    getProfile(supabase, user),
    computeLearning(supabase, user.id),
  ]);
  const recos = ((data ?? []) as unknown as RecoRow[]).map((r) => toReco(r, profile, learning, true)).sort((a, b) => b.score - a.score);
  return <TriageDeck initial={recos} />;
}
