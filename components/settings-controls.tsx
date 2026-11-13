"use client";
import { bookmarkletCode } from "@/lib/bookmarklet";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Download, Loader2, Plug, RefreshCw, Trash2, Zap, CalendarPlus, Bookmark, KeyRound, LogOut, MailCheck } from "lucide-react";
import { reconnectHref } from "@/lib/gmail-errors";
import { supabaseBrowser, myId } from "@/lib/supabase/client";
import { useFeedback } from "@/components/ui/feedback";
import { TwoFactorCard } from "@/components/two-factor";
import type { Profile } from "@/lib/types";
import { useT } from "@/components/i18n";
import { tx } from "@/lib/i18n/translate";

const copy = async (text: string) => {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
};

/**
 * Gmail connecté : « Reconnecter » est toujours là (un nouvel accès remplace l'ancien, sans rien perdre) ; il passe en bouton principal
 * quand Google a coupé l'accès. `recap` : le récap du matin est actif, la reconnexion redemande alors aussi la permission d'envoi.
 */
export function GmailControls({ connected, issue = false, recap = false }: { connected: boolean; issue?: boolean; recap?: boolean }) {
  const t = useT();
  const router = useRouter();
  const { confirm, toast } = useFeedback();
  if (!connected) return <a href="/api/gmail/connect" className="btn btn-primary btn-xl"><Plug size={18} /> {t("Connecter Gmail (lecture seule)")}</a>;
  return (
    <>
      <a href={reconnectHref(recap)} className={`btn ${issue ? "btn-primary" : ""}`}><RefreshCw size={16} /> {t("Reconnecter Gmail")}</a>
      <button className="btn" onClick={async () => {
        if (!(await confirm({ title: t("Déconnecter Gmail ?"), body: "Les emails déjà rangés restent dans l'app. Tu pourras reconnecter Gmail quand tu veux.", confirmLabel: "Déconnecter" }))) return;
        await fetch("/api/gmail/disconnect", { method: "POST" });
        toast(t("Gmail est déconnecté."));
        router.refresh();
      }}>{t("Déconnecter")}</button>
    </>
  );
}

/** Récap du matin par email : la permission d'envoi n'est demandée à Google qu'au moment de l'activer. */
export function RecapControls({ email, enabled, sendOk, last }: { email: string; enabled: boolean; sendOk: boolean; last?: { at: string; ok: boolean; note?: string } }) {
  const t = useT();
  const router = useRouter();
  const { toast } = useFeedback();
  const [busy, setBusy] = useState<"test" | "off" | null>(null);
  const on = enabled && sendOk;

  async function test() {
    setBusy("test");
    const res = await fetch("/api/gmail/recap", { method: "POST" });
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(null);
    if (!res.ok) return toast(j.error ?? "Envoi impossible.", { tone: "err", ms: 9000 });
    toast(t("Test envoyé à {1}. Regarde ta boîte de réception (et les indésirables).", [email]), { ms: 7000 });
    router.refresh();
  }
  async function off() {
    setBusy("off");
    const sb = supabaseBrowser();
    const id = await myId(sb);
    const { data } = await sb.from("profiles").select("data").maybeSingle();
    const p = (data?.data ?? {}) as Partial<Profile>;
    const { error } = await sb.from("profiles").upsert({ user_id: id, data: { ...p, preferences: { ...p.preferences, daily_recap: false } }, updated_at: new Date().toISOString() });
    setBusy(null);
    if (error) return toast(t("Réglage non enregistré."), { tone: "err" });
    toast(t("Récap du matin désactivé."));
    router.refresh();
  }

  return (
    <div className="mt-6 border-t border-line pt-5" aria-label={t("Récap du matin par email")}>
      <h3 className="heading flex items-center gap-2">{t("Récap du matin par email")} {on && <span className="tag text-good"><MailCheck size={13} /> {t("Activé")}</span>}</h3>
      <p className="mt-1 max-w-[62ch] text-sm text-muted">
        {t("Chaque matin vers 7 h, un seul email à toi-même ({1}) : entretiens des 3 jours à venir, relances après entretien, offres à trier et ton objectif de la semaine. Rien n'est envoyé s'il n'y a rien de neuf.", [email])}
      </p>
      {on ? (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn" onClick={test} disabled={!!busy}>{busy === "test" ? <Loader2 size={16} className="animate-spin" /> : <MailCheck size={16} />} {t("M'envoyer un test maintenant")}</button>
            <button className="btn btn-ghost" onClick={off} disabled={!!busy}>{t("Désactiver")}</button>
          </div>
          {last && (
            <p className={`mt-3 text-sm ${last.ok ? "text-muted" : "text-bad"}`} role={last.ok ? undefined : "alert"}>
              {last.ok ? t("Dernier envoi : {1}.", [new Date(last.at).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })])
                : t("Dernier envoi raté : {1}. Si Google a coupé l'accès, clique « Réactiver » ci-dessous.", [(last.note ?? "erreur").replace(/\.$/, "")])}
            </p>
          )}
          {last && !last.ok && <a href="/api/gmail/connect?recap=1" className="btn mt-2">{t("Réactiver le récap")}</a>}
        </>
      ) : (
        <>
          <div className="mt-3"><a href="/api/gmail/connect?recap=1" className="btn btn-primary"><MailCheck size={16} /> {t("Activer le récap du matin")}</a></div>
          <p className="mt-2 max-w-[62ch] text-xs text-muted">
            {t("Google te demandera la permission « envoyer des emails ». JobPilot ne s'en sert que pour t'écrire à toi, jamais à quelqu'un d'autre. Tu peux la retirer en cliquant « Déconnecter » ci-dessus.")}
          </p>
        </>
      )}
    </div>
  );
}

