import { CircleCheck, CircleAlert, Circle } from "lucide-react";
import { requireUser } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import { modelInfo } from "@/lib/llm";
import { MIGRATION_SQL } from "@/lib/migration-sql";
import { PageTitle, Section } from "@/components/ui/page-title";
import { SyncButton } from "@/components/sync-button";
import { ThemePicker } from "@/components/theme";
import { AccountCard, AiTest, Bookmarklet, CopySql, DataControls, GmailControls, Prefs, RecapControls } from "@/components/settings-controls";
import { fmtDate } from "@/lib/format";
import { isAdmin, isOwner, usedToday, dailyBudget } from "@/lib/quota";
import { activeSources } from "@/lib/sources";

export const dynamic = "force-dynamic";
export const metadata = { title: "Réglages" };

const MSG: Record<string, string> = {
  ok: "Gmail est connecté.",
  recap_ok: "C'est activé : tu recevras ton récap chaque matin vers 7 h. Clique « M'envoyer un test maintenant » pour le voir tout de suite.",
  erreur: "La connexion Gmail a échoué. Réessaie.",
  pas_de_refresh: "Google n'a pas renvoyé d'accès durable. Retire JobPilot dans ton compte Google (Sécurité > Applications tierces) puis reconnecte-le.",
};

type Check = { id: string; label: string; state: "ok" | "todo" | "optional"; hint?: string };

