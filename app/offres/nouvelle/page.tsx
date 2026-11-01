"use client";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ClipboardPaste, Sparkles, Link2, Loader2 } from "lucide-react";
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
  const [needText, setNeedText] = useState(params.get("needtext") === "1");
  const [busy, setBusy] = useState(false);
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

  const canRun = !busy && (!!url || text.length >= 150);

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

      <button className="btn btn-primary btn-xl w-full sm:w-auto" disabled={!canRun}>
        {busy ? <><Loader2 size={18} className="animate-spin" /> {step}…</> : <><Sparkles size={18} /> Analyser et calculer mon score</>}
      </button>
      {busy && <p className="text-sm text-muted">Environ 20 secondes. Tu peux rester sur la page.</p>}
      {err && <p className="rounded-xl bg-bad/10 p-3 text-sm text-bad" role="alert">{err}</p>}
      <p className="text-sm text-muted">LinkedIn et Indeed protègent souvent leurs pages. Dans ce cas, copie le texte de l'annonce : 5 secondes, ou utilise le favori ci-dessus qui le fait en un clic.</p>
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
