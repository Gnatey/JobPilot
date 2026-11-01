"use client";
import { Logo } from "./logo";
export { Logo };
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Sun, Inbox, Plus, Columns3, BarChart3, Search, UserRound, Settings, FileText, ScanSearch, Menu, X, Zap, LogOut } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { today } from "@/lib/format";
import { openPalette } from "./palette";
import { ThemeToggle } from "./theme";

type BadgeKey = "recos" | "due";
const MAIN: { href: string; label: string; icon: typeof Sun; badge?: BadgeKey }[] = [
  { href: "/", label: "Aujourd'hui", icon: Sun },
  { href: "/recommandees", label: "Recommandées", icon: Inbox, badge: "recos" },
  { href: "/suivi", label: "Suivi", icon: Columns3, badge: "due" },
  { href: "/offres", label: "Offres & CV", icon: FileText },
  { href: "/recherche", label: "Recherche", icon: Search },
  { href: "/stats", label: "Stats", icon: BarChart3 },
];
const SECONDARY = [
  { href: "/mon-cv", label: "Mon CV", icon: ScanSearch },
  { href: "/profil", label: "Profil maître", icon: UserRound },
  { href: "/parametres", label: "Réglages", icon: Settings },
];

function active(path: string, href: string) {
  return href === "/" ? path === "/" : path.startsWith(href);
}

/** Compteurs de la barre latérale : chargés après l'affichage, sans ralentir la page. */
function useBadges(path: string) {
  const [b, setB] = useState<Record<BadgeKey, number>>({ recos: 0, due: 0 });
  const load = useCallback(async () => {
    const sb = supabaseBrowser();
    const [r, d] = await Promise.all([
      sb.from("recommendations").select("id", { count: "exact", head: true }).in("status", ["new", "analyzed"]).eq("senior", false),
      sb.from("applications").select("id", { count: "exact", head: true }).in("status", ["postule", "relance"]).lte("next_action_at", today()),
    ]);
    setB({ recos: r.count ?? 0, due: d.count ?? 0 });
  }, []);
  useEffect(() => { load(); }, [path, load]);
  useEffect(() => {
    const on = () => load();
    window.addEventListener("jp:badges", on);
    window.addEventListener("focus", on);
    return () => { window.removeEventListener("jp:badges", on); window.removeEventListener("focus", on); };
  }, [load]);
  return b;
}
/** À appeler après une action qui change les compteurs (trier une offre, envoyer une candidature…). */
export const refreshBadges = () => window.dispatchEvent(new Event("jp:badges"));

function Badge({ n, tone }: { n: number; tone: BadgeKey }) {
  if (!n) return null;
  return (
    <span className={`ml-auto grid min-w-5 place-items-center rounded-full px-1.5 text-[0.72rem] font-bold leading-5 ${tone === "due" ? "bg-bad text-white" : "bg-marigold text-chrome"}`}>
      {n > 99 ? "99+" : n}
    </span>
  );
}

/** Se déconnecter et revenir à la page d'accueil du site. */
function useSignOut() {
  const router = useRouter();
  return async () => {
    await supabaseBrowser().auth.signOut();
    router.replace("/");
    router.refresh();
  };
}

