import { requireUser } from "@/lib/supabase/server";
import { handle } from "@/lib/http";
import { getProfile } from "@/lib/profile";
import { appUrl } from "@/lib/gmail";

const hex = () => crypto.randomUUID().replace(/-/g, "");

/** Crée (ou révoque) le lien secret de l'agenda. */
export async function POST(req: Request) {
  return handle(async () => {
    const { supabase, user } = await requireUser();
    const { action } = (await req.json()) as { action: "create" | "revoke" };
    const profile = await getProfile(supabase, user);
    const token = action === "create" ? hex() + hex().slice(0, 16) : undefined;
    const preferences = { ...profile.preferences };
    if (token) preferences.ics_token = token;
    else delete preferences.ics_token;
    await supabase.from("profiles").update({ data: { ...profile, preferences }, updated_at: new Date().toISOString() }).eq("user_id", user.id);
    return { url: token ? `${appUrl()}/api/calendar/${token}` : null };
  });
}
