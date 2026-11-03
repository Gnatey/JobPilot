/**
 * Où se range chaque offre analysée dans « Offres & CV » (logique pure, testée dans tests/offers-todo.test.ts) :
 * - candidature « À postuler » → à traiter ici (le CV reste à faire) ;
 * - candidature envoyée, abandonnée, refusée… → c'est dans Suivi ;
 * - pas de candidature, offre venue de Recommandées et encore à trier → elle ne bouge pas : elle reste dans Recommandées, avec son score ;
 * - pas de candidature, offre écartée → n'apparaît plus ;
 * - pas de candidature, analyse faite à la main (lien ou texte collé) → à décider ici, il n'y a pas d'autre endroit.
 * `statusByOffer` : statut retenu de la candidature de chaque offre (voir pickApplication). `inRecommandees` : offres encore « À trier » dans Recommandées.
 */
export function partitionOffers<T extends { id: string; decision?: string | null }>(offers: T[], statusByOffer: Map<string, string>, inRecommandees: Set<string>) {
  const todo: T[] = [];
  let waiting = 0;
  for (const o of offers) {
    const st = statusByOffer.get(o.id);
    if (st) {
      if (st === "a_postuler") todo.push(o);
      continue;
    }
    if (o.decision === "rejected") continue;
    if (inRecommandees.has(o.id)) { waiting++; continue; }
    todo.push(o);
  }
  return { todo, waiting, elsewhere: offers.length - todo.length - waiting };
}
