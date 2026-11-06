import { requireUser, HttpError } from "@/lib/supabase/server";
import { handle } from "@/lib/http";
import { getProfile } from "@/lib/profile";
import { dropSettled, mergeSettled } from "@/lib/profile-fix";
import type { Profile } from "@/lib/types";

/** Applique au profil maître le profil proposé par un diagnostic. */
export async function POST(req: Request) {
  return handle(async () => {
    const { supabase, user } = await requireUser();
    const { id } = (await req.json()) as { id: string };
    const { data: d } = await supabase.from("diagnostics").select("proposed_profile, applied").eq("id", id).single();
    if (!d?.proposed_profile) throw new HttpError(404, "Diagnostic introuvable");
    // Le diagnostic a pu être calculé avant que tu règles une question : on garde la mémoire d'aujourd'hui et on retire de la liste ce qu'elle couvre
    const proposed = d.proposed_profile as Profile;
    const current = await getProfile(supabase, user);
    const settled = mergeSettled(current.settled, proposed.settled);
    const data: Profile = settled.length ? { ...proposed, settled, todo: dropSettled(proposed.todo ?? [], settled) } : proposed;
    await supabase.from("profiles").upsert({ user_id: user.id, data, updated_at: new Date().toISOString() });
    await supabase.from("diagnostics").update({ applied: true }).eq("id", id);
    return { ok: true };
  });
}
