import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarClock, Circle, CircleAlert, Mail, Send, FileText, ArrowRight, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import { getUser, requireUser } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/env";
import { Landing } from "@/components/landing";
import { getProfile } from "@/lib/profile";
import { loadApplications } from "@/lib/applications";
import { fetchAll } from "@/lib/paged";
import { archiveOld } from "@/lib/reco-age-db";
import { modelInfo } from "@/lib/llm";
import { isAdminEmail } from "@/lib/admin";
import { Section } from "@/components/ui/page-title";
import { Gauge } from "@/components/ui/score";
import { SyncButton } from "@/components/sync-button";
import { FollowupButton } from "@/components/followup-button";
import { QuickPaste } from "@/components/quick-paste";
import { TopRecos, SeeAll, type TopReco } from "@/components/top-recos";
import { MarkSentButton } from "@/components/app-actions";
import { today, fmtDate, fmtDateTime, daysAgo, ago, until, dateOf, greeting, weekday, weekStart, plural } from "@/lib/format";
import { statusLabel, STATUSES, isNeverSent, type Application } from "@/lib/types";
import { followupDue, followupOn, isUpcoming } from "@/lib/followup";
import { reconnectHref } from "@/lib/gmail-errors";

export const dynamic = "force-dynamic";

const signedIn = async () => (supabaseConfigured() ? await getUser() : null);

const HOME_TITLE = "JobPilot, ton copilote de recherche d'emploi";
const HOME_DESCRIPTION = "Colle une offre : JobPilot note ta compatibilité, écrit le CV et la lettre adaptés, range les réponses des recruteurs et suit tes candidatures.";

export async function generateMetadata(): Promise<Metadata> {
  if (await signedIn()) return { title: "Aujourd'hui" };
  return {
    title: { absolute: HOME_TITLE },
    description: HOME_DESCRIPTION,
    alternates: { canonical: "/" },
    openGraph: { type: "website", siteName: "JobPilot", locale: "fr_FR", url: "/", title: HOME_TITLE, description: HOME_DESCRIPTION },
    twitter: { card: "summary_large_image", title: HOME_TITLE, description: HOME_DESCRIPTION },
    // Seule page du site que Google a le droit d'afficher (le reste de l'appli est en « noindex », voir app/layout.tsx)
    robots: { index: true, follow: true },
  };
}

/** Visiteur : page d'accueil du site. Connecté : tableau de bord du jour. */
export default async function Home() {
  if (!(await signedIn())) return <Landing />;
  return <Today />;
}

const CATEGORY: Record<string, string> = {
  accuse_reception: "accusé de réception", refus: "refus", entretien: "entretien", test: "test",
  offre: "offre d'embauche", relance_recruteur: "contact recruteur", autre: "autre",
};

/** Lien pour préparer le CV d'une candidature : analyse automatique si l'offre n'a pas encore été lue. */
function cvLink(a: Application, hasCv: boolean) {
  if (a.offer_id) return hasCv ? `/offres/${a.offer_id}` : `/offres/${a.offer_id}?go=cv`;
  const p = new URLSearchParams({ app: a.id, auto: "1", then: "cv" });
  if (a.url) p.set("url", a.url);
  else p.set("needtext", "1");
  return `/offres/nouvelle?${p}`;
}

