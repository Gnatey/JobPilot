"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Loader2, ListChecks, FileText } from "lucide-react";
import { PageTitle } from "@/components/ui/page-title";
import { Bookmarklet } from "@/components/settings-controls";
import { analyzeOffer, captureList, useSteps, type CaptureItem, type CaptureResult } from "@/lib/client/analyze";
import { usableJobText } from "@/lib/reco-text";

type Payload = { jp: 1; url: string; title: string; one: string; page: string; links: { t: string; h: string }[] };

/** Adresses qui montrent une liste de résultats plutôt qu'une seule annonce. */
const LIST_URL = /linkedin\.com\/jobs\/(search|collections)|indeed\.[a-z.]+\/(jobs|emplois)(\?|\/?$)|welcometothejungle\.com\/[^/]+\/jobs(\?|$)|hellowork\.com\/[^?]*recherche|apec\.fr\/[^?]*recherche|francetravail\.fr\/[^?]*recherche|[?&](q|query|keywords|motsCles)=/i;

/** Au plus 12 annonces lues par import, une à une et sans se presser : on reste un lecteur humain, pas un robot. */
const MAX_READ = 12;
const DIAG_TOP = 3;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sameSite = (a: string, b: string) => { try { return new URL(a).origin === new URL(b).origin; } catch { return false; } };

type Scored = { id: string; score: number; senior: boolean; analyzed: boolean };
type Enriched = { read: number; tried: number; diag: number; diagError?: string; skipped?: string };

const valid = (d: unknown): d is Payload =>
  !!d && typeof d === "object" && (d as Payload).jp === 1 && typeof (d as Payload).url === "string" && typeof (d as Payload).page === "string" && Array.isArray((d as Payload).links);

