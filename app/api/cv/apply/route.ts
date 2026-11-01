import { requireUser, HttpError } from "@/lib/supabase/server";
import { handle } from "@/lib/http";

/** Applique au profil maître le profil proposé par un diagnostic. */
export async function POST(req: Request) {
  return handle(async () => {
    const { supabase, user } = await requireUser();
    const { id } = (await req.json()) as { id: string };
    const { data: d } = await supabase.from("diagnostics").select("proposed_profile, applied").eq("id", id).single();
    if (!d?.proposed_profile) throw new HttpError(404, "Diagnostic introuvable");
    await supabase.from("profiles").upsert({ user_id: user.id, data: d.proposed_profile, updated_at: new Date().toISOString() });
    await supabase.from("diagnostics").update({ applied: true }).eq("id", id);
    return { ok: true };
  });
}
