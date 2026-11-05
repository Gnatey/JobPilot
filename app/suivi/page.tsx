import { requireUser } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import { appUrl } from "@/lib/gmail";
import { SuiviBoard } from "@/components/suivi-board";
import { loadApplications } from "@/lib/applications";

export const metadata = { title: "Suivi" };
export const dynamic = "force-dynamic";

export default async function Suivi() {
  const { supabase, user } = await requireUser();
  const [{ data }, profile] = await Promise.all([
    loadApplications(supabase),
    getProfile(supabase, user),
  ]);
  const token = profile.preferences.ics_token;
  return <SuiviBoard initial={data} calendarUrl={token ? `${appUrl()}/api/calendar/${token}` : null} />;
}