export default function Importer() {
  const router = useRouter();
  const [msg, setMsg] = useState<Payload | null>(null);
  const [phase, setPhase] = useState<"wait" | "ask" | "one" | "list" | "enrich" | "diag" | "done" | "error">("wait");
  const [prog, setProg] = useState({ done: 0, total: 0 });
  const [enriched, setEnriched] = useState<Enriched | null>(null);
  const srcWin = useRef<Window | null>(null);
  const srcOrigin = useRef("");
  const waiting = useRef(new Map<number, (t: string | null) => void>());
  const seq = useRef(0);
  const [list, setList] = useState<CaptureResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const got = useRef(false);
  const step = useSteps(phase === "one" || phase === "list", phase === "list" ? ["Lecture de la page", "Repérage des offres", "Calcul des scores"] : undefined);

  const runOne = useCallback(async (m: Payload) => {
    setPhase("one"); setErr(null);
    const r = await analyzeOffer({ url: m.url, text: (m.one.length >= 150 ? m.one : m.page).slice(0, 30000) });
    if (r.error || !r.id) { setErr(r.error ?? "L'analyse a échoué."); setPhase("error"); return; }
    router.replace(`/offres/${r.id}`);
  }, [router]);

  /** Demande au favori (donc à la page d'origine, avec la session de la personne) de lire une annonce. */
  const ask = useCallback((url: string) => new Promise<string | null>((resolve) => {
    const w = srcWin.current;
    if (!w || w.closed) return resolve(null);
    const i = ++seq.current;
    const timer = setTimeout(() => { waiting.current.delete(i); resolve(null); }, 12000);
    waiting.current.set(i, (t) => { clearTimeout(timer); resolve(t); });
    try { w.postMessage({ jp: "get", i, u: url }, srcOrigin.current === "null" ? "*" : srcOrigin.current); }
    catch { clearTimeout(timer); waiting.current.delete(i); resolve(null); }
  }), []);

  const post = useCallback(async (path: string, body?: unknown) => {
    try {
      const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const j = await res.json().catch(() => ({}));
      return { ok: res.ok && !j.error, status: res.status, ...j } as { ok: boolean; status: number; error?: string; updated?: Scored[]; offer_id?: string };
    } catch { return { ok: false, status: 0, error: "Connexion interrompue." }; }
  }, []);

  /** Lit les annonces de la liste avec la session de la personne, recalcule les scores, puis fait le diagnostic des meilleures. */
  const enrich = useCallback(async (m: Payload, items: CaptureItem[]): Promise<Enriched> => {
    const todo = items.filter((i) => sameSite(i.url, m.url) && !/(^|\.)linkedin\.com$/.test(new URL(i.url).hostname)).slice(0, MAX_READ);
    const out: Enriched = { read: 0, tried: 0, diag: 0 };
    if (!items.length) return out;
    if (!todo.length) return { ...out, skipped: /linkedin\.com/.test(m.url) ? "linkedin" : "site" };

    setPhase("enrich"); setProg({ done: 0, total: todo.length });
    const scored: Scored[] = [];
    let batch: { id: string; text: string }[] = [];
    const flush = async () => {
      if (!batch.length) return;
      const r = await post("/api/recommendations/enrich", { items: batch });
      batch = [];
      scored.push(...(r.updated ?? []));
    };
    let fails = 0;
    for (const it of todo) {
      out.tried++;
      const text = await ask(it.url);
      if (text && usableJobText(text)) { batch.push({ id: it.id, text }); out.read++; fails = 0; }
      else if (++fails >= 3) break; // page d'origine fermée, ou site qui refuse : inutile d'insister
      setProg({ done: out.tried, total: todo.length });
      if (batch.length >= 4) await flush();
      await sleep(1200 + Math.random() * 1400);
    }
    await flush();

    const top = scored.filter((x) => !x.analyzed && !x.senior).sort((a, b) => b.score - a.score).slice(0, DIAG_TOP);
    if (top.length) {
      setPhase("diag"); setProg({ done: 0, total: top.length });
      for (const t of top) {
        const r = await post(`/api/recommendations/${t.id}/diagnostic`);
        if (!r.ok) { out.diagError = r.error; if (r.status === 429) break; } else out.diag++;
        setProg((p) => ({ ...p, done: p.done + 1 }));
      }
    }
    return out;
  }, [ask, post]);

  const runList = useCallback(async (m: Payload) => {
    setPhase("list"); setErr(null);
    const r = await captureList({ url: m.url, title: m.title, page: m.page, links: m.links });
    if (r.error) { setErr(r.error); setPhase("error"); return; }
    setList(r);
    const e = await enrich(m, r.items ?? []);
    setEnriched(e); setPhase("done");
    if ((r.added ?? 0) > 0) setTimeout(() => router.replace("/recommandees"), 4000);
  }, [router, enrich]);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const d = e.data as { jp?: unknown; i?: number; ok?: unknown; t?: unknown } | null;
      // Réponse du favori à une demande de lecture d'annonce
      if (d && typeof d === "object" && d.jp === "got") {
        if (e.source !== srcWin.current || typeof d.i !== "number") return;
        const f = waiting.current.get(d.i);
        if (f) { waiting.current.delete(d.i); f(d.ok && typeof d.t === "string" ? d.t : null); }
        return;
      }
      if (got.current || !valid(e.data)) return;
      got.current = true;
      srcWin.current = e.source as Window | null;
      srcOrigin.current = e.origin;
      const m = e.data;
      (e.source as Window | null)?.postMessage("jp-ok", { targetOrigin: e.origin === "null" ? "*" : e.origin });
      setMsg(m);
      // Une annonce précise (texte sélectionné ou bloc « description » reconnu) ou une adresse de recherche : le cas est clair.
      // Sinon on compte les liens qui ressemblent à des intitulés d'offres : très peu = une annonce, beaucoup = une liste.
      const titles = new Set(m.links.filter((l) => l.t.length >= 25).map((l) => l.h)).size;
      if (m.one.length >= 150 || (!LIST_URL.test(m.url) && titles <= 4)) runOne(m);
      else if (LIST_URL.test(m.url) || titles >= 8) runList(m);
      else setPhase("ask");
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [runOne, runList]);

  return (
    <>
      <PageTitle title="Réception d'une page" sub="Le favori t'envoie ici ce que tu regardes sur un autre site." />
      <div className="max-w-2xl space-y-5">
        {phase === "wait" && (
          <div className="card space-y-4 p-5">
            <p className="flex items-center gap-2 text-muted" role="status"><Loader2 size={17} className="animate-spin" /> J'attends la page envoyée par ton favori…</p>
            <p className="text-sm text-muted">Cette fenêtre s'ouvre toute seule quand tu cliques sur le favori depuis une annonce ou une page de résultats. Si tu es arrivée ici autrement, installe-le d'abord :</p>
            <Bookmarklet />
          </div>
        )}

        {phase === "ask" && msg && (
          <div className="card space-y-3 p-5">
            <p className="font-medium">Qu'est-ce que tu m'as envoyé ?</p>
            <p className="text-sm text-muted">Je ne suis pas sûr si c'est une seule annonce ou une liste de résultats.</p>
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-primary" onClick={() => runOne(msg)}><FileText size={16} /> Une seule annonce</button>
              <button className="btn btn-primary" onClick={() => runList(msg)}><ListChecks size={16} /> Une liste de résultats</button>
            </div>
          </div>
        )}

        {(phase === "enrich" || phase === "diag") && (
          <div className="card space-y-3 p-5" role="status">
            <div className="flex items-center gap-3">
              <Loader2 className="animate-spin text-brand" size={22} />
              <div>
                <p className="font-medium">
                  {phase === "enrich" ? `Je lis les annonces avec ta session (${Math.min(prog.done + 1, prog.total)}/${prog.total})…` : `Je fais le diagnostic des meilleures (${Math.min(prog.done + 1, prog.total)}/${prog.total})…`}
                </p>
                <p className="text-sm text-muted">
                  {phase === "enrich" ? "Une annonce toutes les 2 à 3 secondes, comme toi. Laisse l'autre onglet ouvert." : "Environ 20 secondes chacun. Ce qui est déjà lu est déjà enregistré."}
                </p>
              </div>
            </div>
            <progress className="h-1.5 w-full accent-[var(--color-marigold)]" value={prog.done} max={Math.max(1, prog.total)} aria-label="Avancement" />
            <Link href="/recommandees" className="link text-sm">Voir les recommandées sans attendre</Link>
          </div>
        )}

        {(phase === "one" || phase === "list") && (
          <div className="card flex items-center gap-3 p-5" role="status">
            <Loader2 className="animate-spin text-brand" size={22} />
            <div>
              <p className="font-medium">{phase === "one" ? "J'analyse l'annonce" : "Je trie les offres de la page"}…</p>
              <p className="text-sm text-muted">{step}. Environ 20 secondes, tu peux rester ici.</p>
            </div>
          </div>
        )}

        {phase === "done" && list && (
          <div className="card space-y-3 p-5" role="status">
            <p className="flex items-center gap-2 font-medium"><CheckCircle2 className="text-good" size={22} />
              {list.found === 0 ? "Je n'ai trouvé aucune offre précise sur cette page." : `${list.added} nouvelle${(list.added ?? 0) > 1 ? "s" : ""} offre${(list.added ?? 0) > 1 ? "s" : ""} ajoutée${(list.added ?? 0) > 1 ? "s" : ""}`}
            </p>
            {!!list.found && <p className="text-sm text-muted">{list.found} repérée{list.found > 1 ? "s" : ""} sur la page{(list.already ?? 0) > 0 ? `, ${list.already} déjà connue${(list.already ?? 0) > 1 ? "s" : ""}` : ""}.</p>}
            {enriched && enriched.read > 0 && (
              <p className="text-sm">
                {enriched.read} annonce{enriched.read > 1 ? "s" : ""} lue{enriched.read > 1 ? "s" : ""} en entier : leur score est calculé sur le texte complet, plus seulement sur le titre.
                {enriched.diag > 0 && <> Diagnostic complet fait pour les {enriched.diag} meilleure{enriched.diag > 1 ? "s" : ""}.</>}
              </p>
            )}
            {enriched && enriched.read === 0 && !!list.found && (
              <p className="rounded-xl bg-marigold/12 p-3 text-sm">
                {enriched.skipped === "linkedin"
                  ? "Je n'ai pas lu les annonces une par une : sur LinkedIn je m'en abstiens exprès, pour ne pas mettre ton compte en danger."
                  : "Je n'ai pas pu lire les annonces en entier : le site a refusé, la page d'origine a été fermée, ou ton favori est ancien (supprime-le et glisse-le à nouveau depuis « Analyser une offre »)."}{" "}
                Ces offres n'ont donc qu'un pré-tri d'après le titre (« Bonne piste », « À regarder », « Peu probable »), sans pourcentage. Pour une offre qui t'intéresse, ouvre-la et reclique sur le favori, ou utilise « Voir le diagnostic » dans Recommandées.
              </p>
            )}
            {enriched?.diagError && enriched.diag === 0 && <p className="text-sm text-bad" role="alert">{enriched.diagError}</p>}
            {list.found === 0 && <p className="text-sm text-muted">Si c'était une seule annonce, utilise le bouton ci-dessous.</p>}
            <div className="flex flex-wrap gap-2">
              <Link href="/recommandees" className="btn btn-primary"><ListChecks size={16} /> Voir les recommandées</Link>
              {msg && <button className="btn btn-ghost" onClick={() => runOne(msg)}><FileText size={16} /> C'était une seule annonce : l'analyser</button>}
            </div>
          </div>
        )}

        {phase === "error" && (
          <div className="card space-y-3 p-5">
            <p className="rounded-xl bg-bad/10 p-3 text-sm text-bad" role="alert">{err}</p>
            <div className="flex flex-wrap gap-2">
              {msg && <button className="btn btn-primary" onClick={() => runOne(msg)}><FileText size={16} /> Réessayer comme une seule annonce</button>}
              {msg && <button className="btn btn-ghost" onClick={() => runList(msg)}><ListChecks size={16} /> Réessayer comme une liste</button>}
              <Link href="/offres/nouvelle" className="btn btn-ghost">Coller le texte à la main</Link>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