export function Nav() {
  const path = usePathname();
  const signOut = useSignOut();
  const badges = useBadges(path);
  const [more, setMore] = useState(false);
  const [mac, setMac] = useState(false);
  useEffect(() => setMore(false), [path]);
  useEffect(() => setMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)), []);
  useEffect(() => {
    if (!more) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMore(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [more]);
  if (path.startsWith("/bienvenue")) return null;

  const item = (href: string, label: string, Icon: typeof Sun, badge?: BadgeKey) => {
    const on = active(path, href);
    return (
      <Link key={href} href={href} aria-current={on ? "page" : undefined}
        className={`relative flex items-center gap-3 rounded-xl px-3 py-2 text-[0.94rem] transition-colors ${on ? "bg-chrome-2 font-semibold text-white" : "text-chrome-ink hover:bg-chrome-2/60 hover:text-white"}`}>
        {on && <span className="absolute -left-4 top-2 bottom-2 w-1 rounded-r-full bg-marigold" aria-hidden />}
        <Icon size={18} /> {label}
        {badge && <Badge n={badges[badge]} tone={badge} />}
      </Link>
    );
  };

  return (
    <>
      {/* Bureau : tableau de bord à gauche */}
      <aside aria-label="Menu" className="no-print sticky top-0 hidden h-dvh w-60 shrink-0 flex-col bg-chrome px-4 py-6 md:flex">
        <Logo tone="light" />
        <button onClick={openPalette} className="mt-6 flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm text-chrome-ink hover:bg-chrome-2/60">
          <Search size={16} /> Rechercher
          <span className="ml-auto flex gap-1"><span className="kbd !border-white/15 !bg-transparent !text-chrome-ink">{mac ? "⌘" : "Ctrl"}</span><span className="kbd !border-white/15 !bg-transparent !text-chrome-ink">K</span></span>
        </button>
        <Link href="/offres/nouvelle" className="btn btn-primary mt-3 w-full"><Plus size={18} /> Analyser une offre</Link>
        <nav className="mt-6 flex flex-col gap-0.5" aria-label="Navigation principale">
          {MAIN.map((m) => item(m.href, m.label, m.icon, m.badge))}
        </nav>
        <Link href="/recommandees/tri" className="mt-3 flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-marigold hover:bg-chrome-2/60">
          <Zap size={16} /> Tri rapide des offres
        </Link>
        <nav className="mt-auto flex flex-col gap-0.5 border-t border-white/10 pt-4" aria-label="Compte">
          {SECONDARY.map((m) => item(m.href, m.label, m.icon))}
          <ThemeToggle withLabel className="mt-1 flex items-center gap-3 rounded-xl px-3 py-2 text-[0.94rem] text-chrome-ink hover:bg-chrome-2/60 hover:text-white" />
          <button onClick={signOut} className="flex items-center gap-3 rounded-xl px-3 py-2 text-left text-[0.94rem] text-chrome-ink hover:bg-chrome-2/60 hover:text-white">
            <LogOut size={18} /> Se déconnecter
          </button>
        </nav>
      </aside>

      {/* Mobile : barre du haut */}
      <header className="no-print sticky top-0 z-30 flex items-center justify-between bg-chrome px-4 py-2.5 md:hidden">
        <Logo tone="light" size={26} />
        <button onClick={openPalette} aria-label="Rechercher" className="grid h-10 w-10 place-items-center rounded-full text-chrome-ink hover:bg-chrome-2"><Search size={20} /></button>
      </header>

      {/* Mobile : barre du bas */}
      <nav className="no-print fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 bg-chrome pb-[env(safe-area-inset-bottom)] md:hidden" aria-label="Navigation principale">
        {[MAIN[0], MAIN[1]].map(({ href, label, icon: Icon, badge }) => (
          <Link key={href} href={href} aria-current={active(path, href) ? "page" : undefined}
            className={`relative flex flex-col items-center gap-0.5 py-2.5 text-[0.7rem] ${active(path, href) ? "font-semibold text-white" : "text-chrome-ink"}`}>
            <span className="relative"><Icon size={21} />{badge && badges[badge] > 0 && <span className="absolute -right-2 -top-1 grid min-w-4 place-items-center rounded-full bg-marigold px-1 text-[0.62rem] font-bold leading-4 text-chrome">{badges[badge]}</span>}</span>
            {label}
          </Link>
        ))}
        <Link href="/offres/nouvelle" aria-label="Analyser une offre" className="flex items-center justify-center">
          <span className="-mt-7 grid h-14 w-14 place-items-center rounded-full bg-marigold text-chrome shadow-[0_8px_20px_-6px_rgba(245,184,0,.7)] ring-4 ring-paper">
            <Plus size={26} strokeWidth={2.5} />
          </span>
        </Link>
        <Link href="/suivi" aria-current={active(path, "/suivi") ? "page" : undefined}
          className={`flex flex-col items-center gap-0.5 py-2.5 text-[0.7rem] ${active(path, "/suivi") ? "font-semibold text-white" : "text-chrome-ink"}`}>
          <span className="relative"><Columns3 size={21} />{badges.due > 0 && <span className="absolute -right-2 -top-1 grid min-w-4 place-items-center rounded-full bg-bad px-1 text-[0.62rem] font-bold leading-4 text-white">{badges.due}</span>}</span>
          Suivi
        </Link>
        <button onClick={() => setMore(true)} aria-expanded={more} className="flex flex-col items-center gap-0.5 py-2.5 text-[0.7rem] text-chrome-ink"><Menu size={21} /> Plus</button>
      </nav>

      {more && (
        <div className="no-print fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Plus de pages">
          <button className="absolute inset-0 bg-black/55" aria-label="Fermer" onClick={() => setMore(false)} />
          <div className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-surface p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]" style={{ animation: "toast-in .2s ease-out both" }}>
            <div className="mb-2 flex items-center justify-between"><p className="heading text-lg">Plus</p><button aria-label="Fermer" className="btn btn-ghost btn-icon" onClick={() => setMore(false)}><X size={20} /></button></div>
            <div className="grid grid-cols-3 gap-2">
              {[MAIN[3], MAIN[4], MAIN[5], ...SECONDARY, { href: "/recommandees/tri", label: "Tri rapide", icon: Zap }].map(({ href, label, icon: Icon }) => (
                <Link key={href} href={href} className={`flex flex-col items-center gap-1.5 rounded-2xl border border-line px-2 py-3.5 text-center text-sm ${active(path, href) ? "bg-paper font-semibold" : ""}`}>
                  <Icon size={22} /> {label}
                </Link>
              ))}
              <ThemeToggle withLabel className="flex flex-col items-center gap-1.5 rounded-2xl border border-line px-2 py-3.5 text-center text-sm" />
              <button onClick={signOut} className="flex flex-col items-center gap-1.5 rounded-2xl border border-line px-2 py-3.5 text-center text-sm">
                <LogOut size={22} /> Se déconnecter
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
