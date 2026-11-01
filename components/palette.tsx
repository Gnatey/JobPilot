"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, Columns3, CornerDownLeft, FileText, Inbox, Layers, LogOut, Moon, Plus, ScanSearch, Search, Settings, Sun, UserRound, Zap, Briefcase } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { statusLabel } from "@/lib/types";
import { useTheme } from "./theme";

type Item = { id: string; label: string; hint?: string; icon: typeof Search; run: () => void; group: string };

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export const openPalette = () => window.dispatchEvent(new Event("jp:palette"));

/** Palette de commandes (Ctrl/⌘ + K) : aller n'importe où, ou retrouver une offre, une candidature, une entreprise. */
export function Palette() {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Item[]>([]);
  const [active, setActive] = useState(0);
  const [mode, setMode] = useTheme();

  const go = useCallback((href: string) => { setOpen(false); router.push(href); }, [router]);

  const commands = useMemo<Item[]>(() => [
    { group: "Actions", id: "new", label: "Analyser une offre", hint: "Colle un lien ou un texte", icon: Plus, run: () => go("/offres/nouvelle") },
    { group: "Actions", id: "tri", label: "Trier les offres, mode rapide", hint: "Une offre à la fois, au clavier ou au doigt", icon: Zap, run: () => go("/recommandees/tri") },
    { group: "Actions", id: "add", label: "Ajouter une candidature à la main", icon: Briefcase, run: () => go("/suivi?new=1") },
    { group: "Actions", id: "theme", label: mode === "dark" ? "Passer en mode clair" : "Passer en mode sombre", icon: mode === "dark" ? Sun : Moon, run: () => { setMode(mode === "dark" ? "light" : "dark"); setOpen(false); } },
    { group: "Aller à", id: "p-today", label: "Aujourd'hui", icon: Sun, run: () => go("/") },
    { group: "Aller à", id: "p-reco", label: "Recommandées", icon: Inbox, run: () => go("/recommandees") },
    { group: "Aller à", id: "p-suivi", label: "Suivi des candidatures", icon: Columns3, run: () => go("/suivi") },
    { group: "Aller à", id: "p-offres", label: "Offres & CV", icon: FileText, run: () => go("/offres") },
    { group: "Aller à", id: "p-search", label: "Recherche d'offres", icon: Search, run: () => go("/recherche") },
    { group: "Aller à", id: "p-stats", label: "Statistiques", icon: BarChart3, run: () => go("/stats") },
    { group: "Aller à", id: "p-cv", label: "Mon CV (diagnostic)", icon: ScanSearch, run: () => go("/mon-cv") },
    { group: "Aller à", id: "p-profil", label: "Profil maître", icon: UserRound, run: () => go("/profil") },
    { group: "Aller à", id: "p-set", label: "Réglages", icon: Settings, run: () => go("/parametres") },
    { group: "Compte", id: "logout", label: "Se déconnecter", icon: LogOut, run: async () => { await supabaseBrowser().auth.signOut(); setOpen(false); router.replace("/"); router.refresh(); } },
  ], [go, mode, setMode, router]);

  // Ouverture : raccourci clavier ou événement
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); }
    };
    const onEvt = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("jp:palette", onEvt);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("jp:palette", onEvt); };
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) { el.showModal(); setQ(""); setFound([]); setActive(0); setTimeout(() => input.current?.focus(), 0); }
    if (!open && el.open) el.close();
  }, [open]);

  // Recherche dans les données (après une courte pause de frappe)
  useEffect(() => {
    const term = q.trim().replace(/[,()%*\\]/g, " ");
    if (term.length < 2) { setFound([]); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      const sb = supabaseBrowser();
      const like = `%${term}%`;
      const [apps, offers, recos] = await Promise.all([
        sb.from("applications").select("id, title, company, status").or(`title.ilike.${like},company.ilike.${like}`).limit(5),
        sb.from("offers").select("id, title, company, score").or(`title.ilike.${like},company.ilike.${like}`).limit(5),
        sb.from("recommendations").select("id, title, company").or(`title.ilike.${like},company.ilike.${like}`).in("status", ["new", "analyzed"]).limit(4),
      ]);
      if (cancelled) return;
      const items: Item[] = [
        ...(apps.data ?? []).map((a): Item => ({ group: "Candidatures", id: `a-${a.id}`, label: a.title, hint: `${a.company}, ${statusLabel(a.status).toLowerCase()}`, icon: Briefcase, run: () => go(`/suivi?open=${a.id}`) })),
        ...(offers.data ?? []).map((o): Item => ({ group: "Offres analysées", id: `o-${o.id}`, label: o.title ?? "Offre", hint: `${o.company ?? ""}${o.score != null ? `, ${o.score} %` : ""}`, icon: Layers, run: () => go(`/offres/${o.id}`) })),
        ...(recos.data ?? []).map((r): Item => ({ group: "À trier", id: `r-${r.id}`, label: r.title ?? "Offre", hint: r.company ?? "", icon: Inbox, run: () => go("/recommandees") })),
      ];
      setFound(items);
    }, 180);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q, go]);

  const shown = useMemo(() => {
    const n = norm(q.trim());
    const local = n ? commands.filter((c) => norm(`${c.label} ${c.hint ?? ""}`).includes(n)) : commands;
    return [...found, ...local];
  }, [q, commands, found]);

  useEffect(() => setActive(0), [q, found.length]);
  useEffect(() => { ref.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" }); }, [active]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, shown.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); shown[active]?.run(); }
  }

  let lastGroup = "";
  return (
    <dialog ref={ref} onClose={() => setOpen(false)} onClick={(e) => { if (e.target === ref.current) setOpen(false); }}
      className="mx-auto mt-[12vh] w-[min(94vw,38rem)] overflow-hidden rounded-2xl border border-line bg-surface p-0 shadow-lift" aria-label="Recherche et commandes">
      <div className="flex items-center gap-3 border-b border-line px-4">
        <Search size={18} className="shrink-0 text-muted" />
        <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKeyDown} placeholder="Chercher une offre, une entreprise, une page…"
          className="h-14 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted" aria-label="Rechercher" />
        <span className="kbd hidden sm:inline-flex">Échap</span>
      </div>
      <ul className="max-h-[50vh] overflow-y-auto p-2" role="listbox">
        {shown.map((it, i) => {
          const header = it.group !== lastGroup ? it.group : null;
          lastGroup = it.group;
          const Icon = it.icon;
          return (
            <li key={it.id} role="presentation">
              {header && <p className="px-3 pb-1 pt-3 text-xs font-semibold text-muted">{header}</p>}
              <button role="option" aria-selected={i === active} data-i={i} onMouseMove={() => setActive(i)} onClick={() => it.run()}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ${i === active ? "bg-paper" : ""}`}>
                <Icon size={18} className="shrink-0 text-muted" />
                <span className="min-w-0 flex-1"><span className="block truncate font-medium">{it.label}</span>{it.hint && <span className="block truncate text-sm text-muted">{it.hint}</span>}</span>
                {i === active && <CornerDownLeft size={16} className="shrink-0 text-muted" />}
              </button>
            </li>
          );
        })}
        {!shown.length && <li className="px-3 py-6 text-center text-sm text-muted">Rien ne correspond à « {q} ».</li>}
      </ul>
    </dialog>
  );
}
