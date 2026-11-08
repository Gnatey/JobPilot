/**
 * « Vérifier les annonces » : lire les liens des lignes « À analyser » SANS IA pour repérer celles qui ne sont plus en ligne. Logique pure,
 * testée par tests/offer-check.test.ts ; la route est app/api/offers/check, l'écran components/check-ads.tsx.
 * On ne conclut « disparue » que sur une preuve (page 404/410, texte « n'est plus disponible », date limite dépassée : voir `readOffer`) ;
 * un site qui bloque ou répond mal reste « inconnue », jamais « disparue ».
 */
// Ce fichier est lu aussi par l'écran (navigateur) : aucun import d'exécution venant du serveur (voir lib/offer-check-read.ts pour `checkable`).
import type { OfferRead } from "./fetch-offer";
import type { Skip } from "./analyze-skips";

/** Lignes vérifiées par requête (lues en parallèle) : assez peu pour tenir dans les 52 secondes d'une requête, même si les sites répondent lentement. */
export const CHECK_BATCH = 6;

/**
 * gone : l'annonce n'existe plus (preuve) ; online : la page se lit, l'annonce est en ligne ;
 * unknown : impossible de savoir (site qui bloque, page vide, panne) ; skipped : pas de lien utilisable, ou site qui refuse la lecture (rien n'a été tenté).
 */
export type Verdict = "gone" | "online" | "unknown" | "skipped";

export function verdictOf(read: Pick<OfferRead, "text" | "gone">): Verdict {
  if (read.gone) return "gone";
  return read.text ? "online" : "unknown";
}

/** Découpe une liste en paquets d'au plus `n` éléments. */
export function chunk<T>(list: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += Math.max(1, n)) out.push(list.slice(i, i + Math.max(1, n)));
  return out;
}

/** `why` : pour une annonce « disparue », la preuve en une phrase (« le site répond « page introuvable » (404) »…), affichée dans le bilan pour que la personne la juge. */
export type CheckResult = { id: string; verdict: Verdict; site: string; why?: string };
export type CheckTally = Record<Verdict, number>;

export const tally = (results: Pick<CheckResult, "verdict">[]): CheckTally => {
  const t: CheckTally = { gone: 0, online: 0, unknown: 0, skipped: 0 };
  for (const r of results) t[r.verdict]++;
  return t;
};

/** Phrase de bilan de la vérification. */
export function checkSummary(t: CheckTally, stopped = false): string {
  const s = (n: number) => (n > 1 ? "s" : "");
  const parts = [
    t.gone ? `${t.gone} annonce${s(t.gone)} disparue${s(t.gone)}` : "aucune annonce disparue",
    `${t.online} encore en ligne`,
  ];
  const unclear = t.unknown + t.skipped;
  if (unclear) parts.push(`${unclear} impossible${s(unclear)} à vérifier (site qui refuse la lecture automatique)`);
  return `${parts.join(", ")}${stopped ? " (vérification arrêtée avant la fin)" : ""}.`;
}

/** Nom du « site » des lignes sans lien, dans le bilan (au lieu de « texte »). */
export const NO_LINK_SITE = "Sans lien";

/**
 * Les lignes dont la vérification n'a rien prouvé (site qui bloque la lecture, pas de lien, lien de connexion), rangées comme les annonces illisibles
 * du bilan de « Tout analyser » : un lien pour ouvrir l'annonce, « Coller le texte », la corbeille. JAMAIS cochées pour suppression : seule une preuve (« gone ») coche.
 */
export function unclearSkips(results: CheckResult[], lines: Map<string, { title: string; url: string | null }>): Skip[] {
  return results
    .filter((r) => r.verdict === "unknown" || r.verdict === "skipped")
    .map((r) => ({ appId: r.id, title: lines.get(r.id)?.title ?? "Annonce", url: lines.get(r.id)?.url ?? null, kind: "unreadable" as const, site: r.site === "texte" ? NO_LINK_SITE : r.site }));
}
