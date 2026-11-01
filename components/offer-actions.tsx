"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FileText, Mail, MessagesSquare, Check, Send, Recycle, X, Undo2, Loader2, RefreshCw, SlidersHorizontal, Trash2, ScanSearch } from "lucide-react";
import { TEMPLATES, REJECT_REASONS, templateLabel, rejectLabel } from "@/lib/types";
import { fmtDate } from "@/lib/format";
import { useFeedback } from "@/components/ui/feedback";
import { refreshBadges } from "@/components/nav";

type Doc = { id: string; kind: string; variant: string | null; template: string | null; created_at: string; reused_from: string | null };
type Reuse = { id: string; coverage: number; template: string | null; made_for: string };

const KIND: Record<string, string> = { cv: "CV", lettre: "LM", prep: "Préparation d'entretien", relance: "Relance" };
const BUSY_TEXT: Record<string, string> = { cv: "Rédaction du CV… (20 s environ)", lettre: "Rédaction de la LM…", prep: "Préparation de l'entretien…", reanalyse: "Nouvelle analyse de l'offre… (20 s environ)" };

export function OfferActions(props: {
  offerId: string;
  targets: { id: string; title: string }[];
  recommendedVariant: string;
  recommendedTemplate: string;
  application: { id: string; status: string } | null;
  decision: string | null;
  rejectReason: string | null;
  docs: Doc[];
  analysed: boolean;
  reanalyseUrl?: string | null;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const { toast, confirm } = useFeedback();
  const [variant, setVariant] = useState(props.recommendedVariant || props.targets[0]?.id || "");
  const [template, setTemplate] = useState(props.recommendedTemplate || "compact");
  const [busy, setBusy] = useState<string | null>(null);
  const [reuse, setReuse] = useState<Reuse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const auto = useRef(false);

  const generate = useCallback(async (kind: "cv" | "lettre" | "prep", extra: Record<string, unknown> = {}) => {
    setBusy(kind);
    setErr(null);
    let r: { error?: string; reuse_candidate?: Reuse; id?: string } = {};
    try {
      const res = await fetch(`/api/offers/${props.offerId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, variant, template, ...extra }),
      });
      r = await res.json().catch(() => ({ error: "Réponse illisible, réessaie." }));
    } catch {
      r = { error: "Connexion interrompue, réessaie." };
    }
    if (r.error) { setBusy(null); return setErr(r.error); }
    if (r.reuse_candidate) { setBusy(null); return setReuse(r.reuse_candidate); }
    setReuse(null);
    router.push(`/documents/${r.id}`);
  }, [props.offerId, variant, template, router]);

  // « Je candidate » depuis la liste ou le suivi : le CV démarre tout seul, une seule fois
  useEffect(() => {
    if (auto.current || params.get("go") !== "cv" || !props.analysed) return;
    auto.current = true;
    history.replaceState(null, "", location.pathname);
    if (!props.docs.some((d) => d.kind === "cv")) generate("cv");
  }, [params, props.analysed, props.docs, generate]);

  async function decide(decision: "accept" | "reject" | "restore" | "undo" | "unsend", extra: Record<string, string> = {}) {
    const wasToSend = props.application?.status === "a_postuler"; // pour annuler : l'offre retrouve sa place « À postuler »
    setBusy(decision);
    const res = await fetch(`/api/offers/${props.offerId}/decide`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision, ...extra }) }).catch(() => null);
    setBusy(null);
    setRejecting(false);
    if (!res?.ok) {
      const msg = res ? ((await res.json().catch(() => ({}))) as { error?: string }).error : null;
      return toast(msg ?? "Action impossible pour le moment, réessaie.", { tone: "err" });
    }
    refreshBadges();
    router.refresh();
    if (decision === "accept") toast(extra.status === "postule" ? "Candidature marquée comme envoyée." : "Ajoutée à ton suivi.", { action: { label: "Voir", run: () => router.push("/suivi") } });
    if (decision === "reject") toast("Rangée dans Suivi, en Abandonné.", { action: { label: "Annuler", run: () => decide("restore", wasToSend ? { status: "a_postuler" } : {}) } });
    if (decision === "undo") toast("Retirée de ton suivi.", { tone: "info" });
    if (decision === "unsend") toast("Envoi annulé : la candidature est de nouveau à postuler.", { tone: "info" });
  }

  /** Nouvelle analyse sur le texte gardé de l'offre (un seul pourcentage par offre : le nouveau remplace l'ancien). */
  async function reanalyse() {
    setBusy("reanalyse");
    setErr(null);
    let r: { score?: number; before?: number | null; error?: string } = {};
    try {
      const res = await fetch(`/api/offers/${props.offerId}/reanalyze`, { method: "POST" });
      r = await res.json().catch(() => ({ error: "Réponse illisible, réessaie." }));
    } catch {
      r = { error: "Connexion interrompue, réessaie." };
    }
    setBusy(null);
    if (r.error) return setErr(r.error);
    toast(r.before != null && r.before !== r.score ? `Analyse refaite : ${r.before} % → ${r.score} %` : `Analyse refaite : ${r.score} %`, { tone: "info" });
    router.refresh();
  }

  async function remove() {
    const sent = props.application && !["a_postuler", "abandonne", "expiree"].includes(props.application.status);
    const ok = await confirm({
      title: "Supprimer cette offre ?",
      body: sent
        ? "L'analyse et les documents (CV, LM…) seront supprimés. Ta candidature reste dans Suivi, sans lien avec l'offre."
        : "L'analyse et les documents (CV, LM…) seront supprimés, ainsi que la ligne correspondante dans Suivi. Cette action est définitive.",
      confirmLabel: "Supprimer", danger: true,
    });
    if (!ok) return;
    setBusy("delete");
    const res = await fetch(`/api/offers/${props.offerId}`, { method: "DELETE" }).catch(() => null);
    setBusy(null);
    if (!res?.ok) {
      const msg = res ? ((await res.json().catch(() => ({}))) as { error?: string }).error : null;
      return toast(msg ?? "Suppression impossible pour le moment, réessaie.", { tone: "err" });
    }
    refreshBadges();
    toast("Offre supprimée.", { tone: "info" });
    router.push("/offres");
    router.refresh();
  }

  const deleteBtn = (
    <button className="btn btn-sm btn-ghost text-muted hover:text-bad" onClick={remove} disabled={!!busy} title="Supprimer cette offre"><Trash2 size={15} /> Supprimer</button>
  );

  if (!props.analysed) {
    return (
      <div className="mb-8 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface p-4">
        <p className="min-w-0 flex-1 text-sm">Cette offre n'a pas encore été analysée.</p>
        <Link className="btn btn-primary" href={`/offres/nouvelle?auto=1${props.reanalyseUrl ? `&url=${encodeURIComponent(props.reanalyseUrl)}` : "&needtext=1"}`}><RefreshCw size={16} /> Lancer l'analyse</Link>
        {deleteBtn}
      </div>
    );
  }

  const hasCv = props.docs.some((d) => d.kind === "cv");
  const cvDoc = props.docs.find((d) => d.kind === "cv");

  return (
    <div className="mb-10 rounded-2xl border border-line bg-surface p-4 shadow-sm md:p-5">
      {busy && ["cv", "lettre", "prep", "reanalyse"].includes(busy) && (
        <div className="mb-4 flex items-center gap-3 rounded-xl bg-marigold/14 px-4 py-3 text-sm font-semibold" role="status">
          <Loader2 size={18} className="animate-spin" /> {BUSY_TEXT[busy]}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {hasCv && cvDoc ? (
          <>
            <Link href={`/documents/${cvDoc.id}`} className="btn btn-primary btn-xl"><FileText size={18} /> Ouvrir mon CV</Link>
            <button className="btn btn-xl" onClick={() => generate("cv", { force_new: true })} disabled={!!busy} title="Générer une nouvelle version"><RefreshCw size={16} /> Autre version</button>
          </>
        ) : (
          <button className="btn btn-primary btn-xl" onClick={() => generate("cv")} disabled={!!busy}><FileText size={18} /> Générer mon CV</button>
        )}
        <button className="btn btn-xl" onClick={() => generate("lettre")} disabled={!!busy}><Mail size={18} /> LM</button>
        <button id="prep" className="btn btn-xl" onClick={() => generate("prep")} disabled={!!busy}><MessagesSquare size={18} /> Préparer l'entretien</button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
        {!props.application && props.decision !== "rejected" && (
          <>
            <button className="btn btn-sm" onClick={() => decide("accept")} disabled={!!busy}><Check size={15} /> Je candidate</button>
            <button className="btn btn-sm" onClick={() => setRejecting((r) => !r)} disabled={!!busy}><X size={15} /> Je ne postule pas</button>
          </>
        )}
        {props.application?.status === "a_postuler" && (
          <>
            <button className="btn btn-sm btn-primary" onClick={() => decide("accept", { status: "postule" })} disabled={!!busy}><Send size={15} /> J'ai envoyé ma candidature</button>
            <button className="btn btn-sm" onClick={() => setRejecting((r) => !r)} disabled={!!busy}><X size={15} /> Je ne postule pas</button>
            <button className="btn btn-sm" onClick={() => decide("undo")} disabled={!!busy} title="Retirer cette offre de ton suivi"><Undo2 size={15} /> Retirer du suivi</button>
          </>
        )}
        {props.application?.status === "postule" && (
          <>
            <span className="text-sm text-muted">Candidature envoyée.</span>
            <button className="btn btn-sm" onClick={() => decide("unsend")} disabled={!!busy}><Undo2 size={15} /> Annuler l'envoi</button>
          </>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-1">
        <button className="btn btn-sm btn-ghost text-muted hover:text-ink" onClick={reanalyse} disabled={!!busy} title="Refaire l'analyse de l'offre avec ton profil actuel (une analyse du quota du jour)"><ScanSearch size={15} /> Refaire l'analyse</button>
        <details className="relative text-sm">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-full px-3 py-1.5 text-muted hover:bg-paper"><SlidersHorizontal size={14} /> Réglages du CV</summary>
          <div className="absolute right-0 z-10 mt-1 grid w-[min(92vw,26rem)] gap-3 rounded-2xl border border-line bg-surface p-4 shadow-lift sm:grid-cols-2">
            <label>
              <span className="label">Métier ciblé</span>
              <select className="field mt-1" value={variant} onChange={(e) => setVariant(e.target.value)}>
                {props.targets.map((t) => <option key={t.id} value={t.id}>{t.title}{t.id === props.recommendedVariant ? " (conseillé)" : ""}</option>)}
              </select>
            </label>
            <label>
              <span className="label">Modèle</span>
              <select className="field mt-1" value={template} onChange={(e) => setTemplate(e.target.value)}>
                {TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.label}{t.id === props.recommendedTemplate ? " (conseillé)" : ""}</option>)}
              </select>
            </label>
          </div>
        </details>
        {deleteBtn}
        </div>
      </div>

      {rejecting && (
        <div className="mt-4">
          <p className="text-sm font-semibold">Pourquoi ? L'app s'en sert pour mieux trier les prochaines offres.</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {REJECT_REASONS.map((r) => <button key={r.id} className="chip" onClick={() => decide("reject", { reason: r.id })}>{r.label}</button>)}
          </div>
        </div>
      )}

      {props.decision === "rejected" && (
        <p className="mt-4 flex flex-wrap items-center gap-2 text-sm text-muted">
          Abandonnée : {rejectLabel(props.rejectReason).toLowerCase()}.
          <button className="inline-flex items-center gap-1 font-semibold text-ink underline" onClick={() => decide("restore")} disabled={!!busy}><Undo2 size={14} /> Remettre à trier</button>
        </p>
      )}

      {reuse && (
        <div className="mt-4 rounded-xl border border-marigold/60 bg-marigold/10 p-4" role="alert">
          <p className="flex items-center gap-2 font-semibold"><Recycle size={18} /> Un CV existant couvre déjà {reuse.coverage} % des mots-clés de cette offre</p>
          <p className="mt-1 text-sm">
            Il a été fait pour <strong>{reuse.made_for}</strong> (modèle {templateLabel(reuse.template)}). Si tu le réutilises, vérifie qu'il ne mentionne pas
            l'ancienne entreprise et que le titre correspond bien à cette offre.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn btn-primary" onClick={() => generate("cv", { reuse_id: reuse.id })} disabled={!!busy}>Réutiliser ce CV</button>
            <button className="btn" onClick={() => generate("cv", { force_new: true })} disabled={!!busy}>{busy === "cv" ? "Rédaction…" : "En créer un nouveau"}</button>
          </div>
        </div>
      )}

      {err && <p className="mt-3 rounded-xl bg-bad/10 p-3 text-sm text-bad" role="alert">{err}</p>}

      {props.docs.length > 0 && (
        <ul className="mt-4 divide-y divide-line border-t border-line">
          {props.docs.map((d) => (
            <li key={d.id}>
              <Link href={`/documents/${d.id}`} className="flex items-center gap-2 py-2.5 text-sm hover:underline">
                <FileText size={16} /> {KIND[d.kind] ?? d.kind}
                {d.template ? `, modèle ${templateLabel(d.template)}` : ""}
                {d.reused_from ? ", réutilisé" : ""}
                <span className="ml-auto text-muted">{fmtDate(d.created_at)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
