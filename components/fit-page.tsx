"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { PRINT_HEIGHT_MM, PRINT_WIDTH_MM, PX_PER_MM } from "@/lib/print-layout";

/**
 * Fait tenir un CV sur UNE page A4 : si le contenu dépasse, la taille du texte est réduite petit à petit (jusqu'à MIN_ZOOM).
 * La mesure se fait sur une copie invisible aussi large que la zone imprimée (184 mm), donc le résultat est le même
 * sur téléphone et sur ordinateur. À l'impression, `app/globals.css` impose cette même largeur minimale à la feuille imprimée : sur les
 * navigateurs qui rétrécissent la page (iPhone), la feuille est réduite au lieu d'être recoupée, pour que le PDF contienne ce qui a été mesuré ici (lib/print-layout.ts).
 */
const PAGE_PX = PRINT_HEIGHT_MM * PX_PER_MM; // zone imprimée en hauteur (A4 moins les marges)
const LIMIT = PAGE_PX - 20; // au-delà, le CV ne tient plus sur une page même à la taille minimale (avertissement à l'écran)
/**
 * Hauteur visée : le texte est réduit (ou agrandi) pour tenir SOUS cette hauteur, pas seulement sous LIMIT.
 * Raison : sur l'ordinateur de Juliana (Edge, Windows) le PDF était 2,3 à 5 % plus haut que cette mesure (le texte passe à la ligne
 * autrement à l'impression qu'à l'écran) : un CV mesuré à 99 % de la page débordait sur une page 2 avec seulement la ligne des liens.
 * Cet écart n'a pas pu être reproduit hors de Windows (Linux : mesure et PDF à moins de 0,5 % près) : la marge est ajustée sur ce seul cas.
 */
export const SAFE_RATIO = 0.95;
const SAFE = PAGE_PX * SAFE_RATIO;
export const MIN_ZOOM = 0.86;
/** Un CV court est agrandi d'un rien pour mieux remplir la page (jamais plus que ça : le texte reste à une taille normale). */
const MAX_ZOOM = 1.06;

export type Fit = { zoom: number; over: boolean };

/** `grow` : un document court est agrandi d'un rien pour remplir la page (CV). Une lettre garde sa taille : une lettre courte n'a pas à être agrandie. */
export function FitPage({ children, watch, onFit, grow = true }: { children: ReactNode; watch: string; onFit?: (f: Fit) => void; grow?: boolean }) {
  const ruler = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const cb = useRef(onFit);
  cb.current = onFit;

  useEffect(() => {
    let cancelled = false;
    const measure = () => {
      const r = ruler.current, i = inner.current;
      if (!r || !i || cancelled) return;
      const height = (z: number) => { i.style.zoom = String(z); return r.getBoundingClientRect().height; };
      let z = 1;
      while (z > MIN_ZOOM && height(z) > SAFE) z = Math.round((z - 0.01) * 100) / 100;
      if (grow && z === 1) while (z < MAX_ZOOM && height(Math.round((z + 0.01) * 100) / 100) <= SAFE) z = Math.round((z + 0.01) * 100) / 100;
      const over = height(z) > LIMIT;
      setZoom(z);
      cb.current?.({ zoom: z, over });
    };
    measure();
    document.fonts?.ready.then(measure).catch(() => {}); // les polices chargées changent la hauteur
    return () => { cancelled = true; };
  }, [watch, grow]);

  return (
    <>
      <div style={{ zoom }}>{children}</div>
      <div ref={ruler} aria-hidden inert style={{ width: `${PRINT_WIDTH_MM}mm` }} className="pointer-events-none invisible fixed left-[-9999px] top-0">
        <div ref={inner}>{children}</div>
      </div>
    </>
  );
}
