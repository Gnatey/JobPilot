"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Printer, Copy, Check, TriangleAlert, Loader2, CircleCheck, Target } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { CV_TEMPLATES } from "./cv-templates";
import { FitPage, MIN_ZOOM, type Fit } from "./fit-page";
import { TemplatePicker } from "./template-picker";
import { LetterPicker } from "./letter-picker";
import { LetterSheet } from "./letter-templates";
import { MarkSentButton } from "@/components/app-actions";
import { useFeedback } from "@/components/ui/feedback";
import { TEMPLATES, type CvDoc, type LetterDoc, type PrepDoc, type Profile } from "@/lib/types";
import { docFileName } from "@/lib/cv-format";
import { LETTER_TEMPLATES, isLetterTemplate, letterDoc, letterParts, letterTemplateFor, type LetterParts } from "@/lib/letter";
import { pickApplication } from "@/lib/app-pick";

type Doc = {
  id: string;
  kind: string;
  created_at?: string;
  template: string | null;
  variant: string | null;
  content: unknown;
  offers: { id: string; title: string; company: string; extracted?: { keywords?: unknown } | null } | null;
};

const TEMPLATE_HINT: Record<string, string> = Object.fromEntries(TEMPLATES.map((t) => [t.id, `Habituel pour : ${t.for.toLowerCase()}.`]));
const LETTER_HINT: Record<string, string> = Object.fromEntries(LETTER_TEMPLATES.map((t) => [t.id, `${t.for}.`]));
const KIND_TITLE: Record<string, string> = { cv: "CV", lettre: "LM", prep: "Préparation d'entretien", relance: "Relance" };
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/** Le CV de la même offre (s'il existe) : la lettre en reprend le modèle et le titre pour que les deux documents forment un ensemble. */
export type Sibling = { template: string | null; headline: string | null } | null;

