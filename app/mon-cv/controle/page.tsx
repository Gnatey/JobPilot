import Link from "next/link";
import { CircleCheck, TriangleAlert } from "lucide-react";
import { requireUser } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import { fetchAll } from "@/lib/paged";
import { PageTitle, Section, Empty } from "@/components/ui/page-title";
import { checkCv, fixCount, isCv, type CvIssue } from "@/lib/cv-check";
import { isUnsentApp, pickApplication } from "@/lib/app-pick";
import { fmtDate } from "@/lib/format";
import { statusLabel } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Contrôle de mes CV" };

type Doc = { id: string; offer_id: string | null; application_id: string | null; created_at: string; content: unknown; offers: { company: string; title: string } | null };
type App = { id: string; offer_id: string | null; status: string; applied_at: string | null };

export default async function ControleCv() {
  const { supabase, user } = await requireUser();
  const [profile, docsRes, { data: apps }] = await Promise.all([
    getProfile(supabase, user),
    // Tous les CV, page après page (le contenu de chaque CV est lourd : pages plus petites)
    fetchAll((a, b) => supabase.from("documents").select("id, offer_id, application_id, created_at, content, offers(company, title)").eq("kind", "cv").order("id").range(a, b), { pageSize: 100 }),
    fetchAll<App>((a, b) => supabase.from("applications").select("id, offer_id, status, applied_at").order("id").range(a, b)),
  ]);

  const docs = docsRes.data as unknown as Doc[]; // « offers » est une seule offre (clé étrangère), pas une liste
  const byId = new Map(apps.map((a) => [a.id, a]));
  const byOffer = new Map<string, App[]>();
  for (const a of apps) if (a.offer_id) byOffer.set(a.offer_id, [...(byOffer.get(a.offer_id) ?? []), a]);

  // Un document qu'on ne sait pas lire n'est jamais déclaré « conforme » : il est compté à part
  const readable = docs.filter((d) => isCv(d.content));
  const unreadable = docs.length - readable.length;
  const rows = readable.map((d) => {
    const app = (d.application_id ? byId.get(d.application_id) : null) ?? pickApplication(d.offer_id ? byOffer.get(d.offer_id) : null);
    const issues = checkCv(d.content, profile);
    return { d, app, sent: !!app && !isUnsentApp(app), issues, fixes: fixCount(issues) };
  });
  // Les CV partis d'abord (ce sont eux qui comptent), puis ceux où il y a quelque chose à corriger, puis le plus récent
  rows.sort((a, b) => Number(b.sent) - Number(a.sent) || Number(b.fixes > 0) - Number(a.fixes > 0) || b.d.created_at.localeCompare(a.d.created_at));

  const withFix = rows.filter((r) => r.fixes > 0);
  const readOnly = rows.filter((r) => r.fixes === 0 && r.issues.length > 0);
  const clean = rows.filter((r) => !r.issues.length);
  const sentCount = rows.filter((r) => r.sent).length;
  const sentWithFix = withFix.filter((r) => r.sent).length;
  const empty = !profile.education.length && !profile.experiences.length;

  return (
    <>
      <PageTitle title="Contrôle de mes CV" sub="Compare chaque CV enregistré à ton profil maître : formations, postes, dates, langues, certifications, chiffres. Rien n'est modifié.">
        <Link href="/mon-cv" className="btn">Retour à Mon CV</Link>
      </PageTitle>

      {empty ? (
        <Empty action={<Link href="/profil" className="btn btn-primary">Ouvrir mon profil</Link>}>Ton profil ne contient encore ni formation ni expérience : il n'y a rien à comparer.</Empty>
      ) : !rows.length ? (
        <Empty>{unreadable ? `Tes ${unreadable} CV enregistrés sont d'un format qu'on ne sait pas contrôler.` : "Aucun CV enregistré pour l'instant. Ils apparaîtront ici dès que tu en génères un depuis une offre."}</Empty>
      ) : (
        <>
          <p className="mb-6 max-w-[62ch]" role="status">
            <strong>{rows.length} CV</strong> contrôlé{rows.length > 1 ? "s" : ""}, dont {sentCount} envoyé{sentCount > 1 ? "s" : ""}.{" "}
            {withFix.length > 0 && <>À corriger sur <strong>{withFix.length}</strong> CV{sentWithFix > 0 && <> (dont <strong>{sentWithFix}</strong> déjà envoyé{sentWithFix > 1 ? "s" : ""})</>}. </>}
            {readOnly.length > 0 && <>À relire sur <strong>{readOnly.length}</strong> CV. </>}
            {!withFix.length && !readOnly.length && "Aucun écart avec ton profil."}
          </p>

          {withFix.length > 0 && (
            <Section title="À corriger">
              <ul className="list">{withFix.map((r) => <Row key={r.d.id} r={r} />)}</ul>
            </Section>
          )}

          {readOnly.length > 0 && (
            <Section title="À relire">
              <ul className="list">{readOnly.map((r) => <Row key={r.d.id} r={r} />)}</ul>
            </Section>
          )}

          {!withFix.length && !readOnly.length && (
            <Section title="Tout est conforme">
              <Empty icon={<CircleCheck />}>Tous tes CV reprennent bien tes formations, tes postes, tes dates et tes langues.</Empty>
            </Section>
          )}

          {clean.length > 0 && (withFix.length > 0 || readOnly.length > 0) && (
            <details className="mb-10">
              <summary className="hit cursor-pointer text-sm text-muted">{clean.length} CV sans écart</summary>
              <ul className="list mt-3">{clean.map((r) => <Row key={r.d.id} r={r} />)}</ul>
            </details>
          )}

          <p className="max-w-[62ch] text-sm text-muted">
            {unreadable > 0 && <>{unreadable} document{unreadable > 1 ? "s" : ""} d'un ancien format n'{unreadable > 1 ? "ont" : "a"} pas pu être contrôlé{unreadable > 1 ? "s" : ""}. </>}
            Ce contrôle ne lit pas les fautes de frappe. Un chiffre que tu as ajouté à la main (« 98 % ») apparaît ici tant qu'il n'est pas dans ton profil : s'il est vrai, ajoute-le à ta réalisation dans{" "}
            <Link href="/profil" className="link">ton profil</Link> pour qu'il suive sur tes prochains CV.
          </p>
        </>
      )}
    </>
  );
}

