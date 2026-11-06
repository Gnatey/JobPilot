import { requireUser } from "@/lib/supabase/server";
import { handle } from "@/lib/http";
import { patchPreferences } from "@/lib/profile";
import { openToken } from "@/lib/token-crypto";

export async function POST() {
  return handle(async () => {
    const { supabase, user } = await requireUser();
    const { data } = await supabase.from("gmail_accounts").select("refresh_token").eq("user_id", user.id).maybeSingle();
    const plain = data?.refresh_token ? await openToken(data.refresh_token, user.id).catch(() => null) : null; // illisible : on déconnecte quand même
    if (plain) await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(plain)}`, { method: "POST" }).catch(() => {});
    await supabase.from("gmail_accounts").delete().eq("user_id", user.id);
    await patchPreferences(supabase, user.id, { daily_recap: false, recap_send_ok: false, gmail_issue: undefined });
    return { ok: true };
  });
}