async function Today() {
  const { supabase, user } = await requireUser();
  const t = today();
  await archiveOld(supabase, user.id); // offres non décidées depuis plus de 3 semaines : rangées dans Masquées, pour que l'accueil ne les propose plus
  const [profile, appsRes, recosRes, cvRes, gmailRes, emailsRes, searchesRes] = await Promise.all([
    getProfile(supabase, user),
    loadApplications(supabase), // toutes : une relance due sur une vieille candidature doit apparaître
    supabase.from("recommendations").select("id, title, company, location, source, url, quick_score, matched, offers(score)", { count: "exact" })
      .in("status", ["new", "analyzed"]).eq("senior", false).order("quick_score", { ascending: false }).limit(40),
    fetchAll<{ application_id: string | null; offer_id: string | null }>((a, b) => supabase.from("documents").select("application_id, offer_id").eq("kind", "cv").order("id").range(a, b)),
    supabase.from("gmail_accounts").select("email, last_sync_at").maybeSingle(),
    supabase.from("emails").select("id, subject, from_addr, category, received_at").neq("category", "alerte_offres").neq("category", "autre").order("received_at", { ascending: false }).limit(4),
    supabase.from("searches").select("id", { count: "exact", head: true }),
  ]);
  // Première visite : questionnaire d'accueil (une fois terminé ou passé, on n'y revient plus)
  if (!profile.experiences.length && !profile.preferences.onboarded) {
    const { count } = await supabase.from("diagnostics").select("id", { count: "exact", head: true });
    if (!count) redirect("/bienvenue");
  }

  const apps = appsRes.data;
  const cvApps = new Set(cvRes.data.flatMap((d) => [d.application_id, d.offer_id]).filter(Boolean));
  const hasCv = (a: Application) => cvApps.has(a.id) || (a.offer_id ? cvApps.has(a.offer_id) : false);

  const interviews = apps.filter((a) => ["entretien", "test"].includes(a.status))
    .sort((a, b) => (a.interview_at ?? "9").localeCompare(b.interview_at ?? "9"));
  // Entretien ou épreuve à venir (ou sans date) : à préparer. Passé : la réponse de l'entreprise est attendue, puis vient la relance.
  const upcoming = interviews.filter((a) => isUpcoming(a, t));
  // Relances : seulement après un entretien, jamais pour une candidature sans entretien (lib/followup.ts)
  const due = apps.filter((a) => followupDue(a, t)).sort((a, b) => (followupOn(a) ?? "").localeCompare(followupOn(b) ?? ""));
  const toSend = apps.filter((a) => a.status === "a_postuler");
  const recos: TopReco[] = (recosRes.data ?? [])
    .map((r) => ({
      id: r.id, title: r.title, company: r.company, location: r.location, source: r.source, url: r.url,
      score: (r.offers as unknown as { score: number | null } | null)?.score ?? r.quick_score ?? 0, matched: (r.matched ?? []) as string[],
      ai: (r.offers as unknown as { score: number | null } | null)?.score != null,
    }))
    .sort((a, b) => b.score - a.score);
  const toSort = recosRes.count ?? recos.length;

  const sent = apps.filter((a) => a.status !== "a_postuler" && !isNeverSent(a));
  const monday = weekStart();
  const sentThisWeek = sent.filter((a) => a.applied_at && a.applied_at >= monday).length;
  const goal = profile.preferences.weekly_goal ?? 5;
  const answered = sent.filter((a) => ["entretien", "test", "offre", "refuse"].includes(a.status)).length;
  const firstName = profile.identity.name.split(" ")[0] || "";

  // Le « cap » : la seule chose à faire en premier
  const iv = upcoming[0];
  type Cap = { headline: string; cta: string; href: string };
  const cap: Cap = iv
    ? {
        headline: iv.interview_at ? `${iv.status === "test" ? "Test" : "Entretien"} chez ${iv.company} ${until(dateOf(iv.interview_at))}.` : `Prépare ton entretien chez ${iv.company}.`,
        cta: "Préparer l'entretien", href: iv.offer_id ? `/offres/${iv.offer_id}#prep` : `/suivi?open=${iv.id}`,
      }
    : due.length
      ? { headline: `${plural(due.length, "entretien sans nouvelles", "entretiens sans nouvelles")} : ${due.length > 1 ? "des relances sont prêtes à partir" : "une relance est prête à partir"}.`, cta: "Rédiger les relances", href: "#relances" }
      : toSend.length
        ? hasCv(toSend[0])
          ? { headline: `Ta candidature chez ${toSend[0].company} n'attend que son envoi.`, cta: "Ouvrir le CV", href: cvLink(toSend[0], true) }
          : { headline: `Prépare le CV pour ${toSend[0].company}.`, cta: "Faire le CV", href: cvLink(toSend[0], false) }
        : toSort
          ? { headline: `${plural(toSort, "nouvelle offre attend", "nouvelles offres attendent")} ton avis.`, cta: "Trier en 2 minutes", href: "/recommandees/tri" }
          : { headline: "Rien d'urgent. Colle une offre ou lance une recherche.", cta: "Lancer une recherche", href: "/recherche" };
  const rest = [
    iv && due.length ? plural(due.length, "relance", "relances") : null,
    (iv || due.length) && toSend.length ? `${plural(toSend.length, "candidature", "candidatures")} à envoyer` : null,
    (iv || due.length || toSend.length) && toSort ? `${plural(toSort, "offre", "offres")} à trier` : null,
  ].filter(Boolean);

  // Ce qui reste à brancher pour que l'app travaille à ta place
  const ai = modelInfo();
  const setup = [
    !profile.experiences.length && { href: "/mon-cv", text: "Dépose ton CV : sans lui, pas de diagnostic ni de CV sur mesure pour les offres." },
    !ai.configured && isAdminEmail(user.email) && { href: "/admin#installation", text: "Ajoute la clé IA gratuite : sans elle, aucune analyse ni aucun CV." },
    !gmailRes.data && { href: "/parametres#gmail", text: "Connecte Gmail : alertes emploi et réponses se rangent toutes seules." },
    !searchesRes.count && { href: "/recherche", text: "Sauvegarde une recherche : les nouvelles offres arrivent chaque matin." },
    profile.todo.length > 0 && { href: "/profil", text: `Complète ton profil (${plural(profile.todo.length, "point", "points")}) pour des CV plus solides.` },
  ].filter(Boolean) as { href: string; text: string }[];

  const pipeline = [
    { label: "À postuler", n: toSend.length, ids: ["a_postuler"] },
    { label: "Postulées", n: apps.filter((a) => a.status === "postule").length },
    { label: "Entretiens", n: interviews.length },
    { label: "Relancées", n: apps.filter((a) => a.status === "relance").length },
    { label: "Offres", n: apps.filter((a) => a.status === "offre").length },
    { label: "Refus", n: apps.filter((a) => a.status === "refuse").length },
  ];
  const maxPipe = Math.max(...pipeline.map((p) => p.n), 1);

  return (
    <>
      <header className="mb-8">
        <p className="text-muted first-letter:uppercase">{weekday()}</p>
        <h1 className="display mt-1 text-[2.7rem] md:text-[3.7rem]">{greeting()}{firstName ? ` ${firstName}` : ""}.</h1>
        <p className="heading mt-3 max-w-[30ch] text-[1.4rem] leading-snug md:text-[1.8rem]">{cap.headline}</p>
        {rest.length > 0 && <p className="mt-2 text-muted">Ensuite : {rest.join(", ")}.</p>}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Link href={cap.href} className="btn btn-primary btn-xl">{cap.cta} <ArrowRight size={18} /></Link>
          <SyncButton />
        </div>
      </header>

      {gmailRes.data && profile.preferences.gmail_issue && (
        <div role="alert" className="mb-8 flex flex-wrap items-center gap-3 rounded-2xl border border-bad/40 bg-bad/10 px-4 py-3 text-sm">
          <CircleAlert size={18} className="shrink-0 text-bad" aria-hidden />
          <p className="min-w-0 flex-1">Google a coupé l'accès à ta boîte mail : la lecture de tes emails est à l'arrêt tant que tu ne reconnectes pas Gmail.</p>
          <a href={reconnectHref(Boolean(profile.preferences.daily_recap && profile.preferences.recap_send_ok))} className="btn btn-primary btn-sm shrink-0">Reconnecter Gmail</a>
        </div>
      )}

      <div className="mb-10"><QuickPaste /></div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-x-14 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div>
          {upcoming.length > 0 && (
            <Section title="Entretiens à préparer">
              <ul className="list">
                {upcoming.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 px-4 py-3.5">
                    <CalendarClock size={20} className="shrink-0 text-marigold-deep" />
                    <div className="min-w-0 flex-1 basis-44">
                      <p className="truncate font-semibold">{a.title}</p>
                      <p className="truncate text-sm text-muted">{a.company}, {a.interview_at ? fmtDateTime(a.interview_at) : statusLabel(a.status).toLowerCase()}</p>
                    </div>
                    <Link href={a.offer_id ? `/offres/${a.offer_id}#prep` : `/suivi?open=${a.id}`} className="btn btn-sm shrink-0">Préparer</Link>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {due.length > 0 && (
            <Section title="Relances après entretien" id="relances" aside={<span className="text-sm text-muted">sans nouvelles depuis l'entretien</span>}>
              <ul className="list">
                {due.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5">
                    <Mail size={20} className="shrink-0 text-muted" />
                    <div className="min-w-0 flex-1 basis-44">
                      <p className="truncate font-semibold">{a.title}</p>
                      <p className="truncate text-sm text-muted">{a.company}, {a.status === "test" ? "épreuve" : "entretien"} {ago(dateOf(a.interview_at!))}</p>
                    </div>
                    <FollowupButton id={a.id} contact={a.contact} compact />
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {toSend.length > 0 && (
            <Section title="À envoyer" aside={<Link href="/suivi" className="link text-sm font-semibold">Suivi</Link>}>
              <ul className="list">
                {toSend.slice(0, 6).map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5">
                    <FileText size={20} className="shrink-0 text-muted" />
                    <div className="min-w-0 flex-1 basis-44">
                      <p className="truncate font-semibold">{a.title}</p>
                      <p className="truncate text-sm text-muted">{a.company}{hasCv(a) ? ", CV prêt" : ", pas encore de CV"}</p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Link href={cvLink(a, hasCv(a))} className={`btn btn-sm ${hasCv(a) ? "" : "btn-primary"}`}>{hasCv(a) ? "Ouvrir le CV" : "Faire le CV"}</Link>
                      <MarkSentButton id={a.id} />
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {recos.length > 0 && (
            <Section title="Offres pour toi" aside={<span className="text-sm text-muted">{toSort > 40 ? "40+" : toSort} à trier</span>}>
              <TopRecos recos={recos.slice(0, 5)} />
              <SeeAll n={toSort} />
            </Section>
          )}

          {(emailsRes.data?.length ?? 0) > 0 && (
            <Section title="Derniers emails de recruteurs">
              <ul className="list">
                {emailsRes.data!.map((e) => (
                  <li key={e.id} className="px-4 py-3">
                    <p className="truncate font-semibold">{e.subject}</p>
                    <p className="truncate text-sm text-muted">{e.from_addr?.replace(/<.*>/, "").replace(/"/g, "").trim()}, {fmtDate(e.received_at)}, {CATEGORY[e.category ?? ""] ?? e.category}</p>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {!upcoming.length && !due.length && !toSend.length && !recos.length && (
            <div className="rounded-2xl border border-dashed border-line px-5 py-8 text-center text-muted">
              <Sparkles className="mx-auto mb-2" />
              Rien à faire pour l'instant. Colle une offre ci-dessus, ou <Link className="link font-semibold text-ink" href="/recherche">lance une recherche</Link>.
            </div>
          )}
        </div>

        <aside aria-label="Résumé de ta semaine" className="mt-2 space-y-9 lg:mt-0">
          <section aria-label="Ta semaine">
            <h2 className="heading mb-3 text-xl">Ta semaine</h2>
            <div className="flex items-center gap-4">
              <Gauge value={Math.min(sentThisWeek, goal)} max={goal} unit={`/${goal}`} size={116} label="candidatures" tone="progress" />
              <p className="text-sm text-muted">
                {sentThisWeek >= goal ? "Objectif atteint. Le reste est du bonus." : `Encore ${goal - sentThisWeek} pour tenir ton objectif de la semaine.`}
              </p>
            </div>
            <p className="mt-3 text-sm text-muted">{plural(sent.length, "candidature envoyée", "candidatures envoyées")} au total, {plural(answered, "réponse", "réponses")}.</p>
          </section>

          <section aria-label="Pipeline">
            <h2 className="heading mb-3 text-xl">Où tu en es</h2>
            <ul className="space-y-0.5">
              {pipeline.map((p) => (
                <li key={p.label}>
                  <Link href="/suivi" className="group block py-1.5">
                    <div className="flex justify-between text-sm"><span>{p.label}</span><span className="font-semibold tabular-nums">{p.n}</span></div>
                    <div className="mt-1 h-1.5 rounded-full bg-line"><div className="h-1.5 rounded-full bg-chart-1 transition-[width]" style={{ width: `${p.n ? Math.max(6, (p.n / maxPipe) * 100) : 0}%` }} /></div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          {setup.length > 0 && (
            <section aria-label="Pour que l'app travaille à ta place">
              <h2 className="heading mb-3 text-xl">À brancher</h2>
              <ul className="space-y-3">
                {setup.slice(0, 3).map((s) => (
                  <li key={s.href + s.text}>
                    <Link href={s.href} className="flex gap-2.5 text-sm hover:text-ink">
                      <Circle size={17} className="mt-0.5 shrink-0 text-muted" /> <span className="link">{s.text}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
