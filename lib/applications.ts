import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "./paged";
import { canonicalStatus, type Application } from "./types";

/**
 * Toutes les candidatures de la personne (accueil, Suivi), les plus récemment modifiées d'abord.
 * Un `limit(300)` ou `limit(500)` cachait les plus anciennes sans le dire : une relance à faire sur une vieille candidature n'apparaissait nulle part.
 * `id` départage les ex æquo : sans tri stable, une ligne pourrait être lue deux fois ou sautée d'une page à l'autre.
 * Les anciennes saisies (« expire ») sont lues comme leur statut d'aujourd'hui (`canonicalStatus`) : sans cela, elles n'auraient plus de colonne.
 * Peut tourner côté serveur comme dans le navigateur. En cas d'erreur en cours de route, `error` est renseigné : ne pas remplacer une liste complète par ce qui a été lu.
 */
export async function loadApplications(supabase: SupabaseClient) {
  const res = await fetchAll<Application>((a, b) => supabase.from("applications").select("*").order("updated_at", { ascending: false }).order("id").range(a, b));
  return { ...res, data: res.data.map((a) => (canonicalStatus(a.status) === a.status ? a : ({ ...a, status: canonicalStatus(a.status) } as Application))) };
}
