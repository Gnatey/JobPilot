/**
 * Adresses des liens du profil (logique pure, testée par tests/link-url.test.ts).
 * Une adresse est utilisable si c'est du http(s) avec un vrai nom de site (« github.com/ton-nom », « itch.io ») ;
 * sans protocole on ajoute « https:// ». Tout le reste (« Streamlit », « GitHub », un mot seul, « javascript: », « mailto: »)
 * n'est pas un lien : il n'est ni cliquable dans Profil ni écrit sur un CV (avant, « Streamlit » devenait `https://Streamlit`, un lien mort dans le PDF).
 */

const DOMAIN = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?::\d{1,5})?(?:[/?#]\S*)?$/i;

/** L'adresse à ouvrir (toujours http ou https), ou null si ce n'est pas une adresse. */
export function linkHref(raw: string | undefined | null): string | null {
  const u = (raw ?? "").trim();
  if (!u || /\s/.test(u)) return null;
  if (/^https?:\/\//i.test(u)) {
    try {
      const x = new URL(u);
      return /^[^.]+\.[^.]+/.test(x.hostname) && !x.username && !x.password ? u : null;
    } catch { return null; }
  }
  if (/^[a-z][a-z0-9+.-]*:(?!\d)/i.test(u) || u.startsWith("//")) return null; // javascript:, mailto:, data:…
  return DOMAIN.test(u) ? `https://${u}` : null;
}

/** Ce qu'on écrit dans le champ quand on le quitte : « itch.io » devient « https://itch.io » ; le reste est seulement nettoyé. */
export function normalizeLinkUrl(raw: string): string {
  const u = (raw ?? "").trim();
  return linkHref(u) ?? u;
}

/** Pourquoi une ligne ne servira pas (null : elle est bonne, ou vide). */
export function linkNote(l: { label?: string; url?: string }): string | null {
  const url = (l.url ?? "").trim();
  if (!url) return (l.label ?? "").trim() ? "Ajoute l'adresse du lien." : null;
  return linkHref(url) ? null : "Adresse incomplète : écris-la en entier, par exemple https://github.com/ton-nom. Tant qu'elle l'est, ce lien n'apparaît pas sur tes CV.";
}

type L = { label?: string; url?: string };
const fold = (s: string) => (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const urlKey = (u: string) => u.trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/[/?#]+$/, "");

/**
 * Quelles lignes sont en trop ? (indices ; la première de chaque groupe reste)
 * - même adresse (avec ou sans https://, www., « / » final) : une seule ;
 * - une adresse incomplète (« LinkedIn », « GitHub » : le libellé recopié comme adresse) qui porte le libellé d'un lien valide : elle ne sert à rien
 *   (cas de Juliana, 18 novembre : « LinkedIn | LinkedIn » à côté de « LinkedIn | https://linkedin.com/in/… »).
 * Une ligne vide (la personne vient de cliquer sur « Ajouter un lien ») n'est jamais un doublon.
 */
export function duplicateIndexes(links: L[]): Set<number> {
  const drop = new Set<number>();
  const seen = new Set<string>();
  links.forEach((l, i) => {
    const url = (l?.url ?? "").trim();
    if (!url) return;
    const k = urlKey(linkHref(url) ?? url);
    if (seen.has(k)) drop.add(i); else seen.add(k);
  });
  const good = new Set(links.filter((l, i) => !drop.has(i) && linkHref(l?.url) && fold(l?.label ?? "")).map((l) => fold(l.label ?? "")));
  links.forEach((l, i) => {
    if (!drop.has(i) && (l?.url ?? "").trim() && !linkHref(l.url) && good.has(fold(l.label ?? ""))) drop.add(i);
  });
  return drop;
}

/** Les liens lus dans un CV : seulement ceux qui ont une vraie adresse (un mot seul comme « LinkedIn » n'est pas un lien), écrite en entier. */
export function usableLinks<T extends L>(links: T[] | undefined): T[] {
  return (links ?? []).flatMap((l) => { const href = linkHref(l?.url); return href ? [{ ...l, url: href }] : []; });
}