export function LogoutButton() {
  const t = useT();
  const router = useRouter();
  return <button className="btn" onClick={async () => { await supabaseBrowser().auth.signOut(); router.replace("/"); router.refresh(); }}><LogOut size={16} /> {t("Se déconnecter")}</button>;
}

/** Objectif de la semaine et ancienneté maximale demandée : enregistrés dès que tu quittes le champ. */
export function Prefs({ maxYears, weeklyGoal, dailyQuota }: { maxYears: number | null; weeklyGoal: number; dailyQuota: number }) {
  const t = useT();
  const sb = useMemo(() => supabaseBrowser(), []);
  const { toast } = useFeedback();
  const [years, setYears] = useState(maxYears ?? 3);
  const [limited, setLimited] = useState(maxYears != null);
  const [goal, setGoal] = useState(weeklyGoal);
  const [quota, setQuota] = useState(dailyQuota);
  async function save(patch: Partial<Profile["preferences"]>) {
    const id = await myId(sb);
    const { data } = await sb.from("profiles").select("data").maybeSingle();
    const p = (data?.data ?? {}) as Partial<Profile>;
    const { error } = await sb.from("profiles").upsert({ user_id: id, data: { ...p, preferences: { ...p.preferences, ...patch } }, updated_at: new Date().toISOString() });
    toast(error ? t("Réglage non enregistré.") : t("Enregistré."), { tone: error ? "err" : "ok", ms: 1800 });
  }
  const num = (v: number, set: (n: number) => void, key: "max_years" | "weekly_goal" | "daily_quota", min: number, max: number) => ({
    type: "number" as const, min, max, className: "field !w-20 text-center", value: v,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(Number(e.target.value)),
    onBlur: () => { const n = Math.max(min, Math.min(max, Math.round(v) || min)); set(n); save({ [key]: n }); },
  });
  return (
    <div className="space-y-4">
      <label className="flex flex-wrap items-center gap-3">
        <span>{t("Mon objectif : envoyer")}</span>
        <input aria-label={t("Candidatures par semaine")} {...num(goal, setGoal, "weekly_goal", 1, 50)} />
        <span>{t("candidatures par semaine")}</span>
      </label>
      <label className="flex flex-wrap items-center gap-3">
        <span>{t("Ma liste du jour (page Recherche) :")} </span>
        <input aria-label={t("Candidatures visées par jour")} {...num(quota, setQuota, "daily_quota", 1, 50)} />
        <span>{t("offres par jour")}</span>
      </label>
      <div className="space-y-2">
        <label className="flex items-center gap-2">
          <input type="checkbox" className="h-4 w-4 accent-[var(--color-marigold)]" checked={!limited}
            onChange={(e) => { setLimited(!e.target.checked); save({ max_years: e.target.checked ? null : years }); }} />
          {t("Pas de limite d'expérience : aucune offre n'est écartée pour ça")}
        </label>
        {limited && (
          <label className="flex flex-wrap items-center gap-3">
            <span>{t("Écarter ou pénaliser les offres qui demandent plus de")}</span>
            <input aria-label={t("Années d'expérience maximum")} {...num(years, setYears, "max_years", 0, 15)} />
            <span>{t("ans d'expérience")}</span>
          </label>
        )}
      </div>
    </div>
  );
}

