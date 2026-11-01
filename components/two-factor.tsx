"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogOut, ShieldCheck, ShieldOff } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Logo } from "@/components/nav";
import { useFeedback } from "@/components/ui/feedback";

type Factor = { id: string; status: string; factor_type: string };

const friendly = (m: string) =>
  /disabled|not enabled/i.test(m)
    ? "La vérification en deux étapes n'est pas activée dans Supabase : Authentication > Sign In / Providers > Multi-Factor, puis active « TOTP »."
    : /invalid|expired|incorrect/i.test(m) ? "Ce code n'est pas le bon. Attends le prochain code de l'application et réessaie." : m;

/** Supabase renvoie le QR code en SVG « data: » : on le recode proprement pour que tous les navigateurs l'affichent. */
function qrSrc(qr: string) {
  const m = /^data:image\/svg\+xml[^,]*,([\s\S]*)$/.exec(qr);
  if (!m || /;base64/.test(qr.slice(0, qr.indexOf(",")))) return qr;
  let svg = m[1];
  try { svg = decodeURIComponent(svg); } catch { /* déjà en clair */ }
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Page affichée après la connexion quand la vérification en deux étapes est activée : on demande le code à 6 chiffres. */
export function TwoFactorGate() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const sb = supabaseBrowser();
    const { data, error: lf } = await sb.auth.mfa.listFactors();
    const factor = data?.totp?.[0];
    if (lf || !factor) { setBusy(false); return setErr("Aucune application d'authentification n'est reliée à ce compte."); }
    const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: factor.id, code: code.replace(/\s/g, "") });
    setBusy(false);
    if (error) return setErr(friendly(error.message));
    router.replace("/");
    router.refresh();
  }

  async function logout() {
    await supabaseBrowser().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="grid min-h-dvh place-items-center px-5 py-10">
      <div className="w-full max-w-sm">
        <Logo />
        <h1 className="display mt-8 text-[2.2rem]">Code de vérification</h1>
        <p className="mt-2 text-muted">Ouvre ton application d'authentification (Google Authenticator, Microsoft Authenticator, Authy…) et recopie le code à 6 chiffres de JobPilot.</p>
        <form onSubmit={verify} className="mt-6 space-y-3">
          <label className="block">
            <span className="label">Code à 6 chiffres</span>
            <input className="field mt-1 text-center text-2xl tracking-[0.4em]" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required autoFocus
              value={code} onChange={(e) => setCode(e.target.value)} aria-invalid={!!err || undefined} />
          </label>
          {err && <p className="rounded-xl bg-bad/10 p-3 text-sm text-bad" role="alert">{err}</p>}
          <button className="btn btn-primary btn-xl w-full" disabled={busy || code.replace(/\s/g, "").length < 6}>
            {busy ? <><Loader2 size={18} className="animate-spin" /> Vérification…</> : "Valider"}
          </button>
        </form>
        <button className="btn btn-ghost mt-3 w-full" onClick={logout}><LogOut size={16} /> Me déconnecter</button>
      </div>
    </div>
  );
}

