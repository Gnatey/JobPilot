"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CircleCheck, Eye, EyeOff, FileText, Inbox, Sparkles } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Logo } from "@/components/nav";
import { Gauge } from "@/components/ui/score";

/** Messages d'erreur de Supabase traduits en français clair, avec quoi faire. */
function friendly(message: string, mode: "login" | "signup") {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "Email ou mot de passe incorrect.";
  if (m.includes("rate limit") || m.includes("too many") || m.includes("security purposes")) return "Trop de demandes d'email en ce moment. Attends quelques minutes puis réessaie, ou connecte-toi avec ton mot de passe si tu as déjà un compte.";
  if (m.includes("already registered") || m.includes("already been registered")) return "Un compte existe déjà avec cet email. Connecte-toi, ou utilise « Mot de passe oublié ».";
  if (m.includes("email not confirmed")) return "Ton adresse n'est pas encore confirmée : clique sur le lien reçu par email (regarde aussi les indésirables).";
  if (m.includes("password") && m.includes("characters")) return "Le mot de passe doit faire 8 caractères au minimum.";
  if (m.includes("password") && (m.includes("weak") || m.includes("pwned") || m.includes("easy to guess"))) return "Ce mot de passe est trop facile à deviner. Choisis-en un plus long ou plus original.";
  if (m.includes("unable to validate email") || m.includes("invalid format") || m.includes("invalid email")) return "Cette adresse email ne semble pas valide.";
  if (m.includes("captcha")) return "La vérification anti-robot a échoué. Recharge la page et réessaie.";
  if (m.includes("failed to fetch") || m.includes("network")) return "Connexion impossible. Vérifie ta connexion internet et réessaie.";
  return mode === "signup" ? "La création du compte a échoué. Réessaie dans un instant." : "La connexion a échoué. Réessaie dans un instant.";
}

const POINTS = [
  { icon: Sparkles, text: "Colle un lien : ton score de compatibilité arrive en 20 secondes." },
  { icon: FileText, text: "Un CV taillé pour chaque offre, prêt à envoyer en PDF." },
  { icon: Inbox, text: "Tes emails de recruteurs rangés et ton suivi à jour, tout seuls." },
];

