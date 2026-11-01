"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Fait tenir un CV sur UNE page A4 : si le contenu dépasse, la taille du texte est réduite petit à petit (jusqu'à MIN_ZOOM).
 * La mesure se fait sur une copie invisible aussi large que la zone imprimée (182 mm), donc le résultat est le même
 * sur téléphone et sur ordinateur, et l'aperçu correspond à ce que le PDF contiendra.
 */
const PX_PER_MM = 96 / 25.4;
const LIMIT = (297 - 24) * PX_PER_MM - 20; // page A4 moins 12 mm de marge en haut et en bas, moins une petite sécurité
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
      while (z > MIN_ZOOM && height(z) > LIMIT) z = Math.round((z - 0.01) * 100) / 100;
      if (grow && z === 1) while (z < MAX_ZOOM && height(Math.round((z + 0.01) * 100) / 100) <= LIMIT * 0.97) z = Math.round((z + 0.01) * 100) / 100;
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
      <div ref={ruler} aria-hidden inert className="pointer-events-none invisible fixed left-[-9999px] top-0 w-[182mm]">
        <div ref={inner}>{children}</div>
      </div>
    </>
  );
}
