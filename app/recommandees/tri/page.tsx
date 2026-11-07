import { requireUser } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import { computeLearning } from "@/lib/learning";
import { RECO_COLS, toReco, type RecoRow } from "@/lib/reco-query";
import { ensureFit } from "@/lib/fit-stock";
import { archiveOld } from "@/lib/reco-age-db";
import { today } from "@/lib/format";
import { DEFAULT_DAILY_QUOTA } from "@/lib/onboarding";
import { TriageDeck } from "@/components/triage-deck";
import { sortRecos } from "@/lib/reco-sort";

export const metadata = { title: "Tri rapide" };
export const dynamic = "force-dynamic";

/** `?jour=1` : seulement les offres préparées pour aujourd'hui (bouton « Préparer ma journée » de la page Recherche). */
export default async function Tri({ searchParams }: { searchParams: Promise<{ jour?: string }> }) {
  const { jour } = await searchParams;
  const { supabase, user } = await requireUser();
  const profile = await getProfile(supabase, user);
  await ensureFit(supabase, user.id, profile).catch(() => null);
  await archiveOld(supabase, user.id);
  const learning = await computeLearning(supabase, user.id);

  const day = jour && profile.preferences.day?.date === today() ? profile.preferences.day : null;
  if (day) {
    const { data } = await supabase.from("recommendations").select(RECO_COLS).in("id", day.ids.slice(0, 300));
    const rows = (data ?? []) as unknown as RecoRow[];
    const order = new Map(day.ids.map((id, i) => [id, i]));
    const todo = rows.filter((r) => r.status === "new" || r.status === "analyzed").sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    const recos = todo.map((r) => toReco(r, profile, learning, true));
    return <TriageDeck initial={recos} day={{ total: day.ids.length, accepted: rows.filter((r) => r.status === "accepted").length, quota: profile.preferences.daily_quota ?? DEFAULT_DAILY_QUOTA }} />;
  }

  const { data } = await supabase.from("recommendations").select(RECO_COLS).in("status", ["new", "analyzed"]).eq("senior", false).order("received_at", { ascending: false }).limit(80);
  const recos = sortRecos(((data ?? []) as unknown as RecoRow[]).map((r) => toReco(r, profile, learning, true)), "date"); // les plus récentes d'abord (le pré-score ne sépare presque rien)
  return <TriageDeck initial={recos} />;
}