/** Bloc des Réglages : activer, voir l'état, désactiver la vérification en deux étapes. */
export function TwoFactorCard() {
  const { toast, confirm } = useFeedback();
  const router = useRouter();
  const [factors, setFactors] = useState<Factor[] | null>(null);
  const [setup, setSetup] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabaseBrowser().auth.mfa.listFactors();
    setFactors(((data?.all ?? []) as Factor[]).filter((f) => f.factor_type === "totp"));
  }, []);
  useEffect(() => { void load(); }, [load]);

  const active = factors?.find((f) => f.status === "verified");

  async function start() {
    setBusy(true);
    setErr(null);
    const sb = supabaseBrowser();
    // On nettoie les essais abandonnés, sinon Supabase refuse un second enregistrement
    for (const f of factors ?? []) if (f.status !== "verified") await sb.auth.mfa.unenroll({ factorId: f.id });
    const { data, error } = await sb.auth.mfa.enroll({ factorType: "totp", friendlyName: `JobPilot ${new Date().toISOString().slice(0, 16)}`, issuer: "JobPilot" });
    setBusy(false);
    if (error || !data) return setErr(friendly(error?.message ?? "Impossible de démarrer."));
    setSetup({ id: data.id, qr: qrSrc(data.totp.qr_code), secret: data.totp.secret });
    setCode("");
  }

  async function cancel() {
    if (setup) await supabaseBrowser().auth.mfa.unenroll({ factorId: setup.id });
    setSetup(null);
    setErr(null);
    void load();
  }

  async function confirmCode(e: React.FormEvent) {
    e.preventDefault();
    if (!setup) return;
    setBusy(true);
    setErr(null);
    const { error } = await supabaseBrowser().auth.mfa.challengeAndVerify({ factorId: setup.id, code: code.replace(/\s/g, "") });
    setBusy(false);
    if (error) return setErr(friendly(error.message));
    setSetup(null);
    await load();
    router.refresh();
    toast("Vérification en deux étapes activée.");
  }

  async function disable() {
    if (!active) return;
    const ok = await confirm({ title: "Désactiver la vérification en deux étapes ?", body: "Ton compte ne sera plus protégé que par le mot de passe.", confirmLabel: "Désactiver", danger: true });
    if (!ok) return;
    setBusy(true);
    const { error } = await supabaseBrowser().auth.mfa.unenroll({ factorId: active.id });
    setBusy(false);
    if (error) return setErr(friendly(error.message));
    await load();
    router.refresh();
    toast("Vérification en deux étapes désactivée.");
  }

  return (
    <div className="mt-5 border-t border-line pt-5" aria-label="Vérification en deux étapes">
      <h3 className="heading flex items-center gap-2">Vérification en deux étapes {active && <span className="tag text-good"><ShieldCheck size={13} /> Activée</span>}</h3>
      {!setup && (
        <>
          <p className="mt-1 max-w-[60ch] text-sm text-muted">
            {active
              ? "À chaque connexion, JobPilot demande aussi un code à 6 chiffres affiché par ton application d'authentification."
              : "Ajoute une protection : après ton mot de passe, JobPilot demande un code à 6 chiffres affiché sur ton téléphone. Facultatif."}
          </p>
          <div className="mt-3">
            {factors === null ? <span className="text-sm text-muted">Chargement…</span>
              : active ? <button className="btn" onClick={disable} disabled={busy}><ShieldOff size={16} /> Désactiver</button>
              : <button className="btn" onClick={start} disabled={busy}>{busy ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />} Activer la vérification en deux étapes</button>}
          </div>
        </>
      )}
      {setup && (
        <form onSubmit={confirmCode} className="mt-3 space-y-3">
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            <li>Installe une application d'authentification sur ton téléphone (Google Authenticator, Microsoft Authenticator, Authy…).</li>
            <li>Dans l'application, ajoute un compte et scanne ce QR code.</li>
            <li>Recopie ci-dessous le code à 6 chiffres qu'elle affiche.</li>
          </ol>
          <div className="flex flex-wrap items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={setup.qr} alt="QR code à scanner avec l'application d'authentification" width={168} height={168} className="rounded-xl border border-line bg-white p-2" />
            <div className="min-w-0 text-sm">
              <p className="text-muted">Pas de caméra ? Saisis ce code dans l'application. Garde-le aussi en lieu sûr : il permet de la reconfigurer si tu perds ton téléphone.</p>
              <code className="mt-1 block break-all rounded-lg bg-paper px-2 py-1.5 font-mono text-xs">{setup.secret}</code>
            </div>
          </div>
          <label className="block max-w-xs"><span className="label">Code à 6 chiffres</span>
            <input className="field mt-1 text-center text-xl tracking-[0.35em]" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required value={code} onChange={(e) => setCode(e.target.value)} />
          </label>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-primary" disabled={busy || code.replace(/\s/g, "").length < 6}>{busy ? <Loader2 size={16} className="animate-spin" /> : null} Activer</button>
            <button type="button" className="btn btn-ghost" onClick={cancel} disabled={busy}>Annuler</button>
          </div>
        </form>
      )}
      {err && <p className="mt-3 rounded-xl bg-bad/10 p-3 text-sm text-bad" role="alert">{err}</p>}
    </div>
  );
}