/** Test réel de la clé IA : un tout petit appel, avec le modèle et le temps de réponse. */
export function AiTest() {
  const t = useT();
  const [busy, setBusy] = useState(false);
  type Line = { id: string; name: string; model: string; ok: boolean; ms: number; error?: string };
  const [res, setRes] = useState<{ error?: string; lines?: Line[] } | null>(null);
  async function run() {
    setBusy(true);
    setRes(null);
    const r = await fetch("/api/health/ai", { method: "POST" }).then((r) => r.json()).catch(() => ({ error: "Connexion interrompue." }));
    setBusy(false);
    setRes(r.error ? { error: r.error } : { lines: r.providers as Line[] });
  }
  return (
    <div>
      <button className="btn btn-sm" onClick={run} disabled={busy}>{busy ? <Loader2 size={15} className="animate-spin" /> : <Zap size={15} />} {t("Tester l'IA")}</button>
      {res?.error && <p className="mt-2 text-sm text-bad" role="status">{t(res.error)}</p>}
      {res?.lines && (
        <ul className="mt-2 space-y-1 text-sm" role="status">
          {res.lines.map((l) => (
            <li key={l.id} className={l.ok ? "text-good" : "text-bad"}>
              {t(l.name)} ({t(l.model)}) : {l.ok ? t("répond en {1} s", [(l.ms / 1000).toFixed(1)]) : t(l.error)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Test réel des sources d'offres : une requête par source branchée (clé valable, quota, réponse). */
export function SourcesTest() {
  const t = useT();
  const [busy, setBusy] = useState(false);
  type Line = { id: string; label: string; configured: boolean; ok: boolean; count: number; ms: number; error?: string };
  const [res, setRes] = useState<{ error?: string; lines?: Line[] } | null>(null);
  async function run() {
    setBusy(true);
    setRes(null);
    const r = await fetch("/api/admin/sources", { method: "POST" }).then((r) => r.json()).catch(() => ({ error: "Connexion interrompue." }));
    setBusy(false);
    setRes(r.error ? { error: r.error } : { lines: r.sources as Line[] });
  }
  return (
    <div>
      <button className="btn btn-sm" onClick={run} disabled={busy}>{busy ? <Loader2 size={15} className="animate-spin" /> : <Zap size={15} />} {t("Tester les sources")}</button>
      {res?.error && <p className="mt-2 text-sm text-bad" role="status">{t(res.error)}</p>}
      {res?.lines && (
        <ul className="mt-2 space-y-1 text-sm" role="status">
          {res.lines.map((l) => (
            <li key={l.id} className={!l.configured ? "text-muted" : l.ok ? "text-good" : "text-bad"}>
              {!l.configured ? t("{1} : non branchée", [l.label]) : l.ok ? t("{1} : répond en {2} s ({3} offre{4} sur la requête de test)", [l.label, (l.ms / 1000).toFixed(1), l.count, l.count > 1 ? "s" : ""]) : l.error?.startsWith(l.label) ? t(l.error) : `${l.label} : ${l.error}`}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function CopySql({ sql }: { sql: string }) {
  const t = useT();
  const { toast } = useFeedback();
  return (
    <button className="btn btn-primary btn-sm" onClick={async () => toast((await copy(sql)) ? t("Script copié. Colle-le dans Supabase (SQL Editor), puis Run.") : t("Copie impossible : sélectionne le texte à la main."), { tone: "info", ms: 6000 })}>
      <Copy size={15} /> {t("Copier le script")}
    </button>
  );
}

/** Favori à glisser dans la barre du navigateur : sur une annonce ou une page de résultats, un clic envoie la page à JobPilot. */
export function Bookmarklet() {
  const t = useT();
  const ref = useRef<HTMLAnchorElement>(null);
  const [code, setCode] = useState("");
  const { toast } = useFeedback();
  useEffect(() => {
    const app = location.origin;
    const js = bookmarkletCode(app);
    setCode(js);
    // React refuse les adresses « javascript: » dans un lien : on les pose directement dans la page
    ref.current?.setAttribute("href", js);
  }, []);
  return (
    <div>
      <p className="max-w-[62ch] text-muted">
        {t("Sur LinkedIn, Indeed, Welcome to the Jungle ou n'importe quel site : un clic sur ce favori envoie ce que tu regardes à JobPilot. Une annonce est analysée tout de suite ; une page de résultats est triée, chaque annonce est lue avec ta propre session (jamais sur LinkedIn), notée et rangée dans Recommandées, et les meilleures reçoivent leur diagnostic complet. Tu n'as plus qu'à choisir.")}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <a ref={ref} href="#" onClick={(e) => { if (!(e.currentTarget.getAttribute("href") ?? "").startsWith("javascript:")) e.preventDefault(); else { e.preventDefault(); toast(t("Ne clique pas ici : glisse ce bouton dans ta barre de favoris."), { tone: "info" }); } }}
          className="btn btn-primary cursor-grab" draggable><Bookmark size={16} /> {t("Envoyer à JobPilot")}</a>
        <span className="text-sm text-muted">{t("Glisse-le dans ta barre de favoris (Ctrl+Maj+B pour l'afficher).")}</span>
      </div>
      <button className="link mt-3 text-sm" onClick={async () => toast((await copy(code)) ? t("Code copié : crée un favori et colle-le à la place de l'adresse.") : t("Copie impossible."), { tone: "info", ms: 6000 })}>
        {t("Sur téléphone ou le glisser ne marche pas ? Copier le code du favori")}
      </button>
    </div>
  );
}

export function CalendarFeed({ initialUrl }: { initialUrl: string | null }) {
  const t = useT();
  const { toast, confirm } = useFeedback();
  const [url, setUrl] = useState(initialUrl);
  const [busy, setBusy] = useState(false);
  async function call(action: "create" | "revoke") {
    setBusy(true);
    const r = await fetch("/api/calendar/token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) }).then((r) => r.json()).catch(() => ({ error: "Connexion interrompue." }));
    setBusy(false);
    if (r.error) return toast(r.error, { tone: "err" });
    setUrl(r.url);
    toast(action === "create" ? t("Agenda créé. Abonne ton téléphone avec le lien.") : t("Lien supprimé : l'ancien agenda ne s'actualise plus."));
  }
  if (!url) return <button className="btn" onClick={() => call("create")} disabled={busy}><CalendarPlus size={16} /> {t("Créer mon agenda")}</button>;
  return (
    <div className="space-y-3">
      <p className="break-all rounded-xl bg-paper p-3 font-mono text-xs">{t(url)}</p>
      <div className="flex flex-wrap gap-2">
        <a className="btn btn-primary btn-sm" href={url.replace(/^https?:/, "webcal:")}><CalendarPlus size={15} /> {t("S'abonner")}</a>
        <button className="btn btn-sm" onClick={async () => toast((await copy(url)) ? t("Lien copié.") : t("Copie impossible."), { tone: "info" })}><Copy size={15} /> {t("Copier le lien")}</button>
        <button className="btn btn-sm" onClick={async () => { if (await confirm({ title: t("Changer le lien de l'agenda ?"), body: "L'ancien lien arrête de fonctionner. Il faudra te réabonner avec le nouveau.", confirmLabel: "Changer le lien" })) { await call("revoke"); await call("create"); } }} disabled={busy}>{t("Changer le lien")}</button>
        <button className="btn btn-sm btn-ghost text-bad" onClick={() => call("revoke")} disabled={busy}>{t("Désactiver")}</button>
      </div>
    </div>
  );
}

/** Compte : l'adresse, le changement de mot de passe (ancien mot de passe, puis le nouveau saisi deux fois) et la déconnexion, dans un seul cadre. */
export function AccountCard({ email }: { email: string }) {
  const t = useT();
  const { toast } = useFeedback();
  const [open, setOpen] = useState(false);
  const [old, setOld] = useState("");
  const [pw, setPw] = useState("");
  const [again, setAgain] = useState("");
  const [noOld, setNoOld] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const reset = () => { setOld(""); setPw(""); setAgain(""); setNoOld(false); setErr(null); };
  const mismatch = again.length > 0 && pw !== again;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (pw.length < 8) return setErr(t("Le nouveau mot de passe doit faire 8 caractères au minimum."));
    if (pw !== again) return setErr(t("Les deux nouveaux mots de passe ne sont pas identiques."));
    if (!noOld && pw === old) return setErr(t("Choisis un mot de passe différent de l'ancien."));
    setBusy(true);
    const sb = supabaseBrowser();
    if (!noOld) {
      // On vérifie l'ancien mot de passe avant de changer quoi que ce soit
      const res = await fetch("/api/account/check-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: old }) });
      if (!res.ok) { setBusy(false); return setErr(res.status === 401 ? t("L'ancien mot de passe n'est pas le bon.") : t("Vérification impossible. Réessaie dans un instant.")); }
    }
    const { error } = await sb.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return setErr(error.message.includes("same") ? t("Choisis un mot de passe différent de l'actuel.") : t("Mot de passe refusé : essaie-en un plus long."));
    reset();
    setOpen(false);
    toast(t("Mot de passe modifié."));
  }

  return (
    <div className="max-w-xl rounded-2xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1"><p className="text-sm text-muted">{t("Adresse de connexion")}</p><p className="truncate font-semibold">{t(email)}</p></div>
        <LogoutButton />
      </div>

      <div className="mt-5 border-t border-line pt-5">
        {!open ? (
          <button className="btn" onClick={() => setOpen(true)}><KeyRound size={16} /> {t("Modifier mon mot de passe")}</button>
        ) : (
          <form onSubmit={submit} className="space-y-3" aria-label={t("Modifier mon mot de passe")}>
            <h3 className="heading">{t("Modifier mon mot de passe")}</h3>
            {!noOld && (
              <label className="block"><span className="label">{t("Ancien mot de passe")}</span>
                <input type="password" required autoComplete="current-password" className="field mt-1" value={old} onChange={(e) => setOld(e.target.value)} />
              </label>
            )}
            <label className="block"><span className="label">{t("Nouveau mot de passe")} <span className="font-normal text-muted">{t("8 caractères minimum")}</span></span>
              <input type="password" required minLength={8} autoComplete="new-password" className="field mt-1" value={pw} onChange={(e) => setPw(e.target.value)} />
            </label>
            <label className="block"><span className="label">{t("Nouveau mot de passe, une seconde fois")}</span>
              <input type="password" required minLength={8} autoComplete="new-password" aria-invalid={mismatch || undefined} className={`field mt-1 ${mismatch ? "!border-bad" : ""}`} value={again} onChange={(e) => setAgain(e.target.value)} />
            </label>
            {mismatch && <p className="text-sm text-bad">{t("Les deux ne sont pas identiques.")}</p>}
            <label className="flex items-center gap-2 text-sm text-muted">
              <input type="checkbox" checked={noOld} onChange={(e) => setNoOld(e.target.checked)} /> {t("Je n'ai pas encore de mot de passe (je me connecte par lien email)")}
            </label>
            {noOld && <p className="-mt-1 text-xs text-muted">{t("Tu es déjà connecté avec le lien de l'email : aucune autre vérification n'est demandée, le mot de passe est enregistré tout de suite.")}</p>}
            {err && <p className="rounded-xl bg-bad/10 p-3 text-sm text-bad" role="alert">{t(err)}</p>}
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-primary" disabled={busy}>{busy ? <><Loader2 size={16} className="animate-spin" /> {t("Modification…")}</> : <><Check size={16} /> {t("Modifier")}</>}</button>
              <button type="button" className="btn btn-ghost" onClick={() => { reset(); setOpen(false); }}>{t("Annuler")}</button>
            </div>
          </form>
        )}
      </div>

      <TwoFactorCard />
    </div>
  );
}

export function DataControls() {
  const t = useT();
  const router = useRouter();
  const { ask, toast } = useFeedback();
  async function del() {
    const v = await ask({ title: tx("Supprimer mon compte et toutes mes données ?"), label: tx("Pour confirmer, tape SUPPRIMER"), confirmLabel: tx("Supprimer définitivement"), placeholder: tx("SUPPRIMER") });
    if (v == null) return;
    const r = await fetch("/api/account/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: v.trim() }) }).then((r) => r.json()).catch(() => ({ error: "Connexion interrompue." }));
    if (r.error) return toast(r.error, { tone: "err", ms: 9000 });
    await supabaseBrowser().auth.signOut();
    router.replace("/");
    router.refresh();
  }
  return (
    <div className="flex flex-wrap gap-2">
      <a className="btn" href="/api/account/export" download><Download size={16} /> {t("Télécharger mes données")}</a>
      <button className="btn btn-danger" onClick={del}><Trash2 size={16} /> {t("Supprimer mon compte")}</button>
    </div>
  );
}
