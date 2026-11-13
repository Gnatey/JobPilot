import { Fragment, type ReactNode } from "react";

/**
 * Une phrase traduite qui contient un lien ou du gras : `rich(t("Détails dans la {1} et les {2}."), [lien1, lien2])`.
 * Les `{1}`, `{2}`… du texte traduit sont remplacés par les éléments donnés, dans l'ordre voulu par la langue
 * (couper la phrase en morceaux autour du lien empêcherait de la traduire : l'ordre des mots change d'une langue à l'autre).
 */
export function rich(text: string, nodes: ReactNode[]): ReactNode {
  return text.split(/(\{\d+\})/).map((part, i) => {
    const m = /^\{(\d+)\}$/.exec(part);
    return m ? <Fragment key={i}>{nodes[Number(m[1]) - 1] ?? part}</Fragment> : part;
  });
}
