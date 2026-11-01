import { requireUser } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import { appUrl } from "@/lib/gmail";
import { SuiviBoard } from "@/components/suivi-board";
import type { Application } from "@/lib/types";

export const metadata = { title: "Suivi" };
export const dynamic = "force-dynamic";

export default async function Suivi() {
  const { supabase, user } = await requireUser();
  const [{ data }, profile] = await Promise.all([
    supabase.from("applications").select("*").order("updated_at", { ascending: false }).limit(500),
    getProfile(supabase, user),
  ]);
  const token = profile.preferences.ics_token;
  return <SuiviBoard initial={(data ?? []) as Application[]} calendarUrl={token ? `${appUrl()}/api/calendar/${token}` : null} />;
}
