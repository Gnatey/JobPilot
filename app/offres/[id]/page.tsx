import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, Building2, Search, Mail, Check, AlertTriangle } from "lucide-react";
import { requireUser } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import { Gauge, Bar } from "@/components/ui/score";
import { Section } from "@/components/ui/page-title";
import { SkillSuggestions } from "@/components/skill-suggestions";
import { fresh } from "@/lib/skills";
import { OfferActions } from "@/components/offer-actions";
import { statusLabel, templateLabel, TEMPLATES, type OfferAnalysis, type OfferExtract } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Offre" };

const BLOCKS = [
  ["hard_skills", "Compétences techniques"],
  ["experience", "Niveau d'expérience"],
  ["domain", "Secteur et domaine"],
  ["education", "Formation"],
  ["soft_skills", "Savoir-être"],
  ["logistics", "Lieu, contrat, disponibilité"],
] as const;
const APPLY: Record<string, { text: string; tone: string }> = {
  oui: { text: "Conseil : postule", tone: "tag-good" },
  oui_avec_effort: { text: "Conseil : postule en traitant les écarts", tone: "tag-warn" },
  non: { text: "Conseil : probablement pas une bonne cible", tone: "tag-bad" },
};

// Les analyses viennent d'une IA : on ne fait confiance à aucun champ
const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()) : []);
const str = (v: unknown) => (typeof v === "string" ? v : "");

/** Adresses email trouvées dans le texte de l'annonce (hors adresses techniques). */
function findEmails(raw: string | null): string[] {
  const found = (raw ?? "").match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g) ?? [];
  const skip = /(no-?reply|ne-?pas-?repondre|donotreply|unsubscribe|\.(png|jpe?g|gif|svg|webp)$)/i;
  return [...new Set(found.map((e) => e.toLowerCase()))].filter((e) => !skip.test(e)).slice(0, 4);
}