export default async function Parametres({ searchParams }: { searchParams: Promise<{ gmail?: string }> }) {
  const { gmail: flash } = await searchParams;
  const { supabase, user } = await requireUser();
  const admin = isAdmin(user.email);
  const [{ data: gmail }, { count }, profile, interviewCol, diagTable, usageTable, cronCol, used] = await Promise.all([
    supabase.from("gmail_accounts").select("email, last_sync_at").maybeSingle(),
    supabase.from("emails").select("id", { count: "exact", head: true }),
    getProfile(supabase, user),
    supabase.from("applications").select("interview_at").limit(1),
    supabase.from("diagnostics").select("id").limit(1),
    supabase.from("ai_usage").select("n").limit(1),
    supabase.from("profiles").select("cron_at").limit(1),
    usedToday(supabase, user.id),
  ]);

  const has = (...n: string[]) => n.every((k) => Boolean(process.env[k]));
  const ai = modelInfo();
  const dbOk = !interviewCol.error && !diagTable.error && !usageTable.error && !cronCol.error;
  const sources = activeSources();
  const checks: Check[] = [
    { id: "ai", label: `IA (${ai.provider === "gemini" ? "Gemini" : "Claude"})`, state: ai.configured ? "ok" : "todo", hint: "Ajoute GEMINI_API_KEY dans Vercel (clé gratuite sur aistudio.google.com), puis redéploie." },
    { id: "db", label: "Base de données à jour", state: dbOk ? "ok" : "todo", hint: "Une mise à jour de la base est disponible (agenda, pages plus rapides, quota IA par personne). Détails juste en dessous." },
    { id: "cron", label: "Tâche automatique du matin", state: has("SUPABASE_SERVICE_ROLE_KEY", "CRON_SECRET") ? "ok" : "todo", hint: "Ajoute SUPABASE_SERVICE_ROLE_KEY et CRON_SECRET dans Vercel, puis redéploie." },
    { id: "gmail", label: "Connexion Gmail", state: has("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET") ? "ok" : "todo", hint: "Ajoute GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET dans Vercel, puis redéploie." },
    { id: "sources", label: "Sources d'offres automatiques", state: sources.length ? "ok" : "optional", hint: "Facultatif : Adzuna ou Jooble apportent des offres chaque matin (clé gratuite). Voir « Sources d'offres » plus bas. Sans elles, les alertes Gmail et le copier-coller suffisent." },
    { id: "legal", label: "Pages légales (éditeur et contact)", state: has("PUBLISHER_NAME", "PUBLISHER_EMAIL") ? "ok" : "optional", hint: "À faire avant d'inviter d'autres personnes : ajoute PUBLISHER_NAME et PUBLISHER_EMAIL dans Vercel. Ils s'affichent dans les mentions légales et la politique de confidentialité." },
  ];
  const todo = checks.filter((c) => c.state === "todo").length;

  return (
    <>
      <PageTitle title="Réglages" />
      {flash && MSG[flash] && <p className="mb-6 rounded-xl bg-surface p-3 text-sm" role="status">{MSG[flash]}</p>}

      {admin && <Section title="Installation" id="installation" aside={<span className={`tag ${todo ? "tag-warn" : "tag-good"}`}>{todo ? `${todo} à faire` : "Tout est en place"}</span>}>
        <ul className="list">
          {checks.map((c) => (
            <li key={c.id} className="flex items-start gap-3 px-4 py-3">
              {c.state === "ok" ? <CircleCheck size={20} className="mt-0.5 shrink-0 text-good" /> : c.state === "todo" ? <CircleAlert size={20} className="mt-0.5 shrink-0 text-bad" /> : <Circle size={20} className="mt-0.5 shrink-0 text-muted" />}
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{c.label}</p>
                {c.state !== "ok" && c.hint && <p className="text-sm text-muted">{c.hint}</p>}
                {c.id === "ai" && ai.configured && <div className="mt-2"><AiTest /></div>}
              </div>
            </li>
          ))}
        </ul>
        {!dbOk && (
          <div className="mt-4 rounded-2xl border border-marigold/60 bg-marigold/10 p-4">
            <p className="font-semibold">Mettre la base à jour (une fois, 1 minute)</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
              <li>Clique sur « Copier le script ».</li>
              <li>Ouvre Supabase, puis <strong>SQL Editor</strong> et <strong>New query</strong>. Désactive la traduction automatique de Chrome sur cette page.</li>
              <li>Colle, puis clique sur <strong>Run</strong>. Le résultat attendu est « Success ».</li>
            </ol>
            <div className="mt-3"><CopySql sql={MIGRATION_SQL} /></div>
          </div>
        )}
      </Section>}

      {admin && (
        <Section title="Sources d'offres" id="sources" aside={<span className={`tag ${sources.length ? "tag-good" : ""}`}>{sources.length ? `${sources.length} branchée${sources.length > 1 ? "s" : ""}` : "Aucune"}</span>}>
          <p className="max-w-[65ch]">
            JobPilot marche sans source automatique : les alertes emploi lues dans Gmail arrivent notées dans Recommandées, et tu peux envoyer n'importe quelle annonce ou page de résultats en un clic avec le favori (France Travail, Indeed, LinkedIn…), ou coller son lien ou son texte.
            Si tu veux en plus des offres chaque matin pour tous les comptes, branche une source gratuite :
          </p>
          <ul className="list mt-4">
            <li className="px-4 py-3">
              <p className="font-semibold">Adzuna {sources.some((s) => s.id === "adzuna") ? <span className="tag tag-good ml-2">Branché</span> : <span className="tag ml-2">Non branché</span>}</p>
              <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-muted">
                <li>Crée un compte gratuit sur <a className="link" href="https://developer.adzuna.com" target="_blank" rel="noreferrer">developer.adzuna.com</a>.</li>
                <li>Copie l'« Application ID » et l'« Application Key ».</li>
                <li>Dans Vercel (Settings, Environment Variables), ajoute <code>ADZUNA_APP_ID</code> et <code>ADZUNA_APP_KEY</code>, puis fais Redeploy. Ne colle jamais ces clés dans un chat.</li>
              </ol>
              <p className="mt-1 text-sm text-muted">Le quota gratuit est partagé par tous les comptes : vérifie-le sur le site d'Adzuna.</p>
            </li>
            <li className="px-4 py-3">
              <p className="font-semibold">Jooble {sources.some((s) => s.id === "jooble") ? <span className="tag tag-good ml-2">Branché</span> : <span className="tag ml-2">Non branché</span>}</p>
              <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-muted">
                <li>Demande une clé gratuite sur <a className="link" href="https://jooble.org/api/about" target="_blank" rel="noreferrer">jooble.org/api/about</a> (elle arrive par email).</li>
                <li>Dans Vercel, ajoute <code>JOOBLE_API_KEY</code>, puis fais Redeploy.</li>
              </ol>
            </li>
          </ul>
        </Section>
      )}

      <Section title="Gmail" id="gmail">
        {gmail ? (
          <>
            <p>Connecté : <strong>{gmail.email}</strong></p>
            <p className="mt-1 text-sm text-muted">
              Dernière lecture : {gmail.last_sync_at ? fmtDate(gmail.last_sync_at) : "jamais"}, {count ?? 0} emails de recrutement rangés.
            </p>
            <div className="mt-4 flex flex-wrap items-start gap-2">
              <SyncButton label="Lire mes emails maintenant" />
              <GmailControls connected />
            </div>
            <RecapControls email={gmail.email} enabled={!!profile.preferences.daily_recap} sendOk={!!profile.preferences.recap_send_ok} last={profile.preferences.recap_last} />
          </>
        ) : (
          <>
            <p className="max-w-[62ch]">
              L'app lit (sans en écrire ni en envoyer à d'autres) les emails liés à ta recherche : alertes LinkedIn, Indeed, APEC, WTTJ, accusés de réception,
              refus, invitations à des entretiens. Elle met ton suivi à jour et range les offres des alertes dans Recommandées.
            </p>
            <div className="mt-4"><GmailControls connected={false} /></div>
          </>
        )}
        <p className="mt-4 max-w-[62ch] text-sm text-muted">
          Chaque matin vers 7 h, l'app lit Gmail, relance tes recherches sauvegardées (si une source d'offres est branchée), calcule le score des meilleures offres et les range dans Recommandées.
          Elle n'envoie aucune candidature sans toi.
        </p>
      </Section>

      {used !== null && !isOwner(user.email) && (
        <p className="mb-6 text-sm text-muted" role="note">
          Actions IA utilisées aujourd'hui : <strong className="text-ink">{used} sur {dailyBudget()}</strong>. L'IA gratuite est partagée entre tous les comptes ; le compteur repart de zéro chaque nuit.
        </p>
      )}

      <Section title="Mes objectifs">
        <Prefs maxYears={profile.preferences.max_years ?? null} weeklyGoal={profile.preferences.weekly_goal ?? 5} />
      </Section>

      <Section title="Analyser une offre en un clic">
        <Bookmarklet />
      </Section>

      <Section title="Apparence">
        <ThemePicker />
      </Section>

      <Section title="Compte">
        <AccountCard email={user.email ?? ""} />
        <h3 className="heading mt-8">Mes données</h3>
        <p className="mb-3 mt-1 max-w-[62ch] text-sm text-muted">Tout t'appartient : télécharge une copie complète, ou supprime ton compte et tout ce qu'il contient.</p>
        <DataControls />
      </Section>
    </>
  );
}
