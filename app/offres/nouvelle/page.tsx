"use client";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ClipboardPaste, Sparkles, Link2, Loader2, Bookmark } from "lucide-react";
import { PageTitle } from "@/components/ui/page-title";
import { useFeedback } from "@/components/ui/feedback";
import { analyzeOffer, isUrl, useSteps } from "@/lib/client/analyze";
import { Bookmarklet } from "@/components/settings-controls";

/** Premier lien trouvé dans un texte (le partage Android met l'URL dans « text »). */
const firstUrl = (s: string) => s.match(/https?:\/\/[^\s<>"')]+/i)?.[0] ?? "";

function Form() {
  const router = useRouter();
  const params = useSearchParams();
  const { toast } = useFeedback();
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [needText, setNeedText] = useState(params.get("needtext") === "1");
  const [busy, setBusy] = useState(false);
  const [keeping, setKeeping] = useState(false);
  const [kept, setKept] = useState(0); // offres gardées pendant cette visite
  const [details, setDetails] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const step = useSteps(busy);
  const started = useRef(false);

  const run = useCallback(async (u: string, t: string) => {
    setBusy(true);
    setErr(null);
    const r = await analyzeOffer({ url: u || undefined, text: t || undefined, reco_id: params.get("reco") ?? undefined, app_id: params.get("app") ?? undefined });
    if (r.error || !r.id) {
      setBusy(false);
      setErr(r.error ?? "L'analyse a échoué.");
      if (r.needsText) setNeedText(true);
      return;
    }
    if (r.existing) toast("Cette offre était déjà analysée, je te l'ouvre.", { tone: "info" });
    router.replace(`/offres/${r.id}${params.get("then") === "cv" ? "?go=cv" : ""}`);
  }, [params, router, toast]);

  // Arrivées préremplies : lien collé, bookmarklet (#u=…&t=…), partage depuis le téléphone (?url, ?text, ?title)
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
    const shared = params.get("text") ?? "";
    const u = hash.get("u") || params.get("url") || firstUrl(shared) || "";
    let t = hash.get("t") || (shared && !isUrl(shared) ? shared.replace(u, "").trim() : "") || "";
    if (!t && params.get("title") && !u) t = params.get("title") ?? "";
    // Partage depuis le téléphone avec un lien : le titre de la page sert de poste pour « Garder pour plus tard »
    if (u && params.get("title")) { setTitle((params.get("title") ?? "").slice(0, 200)); setDetails(true); }
    if (u) setUrl(u);
    if (t) setText(t);
    if (hash.size) history.replaceState(null, "", location.pathname + location.search);
    if (params.get("auto") === "1" && (u || t.length >= 150)) run(u, t);
  }, [params, run]);

  function takeClip(raw: string) {
    const c = raw.trim();
    if (!c) return toast("Le presse-papiers est vide.", { tone: "info" });
    if (isUrl(c)) { setUrl(c); run(c, ""); } else { setText(c); toast("Texte collé. Il ne reste qu'à lancer l'analyse.", { tone: "info" }); }
  }

  async function paste() {
    try {
      takeClip(await navigator.clipboard.readText());
    } catch {
      toast("Ton navigateur bloque le bouton : fais Ctrl+V (⌘V sur Mac) n'importe où sur cette page.", { tone: "info" });
    }
  }

  // Ctrl+V n'importe où sur la page (hors champ de saisie) : même effet que le bouton, sans la fenêtre « Coller » du navigateur
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      const c = e.clipboardData?.getData("text") ?? "";
      if (!c.trim()) return;
      e.preventDefault();
      takeClip(c);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  });

  const canRun = !busy && !keeping && (!!url || text.length >= 150);
  const canKeep = canRun;

  /** Garder sans analyser : aucun appel d'IA. Le formulaire se vide pour en ajouter une autre à la suite. */
  async function keep() {
    if (!url && !title.trim()) {
      setDetails(true);
      setErr("Sans lien, indique le poste (champ « Poste » ci-dessous) pour t'y retrouver dans ta liste.");
      setTimeout(() => titleRef.current?.focus(), 0);
      return;
    }
    setKeeping(true);
    setErr(null);
    const res = await fetch("/api/offers/keep", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: url || undefined, text: text || undefined, title: title || undefined, company: company || undefined }),
    }).catch(() => null);
    const j = res ? await res.json().catch(() => ({})) : {};
    setKeeping(false);
    if (!res?.ok) return setErr(j.error ?? "Je n'ai pas pu garder cette offre, réessaie.");
    toast(j.message ?? "Offre gardée.", { tone: "info" });
    if (j.outcome === "analyzed" && j.id) return router.push(`/offres/${j.id}`);
    if (j.outcome === "kept") setKept((n) => n + 1);
    setUrl(""); setText(""); setTitle(""); setCompany(""); setNeedText(false);
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); if (canRun) run(url, text); }} className="max-w-2xl space-y-5">
      <button type="button" onClick={paste} disabled={busy} className="btn btn-xl btn-primary w-full">
        <ClipboardPaste size={20} /> Coller ce que j'ai copié
      </button>
      <p className="-mt-2 text-center text-sm text-muted">Un lien, ou le texte de l'annonce : je m'occupe du reste. Ton navigateur te demande « Coller » ? Clique dessus, ou fais Ctrl+V (⌘V sur Mac) sur cette page.</p>

      <div className="flex items-center gap-3 text-xs text-muted"><span className="h-px flex-1 bg-line" /> ou à la main <span className="h-px flex-1 bg-line" /></div>

      <label className="block">
        <span className="label">Lien de l'offre</span>
        <span className="relative mt-1 block">
          <Link2 size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input className="field !pl-10" type="url" inputMode="url" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
        </span>
      </label>
      <label className="block">
        <span className="label">{needText ? "Colle le texte de l'annonce, la page n'a pas pu être lue" : "Texte de l'annonce (facultatif si tu as mis un lien)"}</span>
        <textarea rows={needText ? 12 : 6} className={`field mt-1 text-sm ${needText ? "!border-marigold ring-2 ring-marigold/30" : ""}`} value={text} onChange={(e) => setText(e.target.value)}
          placeholder="Intitulé, entreprise, missions, profil recherché…" autoFocus={needText} />
        {needText && <span className="mt-1 block text-xs text-muted">Sur la page de l'annonce : Ctrl+A, Ctrl+C, puis colle ici. {text.length > 0 && text.length < 150 ? `Encore ${150 - text.length} caractères.` : ""}</span>}
      </label>

      <details open={details} onToggle={(e) => setDetails(e.currentTarget.open)} className="rounded-xl border border-line p-3">
        <summary className="cursor-pointer text-sm font-semibold">Préciser le poste et l'entreprise <span className="font-normal text-muted">(facultatif avec un lien)</span></summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block"><span className="label">Poste</span><input ref={titleRef} className="field mt-1" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="Data analyst" autoComplete="off" /></label>
          <label className="block"><span className="label">Entreprise</span><input className="field mt-1" value={company} onChange={(e) => setCompany(e.target.value)} maxLength={120} placeholder="Nom de l'entreprise" autoComplete="off" /></label>
        </div>
        <p className="mt-2 text-xs text-muted">Sert seulement à retrouver la ligne dans ta liste. Pour « Analyser », l'IA lit l'annonce elle-même. Sans lien, le poste est nécessaire pour garder l'offre.</p>
      </details>

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn btn-primary btn-xl w-full sm:w-auto" disabled={!canRun}>
          {busy ? <><Loader2 size={18} className="animate-spin" /> {step}…</> : <><Sparkles size={18} /> Analyser et calculer mon score</>}
        </button>
        <button type="button" className="btn btn-xl w-full sm:w-auto" disabled={!canKeep} onClick={keep}>
          {keeping ? <><Loader2 size={18} className="animate-spin" /> Je garde…</> : <><Bookmark size={18} /> Garder pour plus tard</>}
        </button>
      </div>
      <p className="-mt-2 text-sm text-muted">« Garder » n'utilise aucune action IA : l'offre va dans <Link href="/offres" className="link">Offres & CV</Link> (à analyser), et tu l'analyseras quand tu veux, seule ou avec d'autres cochées.</p>
      {kept > 0 && <p className="rounded-xl bg-good/10 p-3 text-sm" role="status">{kept} offre{kept > 1 ? "s" : ""} gardée{kept > 1 ? "s" : ""} pendant cette visite. Tu peux en coller une autre, ou <Link href="/offres" className="link font-semibold">ouvrir Offres & CV</Link>.</p>}
      {busy && <p className="text-sm text-muted">Environ 20 secondes. Tu peux rester sur la page.</p>}
      {err && <p className="rounded-xl bg-bad/10 p-3 text-sm text-bad" role="alert">{err}</p>}
      <p className="text-sm text-muted">LinkedIn, Indeed et Glassdoor protègent souvent leurs pages. Dans ce cas, copie le texte de l'annonce : 5 secondes, ou utilise le favori ci-dessus qui le fait en un clic.</p>
    </form>
  );
}

export default function Nouvelle() {
  return (
    <>
      <PageTitle title="Analyser une offre" sub="Score de compatibilité, mots-clés manquants, modèle de CV conseillé." />
      <section className="card mb-6 max-w-2xl p-5" aria-labelledby="fav-title">
        <h2 id="fav-title" className="mb-2 text-lg font-semibold">Le plus simple : un clic depuis le site d'offres</h2>
        <Bookmarklet />
      </section>
      <Suspense><Form /></Suspense>
    </>
  );
}
