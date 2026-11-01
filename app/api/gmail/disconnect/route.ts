import { requireUser } from "@/lib/supabase/server";
import { handle } from "@/lib/http";
import { patchPreferences } from "@/lib/profile";

export async function POST() {
  return handle(async () => {
    const { supabase, user } = await requireUser();
    const { data } = await supabase.from("gmail_accounts").select("refresh_token").eq("user_id", user.id).maybeSingle();
    if (data?.refresh_token) {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(data.refresh_token)}`, { method: "POST" }).catch(() => {});
    }
    await supabase.from("gmail_accounts").delete().eq("user_id", user.id);
    await patchPreferences(supabase, user.id, { daily_recap: false, recap_send_ok: false });
    return { ok: true };
  });
}
