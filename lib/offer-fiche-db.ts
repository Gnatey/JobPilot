/**
 * Enregistre la fiche d'une offre modifiée à la main, côté base : colonnes de `offers` ET extrait JSON ensemble, puis les lignes de Suivi
 * qui reprenaient la fiche. Séparé de la route pour être testé avec une fausse base (tests/offer-fiche-db.test.ts). Aucun appel d'IA.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { HttpError } from "./supabase/server";
import { applyFiche, columnsOf, linePatch, ficheOf, type Fiche, type FicheKey } from "./offer-fiche";

export type SavedFiche = { fiche: Fiche; changed: FicheKey[]; lines: number };

export async function saveFiche(supabase: SupabaseClient, offerId: string, patch: Partial<Fiche>): Promise<SavedFiche> {
  if (!Object.keys(patch).length) throw new HttpError(400, "Rien à enregistrer.");
  const { data: offer } = await supabase.from("offers").select("id, title, company, location, contract, extracted").eq("id", offerId).maybeSingle();
  if (!offer) throw new HttpError(404, "Offre introuvable");
  const cols = offer as { title: string | null; company: string | null; location: string | null; contract: string | null; extracted: unknown };

  const { extracted, changed } = applyFiche(cols.extracted, patch, cols);
  const after = columnsOf(extracted);
  const { error } = await supabase.from("offers").update({ ...after, extracted }).eq("id", offerId);
  if (error) throw error;

  // Les lignes de Suivi de cette offre qui reprenaient son ancien poste / entreprise suivent (« Poste ? » devient le vrai poste)
  const before = ficheOf(cols.extracted, cols);
  const { data: lines } = await supabase.from("applications").select("id, title, company, location, contract").eq("offer_id", offerId);
  let touched = 0;
  for (const l of (lines ?? []) as { id: string; title: string | null; company: string | null; location: string | null; contract: string | null }[]) {
    const p = linePatch(before, after, l);
    if (!Object.keys(p).length) continue;
    const { error: e2 } = await supabase.from("applications").update(p).eq("id", l.id);
    if (!e2) touched++;
  }
  return { fiche: ficheOf(extracted), changed, lines: touched };
}
