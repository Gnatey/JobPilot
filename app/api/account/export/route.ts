import { requireUser } from "@/lib/supabase/server";
import { handle } from "@/lib/http";
import { today } from "@/lib/format";

export const maxDuration = 60;

const TABLES = ["profiles", "offers", "applications", "status_history", "documents", "emails", "recommendations", "insights", "searches", "diagnostics"] as const;

/** Export de toutes les données de l'utilisateur (hors jeton Gmail), en un fichier JSON. */
export async function GET() {
  const res = await handle(async () => {
    const { supabase, user } = await requireUser();
    const entries = await Promise.all(TABLES.map(async (t) => [t, (await supabase.from(t).select("*")).data ?? []] as const));
    const data: Record<string, unknown> = Object.fromEntries(entries);
    // Le lien secret de l'agenda n'a rien à faire dans un fichier qu'on peut partager
    const prof = (data.profiles as { data?: { preferences?: Record<string, unknown> } }[])[0];
    if (prof?.data?.preferences) delete prof.data.preferences.ics_token;
    return { exported_at: new Date().toISOString(), user: user.email, ...data };
  });
  if (res.ok) res.headers.set("Content-Disposition", `attachment; filename="jobpilot-export-${today()}.json"`);
  return res;
}