export function DocumentView({ doc, identity, reusedFrom, recommended, sibling = null }: { doc: Doc; identity: Profile["identity"]; reusedFrom: string | null; recommended?: string | null; sibling?: Sibling }) {
  const sb = useMemo(() => supabaseBrowser(), []);
  const { toast } = useFeedback();
  const letterCtx = { company: doc.offers?.company, date: doc.created_at, name: identity.name, headline: sibling?.headline };
  // Une lettre ancienne (texte libre) est découpée en parties pour être mise en page ; une lettre récente l'est déjà
  const [content, setContent] = useState(() => doc.kind === "lettre" ? letterDoc(letterParts(doc.content as LetterDoc, letterCtx), doc.content as LetterDoc) : doc.content);
  const [template, setTemplate] = useState(doc.kind === "lettre"
    ? (isLetterTemplate(doc.template) ? doc.template : letterTemplateFor(sibling?.template ?? recommended))
    : (doc.template ?? "compact"));
  const [dirty, setDirty] = useState(false);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [copied, setCopied] = useState(false);
  const [fit, setFit] = useState<Fit>({ zoom: 1, over: false });
  const [app, setApp] = useState<{ id: string; status: string } | null>(null);
  const latest = useRef({ content, template, dirty });
  latest.current = { content, template, dirty };

  const editable = doc.kind === "cv" || doc.kind === "lettre";

  const save = useCallback(async () => {
    const { content, template } = latest.current;
    setState("saving");
    const { error } = await sb.from("documents").update({ content, template: doc.kind === "cv" || doc.kind === "lettre" ? template : null }).eq("id", doc.id);
    if (error) { setState("error"); return toast("Les modifications n'ont pas pu être enregistrées.", { tone: "err" }); }
    setDirty(false);
    setState("saved");
  }, [sb, doc.id, doc.kind, toast]);

  // Enregistrement automatique : plus de bouton à retrouver, plus de CV perdu
  useEffect(() => {
    if (!dirty || !editable) return;
    const t = setTimeout(save, 1200);
    return () => clearTimeout(t);
  }, [dirty, content, template, editable, save]);
  useEffect(() => {
    const flush = () => { if (document.visibilityState === "hidden" && latest.current.dirty && editable) save(); };
    document.addEventListener("visibilitychange", flush);
    return () => document.removeEventListener("visibilitychange", flush);
  }, [save, editable]);

  // Candidature liée à l'offre : permet le bouton « J'ai envoyé »
  useEffect(() => {
    if (!doc.offers) return;
    sb.from("applications").select("id, status").eq("offer_id", doc.offers.id).limit(20).then(({ data }) => setApp(pickApplication(data)));
  }, [sb, doc.offers]);

  function updCv(fn: (cv: CvDoc) => void) {
    setContent((c: unknown) => {
      const next = structuredClone(c) as CvDoc;
      fn(next);
      return next;
    });
    setDirty(true);
  }

  const lp: LetterParts | null = doc.kind === "lettre" ? letterParts(content as LetterDoc, letterCtx) : null;
  function updLetter(patch: Partial<LetterParts>) {
    setContent((c: unknown) => letterDoc({ ...letterParts(c as LetterDoc, letterCtx), ...patch }, c as LetterDoc));
    setDirty(true);
  }

  const title = KIND_TITLE[doc.kind] ?? doc.kind;
  const notes = (content as { notes_for_candidate?: string[] }).notes_for_candidate ?? [];
  const Tpl = CV_TEMPLATES[template as keyof typeof CV_TEMPLATES] ?? CV_TEMPLATES.compact;

  // Couverture des mots-clés de l'offre, recalculée à chaque modification
  const coverage = useMemo(() => {
    if (doc.kind !== "cv") return null;
    const kws = Array.isArray(doc.offers?.extracted?.keywords) ? (doc.offers!.extracted!.keywords as unknown[]).filter((k): k is string => typeof k === "string" && !!k.trim()) : [];
    if (!kws.length) return null;
    const text = norm(JSON.stringify(content));
    const missing = kws.filter((k) => !text.includes(norm(k)));
    return { total: kws.length, found: kws.length - missing.length, missing };
  }, [content, doc.kind, doc.offers]);

  function copyText() {
    const el = document.getElementById("sheet");
    if (el) navigator.clipboard.writeText(el.innerText).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  /** Nom du fichier : « CV_NOM_Prénom_Titre_du_poste » : lisible par n'importe qui, différent pour chaque offre. */
  const fileName = docFileName(doc.kind, identity, doc.offers?.title, doc.kind === "cv" ? (content as CvDoc).headline : null);

  /**
   * Le nom du fichier PDF proposé par le navigateur vient du titre de la page. Sur iPhone, l'impression est asynchrone : « afterprint »
   * part tout de suite et un titre remis en place trop tôt donnait « Document ». Le titre reste donc réglé tant que le document est affiché.
   */
  useEffect(() => {
    const before = document.title;
    document.title = fileName;
    return () => { if (document.title === fileName) document.title = before; };
  }, [fileName]);

  function print() {
    document.title = fileName;
    window.print();
  }

  const pct = coverage ? Math.round((coverage.found / coverage.total) * 100) : 0;

  return (
    <>
      <div className="no-print mb-5">
        {doc.offers && (
          <Link href={`/offres/${doc.offers.id}`} className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
            <ArrowLeft size={16} /> {doc.offers.title}, {doc.offers.company}
          </Link>
        )}
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="display text-[2rem] md:text-[2.4rem]">{title}</h1>
            {editable && (
              <p className="mt-1 flex items-center gap-1.5 text-sm text-muted" role="status">
                {state === "saving" ? <><Loader2 size={14} className="animate-spin" /> Enregistrement…</>
                  : state === "error" ? <span className="text-bad">Non enregistré</span>
                  : dirty ? "Modifications en cours…"
                  : <><CircleCheck size={14} className="text-good" /> Enregistré automatiquement</>}
              </p>
            )}
            {(doc.kind === "cv" || doc.kind === "lettre") && <p className="mt-0.5 break-all text-xs text-muted">Nom du fichier PDF proposé : {fileName}.pdf</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn" onClick={copyText}>{copied ? <Check size={16} /> : <Copy size={16} />} {copied ? "Copié" : "Copier"}</button>
            <button className="btn btn-primary" onClick={print}><Printer size={16} /> Télécharger en PDF</button>
          </div>
        </div>

        {reusedFrom && (
          <p className="mt-3 flex items-start gap-2 rounded-xl border border-marigold/60 bg-marigold/10 p-3 text-sm">
            <TriangleAlert size={18} className="mt-0.5 shrink-0" />
            CV réutilisé depuis « {reusedFrom} ». Relis le titre et le profil : rien ne doit renvoyer à l'ancienne entreprise.
          </p>
        )}

        {coverage && (
          <div className="mt-4 rounded-2xl border border-line bg-surface p-4">
            <p className="flex flex-wrap items-center gap-2 font-semibold">
              <Target size={17} /> {coverage.found} mots-clés sur {coverage.total} de l'offre sont dans ce CV
              <span className={`tag ${pct >= 70 ? "tag-good" : pct >= 50 ? "tag-warn" : "tag-bad"}`}>{pct} %</span>
            </p>
            {coverage.missing.length > 0 && (
              <p className="mt-2 text-sm text-muted">
                Absents : {coverage.missing.join(", ")}. Ajoute-les en cliquant sur le texte, seulement si c'est vrai pour toi.
              </p>
            )}
          </div>
        )}

        {doc.kind === "cv" && (
          <section className="mt-4" aria-labelledby="tpl-title">
            <h2 id="tpl-title" className="heading text-base">Modèle du CV</h2>
            <TemplatePicker value={template} onChange={(id) => { setTemplate(id); setDirty(true); }} cv={content as CvDoc} identity={identity} recommended={recommended} />
            <p className="mt-1 text-sm text-muted">{TEMPLATE_HINT[template] ?? ""}</p>
          </section>
        )}
        {doc.kind === "lettre" && lp && (
          <section className="mt-4" aria-labelledby="ltpl-title">
            <h2 id="ltpl-title" className="heading text-base">Modèle de la LM</h2>
            <LetterPicker value={template} onChange={(id) => { setTemplate(id); setDirty(true); }} parts={lp} identity={identity} matching={sibling ? letterTemplateFor(sibling.template) : null} />
            <p className="mt-1 text-sm text-muted">{LETTER_HINT[template] ?? ""}</p>
          </section>
        )}
        {doc.kind === "lettre" && (
          fit.over
            ? <p className="mt-3 flex items-start gap-2 rounded-xl border border-marigold/60 bg-marigold/10 p-3 text-sm" role="status"><TriangleAlert size={18} className="mt-0.5 shrink-0" /> Cette lettre est trop longue pour une page, même avec le texte réduit à {Math.round(MIN_ZOOM * 100)} %. Raccourcis un paragraphe : une lettre se lit en une minute.</p>
            : <p className="mt-3 text-sm text-muted" role="status"><CircleCheck size={14} className="mr-1.5 inline align-[-2px] text-good" />Tient sur 1 page{fit.zoom < 1 ? ` (texte ajusté à ${Math.round(fit.zoom * 100)} %)` : ""}. Clique sur un texte de la lettre pour le modifier : « Entrée » ouvre un nouveau paragraphe, un paragraphe vidé disparaît.</p>
        )}
        {doc.kind === "cv" && (
          fit.over
            ? <p className="mt-3 flex items-start gap-2 rounded-xl border border-marigold/60 bg-marigold/10 p-3 text-sm" role="status"><TriangleAlert size={18} className="mt-0.5 shrink-0" /> Ce CV est trop long pour une page, même avec le texte réduit à {Math.round(MIN_ZOOM * 100)} %. Raccourcis une expérience ou un projet, ou choisis le modèle Compact ATS.</p>
            : <p className="mt-3 text-sm text-muted" role="status"><CircleCheck size={14} className="mr-1.5 inline align-[-2px] text-good" />Tient sur 1 page{fit.zoom < 1 ? ` (texte ajusté à ${Math.round(fit.zoom * 100)} %)` : ""}. Clique sur un texte du CV pour le modifier ; « Télécharger en PDF » ouvre l'impression, choisis « Enregistrer au format PDF ».</p>
        )}
        {notes.length > 0 && (
          <div className="mt-3 rounded-xl bg-surface p-3 text-sm">
            <p className="font-semibold">À vérifier avant d'envoyer</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted">{notes.map((n) => <li key={n}>{n}</li>)}</ul>
          </div>
        )}
        {app?.status === "a_postuler" && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl bg-chrome px-4 py-3 text-white">
            <p className="min-w-0 flex-1 text-sm">Une fois ta candidature envoyée, clique ici : je la passe à « Postulé » dans le suivi.</p>
            <MarkSentButton id={app.id} label="J'ai envoyé ma candidature" primary />
          </div>
        )}
      </div>

      <div id="sheet" className="print-sheet mx-auto max-w-[210mm] rounded-sm bg-white p-[10mm] text-black shadow-[0_2px_24px_-8px_rgba(27,35,64,.35)] md:p-[13mm]">
        {doc.kind === "cv" && (
          <FitPage watch={`${template}|${JSON.stringify(content)}|${JSON.stringify(identity)}`} onFit={setFit}>
            <Tpl cv={content as CvDoc} id={identity} upd={updCv} />
          </FitPage>
        )}
        {doc.kind === "lettre" && lp && (
          <FitPage watch={`${template}|${JSON.stringify(content)}|${JSON.stringify(identity)}`} onFit={setFit} grow={false}>
            <LetterSheet template={template} p={lp} id={identity} upd={updLetter} />
          </FitPage>
        )}
        {doc.kind === "prep" && <Prep p={content as PrepDoc} />}
        {doc.kind === "relance" && (
          <div className="font-sans text-[10.5pt]">
            <p className="font-bold">{(content as { subject: string }).subject}</p>
            <p className="mt-3 whitespace-pre-wrap">{(content as { body: string }).body}</p>
          </div>
        )}
      </div>
    </>
  );
}

function Prep({ p }: { p: PrepDoc }) {
  return (
    <div className="font-sans text-[10pt] leading-relaxed">
      <h2 className="text-[13pt] font-bold">Pitch de 60 secondes</h2>
      <p className="mt-1 whitespace-pre-wrap">{p.pitch_60s}</p>
      <h2 className="mt-5 text-[13pt] font-bold">Questions probables</h2>
      <ul className="mt-1 space-y-2">
        {(p.likely_questions ?? []).map((q) => (
          <li key={q.question} className="break-inside-avoid"><p className="font-semibold">{q.question}</p><p className="text-gray-700">{q.angle}</p></li>
        ))}
      </ul>
      <h2 className="mt-5 text-[13pt] font-bold">Questions à poser</h2>
      <ul className="mt-1 list-disc pl-5">{(p.questions_to_ask ?? []).map((q) => <li key={q}>{q}</li>)}</ul>
      <h2 className="mt-5 text-[13pt] font-bold">À vérifier sur l'entreprise</h2>
      <ul className="mt-1 list-disc pl-5">{(p.company_research_todo ?? []).map((q) => <li key={q}>{q}</li>)}</ul>
    </div>
  );
}
