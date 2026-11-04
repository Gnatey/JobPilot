/**
 * Mise en page de l'impression des CV et des lettres (A4).
 *
 * FitPage mesure le document sur une largeur fixe (PRINT_WIDTH_MM) pour décider s'il tient sur UNE page. Il faut que l'impression
 * donne la même mise en page. Chrome, Edge et Firefox sur ordinateur et Android impriment à cette largeur exacte. Les navigateurs de
 * l'iPhone (moteur WebKit) mettent la page en forme plus étroite : le texte revient à la ligne plus tôt, le CV devient bien plus haut
 * que mesuré et déborde sur une 2e page. D'où, dans `app/globals.css`, une largeur MINIMALE de la feuille imprimée : quand la page est
 * plus étroite, le navigateur réduit toute la feuille pour la faire tenir (« shrink to fit ») au lieu de couper les lignes plus court.
 * Si les constantes changent ici, `app/globals.css` doit changer aussi : tests/print-layout.test.ts le vérifie.
 */
export const PX_PER_MM = 96 / 25.4;
/** Marge identique des quatre côtés : un navigateur qui lirait mal « marge haut/bas, marge gauche/droite » donne alors le même résultat. */
export const PAGE_MARGIN_MM = 13;
export const PRINT_WIDTH_MM = 210 - 2 * PAGE_MARGIN_MM;
export const PRINT_HEIGHT_MM = 297 - 2 * PAGE_MARGIN_MM;
