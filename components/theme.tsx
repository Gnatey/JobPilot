"use client";
import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

export type ThemeMode = "auto" | "light" | "dark";
const KEY = "jp-theme";

function apply(mode: ThemeMode) {
  const root = document.documentElement;
  if (mode === "auto") delete root.dataset.theme;
  else root.dataset.theme = mode;
  try { localStorage.setItem(KEY, mode); } catch {}
}

export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>("auto");
  useEffect(() => {
    try {
      const v = localStorage.getItem(KEY);
      if (v === "light" || v === "dark") setMode(v);
    } catch {}
  }, []);
  return [mode, (m: ThemeMode) => { setMode(m); apply(m); }] as const;
}

const NEXT: Record<ThemeMode, ThemeMode> = { auto: "light", light: "dark", dark: "auto" };
const LABEL: Record<ThemeMode, string> = { auto: "Apparence : automatique", light: "Apparence : clair", dark: "Apparence : sombre" };

/** Bouton compact qui fait tourner automatique, clair, sombre. */
export function ThemeToggle({ className = "", withLabel = false }: { className?: string; withLabel?: boolean }) {
  const [mode, set] = useTheme();
  const Icon = mode === "light" ? Sun : mode === "dark" ? Moon : Monitor;
  return (
    <button type="button" onClick={() => set(NEXT[mode])} className={className} aria-label={LABEL[mode]} title={LABEL[mode]}>
      <Icon size={18} />
      {withLabel && <span>{mode === "auto" ? "Automatique" : mode === "light" ? "Clair" : "Sombre"}</span>}
    </button>
  );
}

/** Choix explicite des trois modes (page Réglages). */
export function ThemePicker() {
  const [mode, set] = useTheme();
  const opts: { id: ThemeMode; label: string; icon: typeof Sun }[] = [
    { id: "auto", label: "Automatique", icon: Monitor },
    { id: "light", label: "Clair", icon: Sun },
    { id: "dark", label: "Sombre", icon: Moon },
  ];
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Apparence">
      {opts.map(({ id, label, icon: Icon }) => (
        <button key={id} type="button" role="radio" aria-checked={mode === id} className="chip !px-4 !py-2" onClick={() => set(id)}>
          <Icon size={16} /> {label}
        </button>
      ))}
    </div>
  );
}

/** Script injecté dans <head> : applique le thème choisi avant le premier affichage (pas de flash). */
export const THEME_BOOT = `try{var t=localStorage.getItem("${KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