function Row({ r }: { r: { d: Doc; app: App | null | undefined; sent: boolean; issues: CvIssue[]; fixes: number } }) {
  const { d, app, sent, issues } = r;
  const title = d.offers ? `${d.offers.title}, ${d.offers.company}` : "CV sans offre";
  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Link href={`/documents/${d.id}`} className="min-w-0 flex-1 font-semibold hover:underline">{title}</Link>
        {sent && app ? <span className="tag tag-good">{statusLabel(app.status)}</span> : <span className="tag">Pas envoyé</span>}
        <span className="text-sm text-muted">{fmtDate(d.created_at)}</span>
      </div>
      {issues.length ? (
        <ul className="mt-2 space-y-1 text-sm">
          {issues.map((i, k) => (
            <li key={k} className="flex items-start gap-2">
              {i.level === "fix"
                ? <TriangleAlert size={15} className="mt-0.5 shrink-0 text-bad" aria-hidden />
                : <span className="mt-0.5 w-[15px] shrink-0 text-center text-muted" aria-hidden>·</span>}
              <span className={i.level === "fix" ? "" : "text-muted"}><span className="sr-only">{i.level === "fix" ? "À corriger : " : "À relire : "}</span>{i.text}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {issues.length === 0 && <p className="mt-1 flex items-center gap-1.5 text-sm text-muted"><CircleCheck size={14} className="text-good" aria-hidden /> Rien à signaler</p>}
    </li>
  );
}
