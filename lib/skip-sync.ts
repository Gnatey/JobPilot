/**
 * Remet le bilan de « Tout analyser » / « Vérifier les annonces » à jour d'après l'état ACTUEL des lignes (7-8 novembre, retour de Juliana : « texte collé
 * dans une candidature mais toujours répertoriée dans illisible »). Le bilan est un instantané pris à la fin de la passe ; or « Coller le texte » ouvre la
 * fiche dans un AUTRE onglet (pour ne pas perdre le bilan) : la ligne y est analysée ou son texte gardé, et le bilan restait faux. Logique pure (testée par
 * tests/skip-sync.test.ts), lue aussi par l'écran : aucun import venant du serveur. La route est app/api/offers/lines.
 */
import type { Skip } from "./analyze-skips";

/** `todo` : toujours une ligne « À analyser » ; `analyzed` : l'offre a été analysée depuis ; `away` : elle n'est plus « À postuler » (envoyée, abandonnée…). */
export type LineStatus = "todo" | "analyzed" | "away";
export type LineState = { id: string; state: LineStatus; has_text: boolean };

/** Lignes demandées par requête : assez peu pour que la liste d'identifiants tienne dans l'adresse de la requête à la base. */
export const SYNC_CHUNK = 100;

/** Même définition que la liste d'Offres & CV et que la file d'analyse : « À postuler » et sans offre analysée. */
export function lineStatus(row: { status: string | null; offer_id: string | null }): LineStatus {
  if (row.offer_id) return "analyzed";
  return row.status === "a_postuler" ? "todo" : "away";
}

/**
 * Ce que le bilan doit changer. `drop` : lignes qui n'ont plus rien à faire ici (analysées depuis, supprimées, passées dans Suivi) ; `kept` : lignes
 * qui portent maintenant un texte collé, donc plus « illisibles » ni « disparues » : elles se rangent à part, prêtes à analyser. Une ligne absente de
 * la réponse a été supprimée.
 */
export function reconcile(skips: Skip[], states: LineState[]): { drop: string[]; kept: string[] } {
  const by = new Map(states.map((s) => [s.id, s]));
  const drop: string[] = [];
  const kept: string[] = [];
  for (const s of skips) {
    const st = by.get(s.appId);
    if (!st || st.state !== "todo") drop.push(s.appId);
    else if (st.has_text) kept.push(s.appId);
  }
  return { drop, kept };
}

/**
 * Interroge l'état des lignes du bilan, par paquets (les candidatures d'un côté, les offres déjà analysées de l'autre : `target` dit lesquelles). Un paquet
 * dont la lecture échoue (`null`) n'est PAS conclu : on ne retire jamais une ligne parce qu'une requête a raté. Une offre n'a que deux états : elle existe
 * encore (« todo ») ou elle a été supprimée (absente de la réponse).
 */
export async function syncSkips(skips: Skip[], fetchStates: (ids: string[], target: "app" | "offer") => Promise<LineState[] | null>): Promise<{ drop: string[]; kept: string[] }> {
  const drop: string[] = [];
  const kept: string[] = [];
  for (const target of ["app", "offer"] as const) {
    const own = skips.filter((s) => (s.target ?? "app") === target);
    for (let i = 0; i < own.length; i += SYNC_CHUNK) {
      const part = own.slice(i, i + SYNC_CHUNK);
      const states = await fetchStates(part.map((s) => s.appId), target);
      if (!states) continue;
      const r = reconcile(part, states);
      drop.push(...r.drop);
      kept.push(...r.kept);
    }
  }
  return { drop, kept };
}
