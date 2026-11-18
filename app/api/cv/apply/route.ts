import { requireUser, HttpError } from "@/lib/supabase/server";
import { handle } from "@/lib/http";
import { getProfile } from "@/lib/profile";
import { dropSettled, mergeSettled } from "@/lib/profile-fix";
import { addMissing, describeAdded } from "@/lib/profile-add";
import type { Profile } from "@/lib/types";
import { must } from "@/lib/db-must";

/** Ajoute au profil maître ce que le profil proposé par un diagnostic apporte en plus : jamais de remplacement (lib/profile-add.ts). */
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
    // Le profil d'aujourd'hui reste la base : le diagnostic est un instantané du jour du dépôt, l'écrire tel quel effaçait ce qui a changé depuis
    const { profile: merged, added } = addMissing(current, proposed);
    const data: Profile = settled.length ? { ...merged, settled, todo: dropSettled(merged.todo ?? [], settled) } : merged;
    must(await supabase.from("profiles").upsert({ user_id: user.id, data, updated_at: new Date().toISOString() }), "Ton profil");
    must(await supabase.from("diagnostics").update({ applied: true }).eq("id", id), "Le diagnostic");
    return { ok: true, summary: describeAdded(added), added };
  });
}