export default async function OfferPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  const [{ data: offer }, { data: docs }, { data: app }, profile] = await Promise.all([
    supabase.from("offers").select("*").eq("id", id).maybeSingle(),
    supabase.from("documents").select("id, kind, variant, template, created_at, reused_from").eq("offer_id", id).order("created_at", { ascending: false }),
    supabase.from("applications").select("id, status").eq("offer_id", id).maybeSingle(),
    getProfile(supabase, user),
  ]);
  if (!offer) notFound();

  const a = (offer.analysis ?? {}) as Partial<OfferAnalysis>;
  const x = (offer.extracted ?? {}) as Partial<OfferExtract>;
  const analysed = !!offer.analysis;
  const tpl = TEMPLATES.find((t) => t.id === a.recommended_template);
  const apply = a.should_apply ? APPLY[a.should_apply] : null;
  const company: string = offer.company || x.company || "";
  const q = encodeURIComponent(company);
  const links = company
    ? [
        ["Avis des salariés", `https://www.google.com/search?q=${encodeURIComponent(`${company} avis salariés glassdoor`)}`],
        ["LinkedIn", `https://www.linkedin.com/search/results/companies/?keywords=${q}`],
        ["Santé financière (Pappers)", `https://www.pappers.fr/recherche?q=${q}`],
        ["Societe.com", `https://www.societe.com/cgi-bin/search?champs=${q}`],
        ["Actualités", `https://news.google.com/search?q=${q}&hl=fr&gl=FR`],
      ]
    : [];
  const emails = findEmails(offer.raw_text);
  const missions = arr(x.missions), must = arr(x.must_have), flags = arr(x.red_flags);
  const matched = arr(a.matched_keywords), missing = arr(a.missing_keywords);
  const strengths = arr(a.strengths);
  const gaps = (Array.isArray(a.gaps) ? a.gaps : []).filter((g) => g && str(g.gap));
  const questions = arr(a.questions_to_expect);

  return (
    <>
      <header className="mb-7 flex flex-col gap-5 sm:flex-row sm:items-center">
        {analysed && <Gauge value={Number(offer.score) || 0} size={136} />}
        <div className="min-w-0 flex-1">
          <h1 className="display text-[1.9rem] leading-[1.05] md:text-[2.5rem]">{offer.title}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-muted">
            {company && <span className="inline-flex items-center gap-1.5"><Building2 size={15} /> {company}</span>}
            {[offer.location, offer.contract, x.remote].filter(Boolean).length > 0 && <span>{[offer.location, offer.contract, x.remote].filter(Boolean).join(", ")}</span>}
          </p>
          {a.verdict && <p className="mt-3 max-w-[62ch]">{a.verdict}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {apply && <span className={`tag ${apply.tone}`}>{apply.text}</span>}
            {a.company_type && <span className="tag">{a.company_type}</span>}
            {app && <Link href={`/suivi?open=${app.id}`} className="tag hover:bg-line">Suivi : {statusLabel(app.status)}</Link>}
            {offer.url && <a href={offer.url} target="_blank" rel="noreferrer" className="tag hover:bg-line"><ExternalLink size={13} /> L'annonce</a>}
          </div>
        </div>
      </header>

      <OfferActions
        offerId={id}
        targets={profile.targets.map((t) => ({ id: t.id, title: t.title }))}
        recommendedVariant={a.recommended_variant ?? ""}
        recommendedTemplate={a.recommended_template ?? "compact"}
        application={app}
        decision={offer.decision}
        rejectReason={offer.reject_reason}
        docs={docs ?? []}
        analysed={analysed}
        reanalyseUrl={offer.url}
      />

      {!analysed ? null : (
        <>
          <div className="grid gap-x-12 md:grid-cols-2">
            <Section title="Détail du score">
              <ul className="space-y-3.5">
                {BLOCKS.map(([k, label]) => {
                  const b = a.breakdown?.[k];
                  const s = Math.max(0, Math.min(100, Number(b?.score) || 0));
                  return (
                    <li key={k}>
                      <div className="mb-1 flex justify-between text-sm"><span className="font-semibold">{label}</span><span className="tabular-nums">{s}</span></div>
                      <Bar value={s} />
                      {b?.comment && <p className="mt-1 text-sm text-muted">{b.comment}</p>}
                    </li>
                  );
                })}
              </ul>
            </Section>

            <div>
              {a.recommended_template && (
                <Section title="Modèle de CV conseillé">
                  <p className="font-semibold">{templateLabel(a.recommended_template)}</p>
                  {a.template_reason && <p className="mt-1 text-sm text-muted">{a.template_reason}</p>}
                  {tpl && <p className="mt-1 text-sm text-muted">Habituel pour : {tpl.for.toLowerCase()}.</p>}
                </Section>
              )}
              {(matched.length > 0 || missing.length > 0) && (
                <Section title="Mots-clés de l'offre">
                  <div className="flex flex-wrap gap-1.5">
                    {matched.map((k) => <span key={k} className="tag tag-good"><Check size={12} /> {k}</span>)}
                    {missing.map((k) => <span key={k} className="tag border border-dashed border-bad/50 bg-transparent text-bad">{k}</span>)}
                  </div>
                  <p className="mt-2 text-xs text-muted">Vert : déjà dans ton profil. Pointillés : absents, à ajouter seulement si tu les maîtrises vraiment.</p>
                </Section>
              )}
            </div>
          </div>

          <SkillSuggestions
            initial={fresh(profile, a.skill_suggestions)}
            title="Mots-clés absents que tu connais peut-être"
            intro="L'offre les demande et ton profil ne les cite pas, mais ce que tu as déjà fait les rend probables. Confirme : ils seront ajoutés à ton profil et utilisés dans le CV." />

          {(strengths.length > 0 || gaps.length > 0) && (
            <div className="grid gap-x-12 md:grid-cols-2">
              {strengths.length > 0 && (
                <Section title="Tes arguments">
                  <ul className="list-disc space-y-1.5 pl-5">{strengths.map((s) => <li key={s}>{s}</li>)}</ul>
                </Section>
              )}
              {gaps.length > 0 && (
                <Section title="Écarts et comment les traiter">
                  <ul className="space-y-3">
                    {gaps.map((g) => <li key={g.gap}><p className="font-semibold">{g.gap}</p>{g.how_to_address && <p className="text-sm text-muted">{g.how_to_address}</p>}</li>)}
                  </ul>
                </Section>
              )}
            </div>
          )}

          {(x.company_context || missions.length > 0 || must.length > 0) && (
            <Section title="L'entreprise et le poste">
              {x.company_context && <p className="max-w-[66ch]">{x.company_context}</p>}
              <div className="mt-4 grid gap-x-12 gap-y-4 md:grid-cols-2">
                {missions.length > 0 && <div><h3 className="heading">Missions</h3><ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm">{missions.map((m) => <li key={m}>{m}</li>)}</ul></div>}
                {must.length > 0 && <div><h3 className="heading">Indispensable</h3><ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm">{must.map((m) => <li key={m}>{m}</li>)}</ul></div>}
              </div>
              {flags.length > 0 && (
                <p className="mt-4 flex gap-2 rounded-xl bg-marigold/12 p-3 text-sm"><AlertTriangle size={16} className="mt-0.5 shrink-0 text-marigold-deep" /> <span><strong>À surveiller :</strong> {flags.join(" ; ")}</span></p>
              )}
            </Section>
          )}

          {questions.length > 0 && (
            <Section title="Questions probables en entretien" id="entretien">
              <ul className="list-disc space-y-1.5 pl-5">{questions.map((qq) => <li key={qq}>{qq}</li>)}</ul>
            </Section>
          )}
        </>
      )}

      {(links.length > 0 || emails.length > 0) && (
        <Section title="Se renseigner avant de postuler">
          {links.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {links.map(([label, href]) => <a key={label} href={href} target="_blank" rel="noreferrer" className="btn btn-sm"><Search size={14} /> {label}</a>)}
            </div>
          )}
          {emails.length > 0 && (
            <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
              <Mail size={15} /> Adresse trouvée dans l'annonce :
              {emails.map((e) => <a key={e} href={`mailto:${e}`} className="link font-semibold">{e}</a>)}
            </p>
          )}
        </Section>
      )}
    </>
  );
}