export function LoginForm({ initialMode, linkExpired }: { initialMode: "login" | "signup"; linkExpired: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [mode, setMode] = useState<"login" | "signup">(initialMode);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean; done?: boolean } | null>(
    linkExpired ? { text: "Ce lien a expiré ou a déjà servi. Demande-en un nouveau ci-dessous.", bad: true } : null,
  );
  const [busy, setBusy] = useState(false);
  const router = useRouter();


  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const sb = supabaseBrowser();
    const { data, error } =
      mode === "login"
        ? await sb.auth.signInWithPassword({ email, password })
        : await sb.auth.signUp({ email, password, options: { emailRedirectTo: `${location.origin}/auth/callback` } });
    setBusy(false);
    if (error) return setMsg({ text: friendly(error.message, mode), bad: true });
    if (mode === "signup" && !data.session) {
      // Supabase exige la confirmation de l'adresse : on le dit clairement, et on prépare la connexion
      setPassword("");
      setMode("login");
      return setMsg({ text: `Compte créé ! Un email de confirmation vient d'être envoyé à ${email}. Clique sur le lien qu'il contient (regarde aussi dans les courriers indésirables), puis reviens te connecter ici.`, done: true });
    }
    router.replace("/");
    router.refresh();
  }

  async function sendLink(kind: "magic" | "reset") {
    if (!email) return setMsg({ text: "Saisis ton email d'abord.", bad: true });
    setBusy(true);
    const sb = supabaseBrowser();
    const { error } = kind === "magic"
      ? await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: `${location.origin}/auth/callback` } })
      : await sb.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/auth/callback?next=/parametres` });
    setBusy(false);
    setMsg(error ? { text: friendly(error.message, "login"), bad: true } : { text: kind === "magic" ? "Lien de connexion envoyé. Ouvre-le sur cet appareil." : "Email envoyé. Le lien te connecte, puis tu choisis un nouveau mot de passe dans Réglages." });
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-chrome p-12 text-white lg:flex lg:flex-col">
        <Logo tone="light" />
        <div className="my-auto max-w-lg">
          <h2 className="display text-[3.4rem] leading-[0.98]">Ta recherche d'emploi, sans la corvée.</h2>
          <ul className="mt-10 space-y-4">
            {POINTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex gap-3 text-chrome-ink"><Icon size={20} className="mt-0.5 shrink-0 text-marigold" /> {text}</li>
            ))}
          </ul>
        </div>
        <div className="flex w-fit items-center gap-4 rounded-2xl bg-surface p-4 text-ink shadow-lift" aria-hidden>
          <Gauge value={87} size={84} label="" />
          <div><p className="text-xs text-muted">Exemple</p><p className="font-semibold">Data Analyst, secteur banque</p><p className="text-sm text-good">Postule</p></div>
        </div>
      </aside>

      <div className="grid place-items-center px-5 py-10">
        <div className="w-full max-w-sm">
          <div className="lg:hidden"><Logo /></div>
          <h1 className="display mt-8 text-[2.4rem] lg:mt-0">{mode === "login" ? "Reprendre ta recherche" : "Créer ton espace"}</h1>
          <p className="mt-2 text-muted lg:hidden">Suivi des candidatures, CV taillés pour chaque offre, réponses de Gmail rangées pour toi.</p>
          <form onSubmit={submit} className="mt-6 space-y-3">
            <label className="block">
              <span className="label">Email</span>
              <input className="field mt-1" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="block">
              <span className="label">Mot de passe</span>
              <span className="relative mt-1 block">
                <input className="field !pr-12" type={show ? "text" : "password"} required minLength={8} autoComplete={mode === "login" ? "current-password" : "new-password"}
                  value={password} onChange={(e) => setPassword(e.target.value)} />
                <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                  className="absolute right-1.5 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full text-muted hover:bg-paper">{show ? <EyeOff size={18} /> : <Eye size={18} />}</button>
              </span>
              {mode === "signup" && <span className="mt-1 block text-xs text-muted">8 caractères minimum.</span>}
            </label>
            <button className="btn btn-primary btn-xl w-full" disabled={busy}>{busy ? "Un instant…" : mode === "login" ? "Se connecter" : "Créer le compte"}</button>
            {mode === "signup" && (
              <p className="text-xs text-muted">
                En créant un compte, tu acceptes que les textes que tu fournis (profil, offres) soient envoyés à l'IA Gemini de Google pour les analyses.
                Détails dans la <Link href="/confidentialite" className="link">politique de confidentialité</Link> et les <Link href="/mentions-legales" className="link">mentions légales</Link>.
              </p>
            )}
          </form>
          <div className="mt-2 flex flex-col">
            <button className="btn btn-ghost w-full" onClick={() => sendLink("magic")} disabled={busy}>Recevoir un lien de connexion par email</button>
            {mode === "login" && <button className="link mt-1 self-center text-sm text-muted" onClick={() => sendLink("reset")} disabled={busy}>Mot de passe oublié ?</button>}
          </div>
          {msg && (
            <p className={`mt-4 flex gap-2.5 rounded-xl p-3 text-sm ${msg.bad ? "bg-bad/10 text-bad" : msg.done ? "border border-good/40 bg-good/10 text-ink" : "bg-surface"}`} role={msg.bad ? "alert" : "status"}>
              {msg.done && <CircleCheck size={20} className="mt-px shrink-0 text-good" aria-hidden />}
              <span>{msg.text}</span>
            </p>
          )}
          <p className="mt-6 text-center text-sm text-muted">
            {mode === "login" ? "Pas encore de compte ?" : "Déjà un compte ?"}{" "}
            <button className="font-semibold text-ink underline" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setMsg(null); }}>
              {mode === "login" ? "Créer un compte" : "Se connecter"}
            </button>
          </p>
          <nav aria-label="Pages légales" className="mt-8 flex justify-center gap-5 text-xs text-muted">
            <Link href="/mentions-legales" className="link">Mentions légales</Link>
            <Link href="/confidentialite" className="link">Confidentialité</Link>
          </nav>
        </div>
      </div>
    </div>
  );
}
