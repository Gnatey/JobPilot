import { requireUser } from "@/lib/supabase/server";
import { handle } from "@/lib/http";
import { today } from "@/lib/format";
import { rateLimit } from "@/lib/rate-limit";
import { orderColumn, readExport, stripSecrets } from "@/lib/user-export";

export const maxDuration = 60;

/** Export de toutes les données de l'utilisateur (hors jeton Gmail), en un fichier JSON. Toutes les lignes, pas seulement les 1 000 premières. */
export async function GET() {
  const res = await handle(async () => {
    const { supabase, user } = await requireUser();
    await rateLimit(supabase, "exportData");
    // Tri stable pour que la lecture page après page ne saute ni ne répète aucune ligne (`profiles` n'a pas de colonne id)
    const { tables, counts, truncated } = await readExport((t, from, to) => supabase.from(t).select("*").order(orderColumn(t)).range(from, to));
    stripSecrets(tables.profiles);
    return { exported_at: new Date().toISOString(), user: user.email, row_counts: counts, ...(truncated.length ? { truncated } : {}), ...tables };
  });
  if (res.ok) res.headers.set("Content-Disposition", `attachment; filename="jobpilot-export-${today()}.json"`);
  return res;
}
