import { CircleCheck, CircleAlert, Circle, ExternalLink } from "lucide-react";
import { requireAdminPage } from "@/lib/admin-guard";
import { loadOverview, serviceClient, type AdminOverview } from "@/lib/admin-data";
import { supabaseDashboardUrl } from "@/lib/admin";
import { modelInfo } from "@/lib/llm";
import { MIGRATION_SQL } from "@/lib/migration-sql";
import { PageTitle, Section } from "@/components/ui/page-title";
import { AiTest, CopySql, SourcesTest } from "@/components/settings-controls";
import { CopyId } from "@/components/copy-id";
import { fmtDate, plural } from "@/lib/format";
import { activeSources } from "@/lib/sources";
import { describeKeys, keysSummary, KEY_GROUPS, rowsOfGroup } from "@/lib/admin-keys";
import { AdminTabs, type AdminTab } from "@/components/admin-tabs";

export const dynamic = "force-dynamic";
export const metadata = { title: "Administration", robots: { index: false, follow: false } };

type Check = { id: string; label: string; state: "ok" | "todo" | "optional"; hint?: string };

/** Réservée aux adresses de OWNER_EMAILS : tout autre visiteur reçoit une page introuvable. */
export default async function Admin() {
  const { supabase, user } = await requireAdminPage();
  const [interviewCol, diagTable, usageTable, cronCol, rateTable, textTable] = await Promise.all([
    supabase.from("applications").select("interview_at").limit(1),
    supabase.from("diagnostics").select("id").limit(1),
    supabase.from("ai_usage").select("n").limit(1),
    supabase.from("profiles").select("cron_at").limit(1),
    supabase.from("rate_hits").select("n").limit(1), // table des limites de requêtes (aucune politique : on lit 0 ligne, l'erreur dit seulement si la table existe)
    supabase.from("application_texts").select("application_id").limit(1), // textes d'annonce gardés sur les lignes « À analyser »
  ]);

  let overview: AdminOverview | null = null;
  let overviewError: string | null = null;
  const service = serviceClient();
  if (service) {
    try {
      overview = await loadOverview(service, user.id);
    } catch (e) {
      overviewError = e instanceof Error ? e.message : "Lecture des comptes impossible.";
    }
  }

  const has = (...n: string[]) => n.every((k) => Boolean(process.env[k]));
  const ai = modelInfo();
  const dbOk = !interviewCol.error && !diagTable.error && !usageTable.error && !cronCol.error && !rateTable.error && !textTable.error;
  const sources = activeSources();
  const checks: Check[] = [
    { id: "ai", label: `IA (${[...new Set([...ai.chains.main, ...ai.chains.fast].map((p) => p.name))].join(", ") || "aucune clé"})`, state: ai.configured ? "ok" : "todo", hint: "Ajoute GEMINI_API_KEY dans Vercel (clé gratuite sur aistudio.google.com), puis redéploie. GROQ_API_KEY et MISTRAL_API_KEY (gratuites aussi) répartissent la charge." },
    { id: "db", label: "Base de données à jour", state: dbOk ? "ok" : "todo", hint: "Une mise à jour de la base est disponible (agenda, pages plus rapides, quota IA par personne, limites de requêtes, texte des annonces gardées). Le script est juste en dessous." },
    { id: "cron", label: "Tâche automatique du matin", state: has("SUPABASE_SERVICE_ROLE_KEY", "CRON_SECRET") ? "ok" : "todo", hint: "Ajoute SUPABASE_SERVICE_ROLE_KEY et CRON_SECRET dans Vercel, puis redéploie." },
    { id: "gmail", label: "Connexion Gmail", state: has("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET") ? "ok" : "todo", hint: "Ajoute GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET dans Vercel, puis redéploie." },
    { id: "sources", label: "Sources d'offres automatiques", state: sources.length ? "ok" : "optional", hint: "Facultatif : Adzuna ou Jooble apportent des offres chaque matin (clé gratuite). Voir l'onglet Sources. Sans elles, les alertes Gmail et le copier-coller suffisent." },
    { id: "legal", label: "Pages légales (éditeur et contact)", state: has("PUBLISHER_NAME", "PUBLISHER_EMAIL") ? "ok" : "optional", hint: "À faire avant d'inviter d'autres personnes : ajoute PUBLISHER_NAME et PUBLISHER_EMAIL dans Vercel. Ils s'affichent dans les mentions légales et la politique de confidentialité." },
  ];
  const todo = checks.filter((c) => c.state === "todo").length;

  const keyRows = describeKeys();
  const keys = keysSummary(keyRows);
  const keysToSee = keys.missingRequired + keys.problems;

  const sha = process.env.VERCEL_GIT_COMMIT_SHA;
  const links = [
    { label: "Supabase (base et comptes)", href: supabaseDashboardUrl(process.env.NEXT_PUBLIC_SUPABASE_URL) },
    { label: "Vercel (déploiements et journaux)", href: "https://vercel.com/dashboard" },
    process.env.VERCEL_GIT_REPO_OWNER && process.env.VERCEL_GIT_REPO_SLUG
      ? { label: "GitHub (code)", href: `https://github.com/${process.env.VERCEL_GIT_REPO_OWNER}/${process.env.VERCEL_GIT_REPO_SLUG}` }
      : null,
  ].filter((l): l is { label: string; href: string } => Boolean(l && l.href));

  const tabs: AdminTab[] = [
    { id: "installation", label: "Installation", note: todo ? `${todo} à faire` : undefined, warn: todo > 0, panel: (
      <>
      <Section title="Ce qui est en place" aside={<span className={`tag ${todo ? "tag-warn" : "tag-good"}`}>{todo ? `${todo} à faire` : "Tout est en place"}</span>}>
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
      </Section>
      {links.length > 0 && (
        <Section title="Liens utiles">
          <ul className="list">
            {links.map((l) => (
              <li key={l.href}>
                <a className="link flex items-center gap-2 px-4 py-2" href={l.href} target="_blank" rel="noreferrer">
                  <ExternalLink size={16} aria-hidden /> {l.label}
                </a>
              </li>
            ))}
          </ul>
        </Section>
      )}
      </>
    ) },
    { id: "cles", label: "Clés", note: keysToSee ? `${keysToSee} à voir` : undefined, warn: keysToSee > 0, panel: (
      <Section
        title="Variables d'environnement"
        aside={<span className={`tag ${keys.missingRequired ? "tag-bad" : keys.problems ? "tag-warn" : "tag-good"}`}>{keys.missingRequired ? `${keys.missingRequired} indispensable${keys.missingRequired > 1 ? "s" : ""} manquante${keys.missingRequired > 1 ? "s" : ""}` : keys.problems ? `${keys.problems} à corriger` : "Rien d'anormal"}</span>}
      >
        <p className="mb-4 max-w-[65ch] text-sm text-muted">
          Ici, une clé est « présente » ou « absente » : sa valeur n'est jamais affichée (seuls quelques réglages sans secret montrent la leur). Pour en ajouter ou en corriger une :
          Vercel, Settings, Environment Variables, puis Redeploy (les variables <code>NEXT_PUBLIC_</code> ne changent qu'au déploiement). Ne colle jamais une clé dans un chat.
        </p>
        {KEY_GROUPS.map((g) => (
          <div key={g} className="mb-5">
            <h3 className="mb-1.5 flex items-center gap-2 text-sm font-semibold">
              {g}
              {g === "IA" && <span className={`tag ${keys.aiKeys ? "tag-good" : "tag-bad"}`}>{keys.aiKeys ? plural(keys.aiKeys, "clé d'IA", "clés d'IA") : "aucune clé d'IA"}</span>}
            </h3>
            <ul className="list">
              {rowsOfGroup(keyRows, g).map((r) => (
                <li key={r.name} className="flex items-start gap-3 px-4 py-2.5">
                  {r.state === "ok" ? <CircleCheck size={18} aria-hidden className="mt-0.5 shrink-0 text-good" /> : r.required ? <CircleAlert size={18} aria-hidden className="mt-0.5 shrink-0 text-bad" /> : <Circle size={18} aria-hidden className="mt-0.5 shrink-0 text-muted" />}
                  <div className="min-w-0 flex-1">
                    <p className="break-all font-mono text-sm font-semibold">{r.name}</p>
                    <p className="text-sm text-muted">{r.role}</p>
                    {r.problem && <p className="text-sm text-bad">À corriger : {r.problem}.</p>}
                  </div>
                  <span className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                    {r.value && <span className="tag max-w-[16rem] truncate font-mono" title={r.value}>{r.value}</span>}
                    <span className={`tag ${r.state === "ok" ? (r.problem ? "tag-warn" : "tag-good") : r.required ? "tag-bad" : ""}`}>{r.state === "ok" ? "Présente" : r.required ? "Manquante" : "Absente"}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </Section>
    ) },
    { id: "sources", label: "Sources", panel: (
      <>
      <Section title="Sources d'offres automatiques" aside={<span className={`tag ${sources.length ? "tag-good" : ""}`}>{sources.length ? `${sources.length} branchée${sources.length > 1 ? "s" : ""}` : "Aucune"}</span>}>
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
              <li>Demande une clé gratuite sur <a className="link" href="https://jooble.org/api/about" target="_blank" rel="noreferrer">jooble.org/api/about</a> (elle arrive par email). Chaque pays a son site Jooble et sa propre clé : pour la France, choisis la France (fr.jooble.org) si le site te le propose.</li>
              <li>Dans Vercel, ajoute <code>JOOBLE_API_KEY</code> avec la clé seule (sans guillemets ni espace), puis fais Redeploy. JobPilot essaie fr.jooble.org puis jooble.org.</li>
              <li>Clique sur « Tester les sources » : le message dit quels sites ont répondu, et jamais la clé.</li>
            </ol>
          </li>
        </ul>
        {sources.length > 0 && (
          <div className="mt-4">
            <SourcesTest />
            <p className="mt-2 max-w-[62ch] text-sm text-muted">Envoie une vraie requête à chaque source branchée (elle compte sur le quota gratuit partagé) : une clé refusée ou un quota atteint s'affiche ici, avant que les comptes ne le remarquent.</p>
          </div>
        )}
        <p className="mt-4 max-w-[65ch] text-sm text-muted">
          France Travail n'est pas branché : son API « Offres d'emploi » est réservée aux organismes qui en font la demande. Ses offres passent par le favori, les alertes Gmail ou le copier-coller.
        </p>
      </Section>
      </>
    ) },
    { id: "comptes", label: "Comptes et usage", panel: (
      <>
      <Section title="Comptes et usage de l'IA" aside={overview && <span className="tag">{plural(overview.summary.accounts, "compte", "comptes")}</span>}>
        {!service && (
          <p className="max-w-[62ch] text-muted">
            Pour voir les comptes et l'usage de l'IA, ajoute <code>SUPABASE_SERVICE_ROLE_KEY</code> dans Vercel (Settings, Environment Variables), puis fais Redeploy. Ne colle jamais cette clé dans un chat.
          </p>
        )}
        {overviewError && <p className="rounded-xl bg-bad/10 p-3 text-sm text-bad" role="status">{overviewError}</p>}
        {overview && (
          <>
            <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {[
                ["Comptes", overview.summary.accounts],
                ["Connectés cette semaine", overview.summary.active7],
                [`Actions IA aujourd'hui`, overview.summary.aiToday],
                [overview.cap == null ? "Plafond par personne" : `Au plafond du jour (${overview.cap})`, overview.cap == null ? "aucun" : overview.summary.atCap],
              ].map(([label, n]) => (
                <div key={label} className="rounded-2xl border border-line bg-surface p-4">
                  <dd className="heading text-2xl">{n}</dd>
                  <dt className="mt-1 text-sm text-muted">{label}</dt>
                </div>
              ))}
            </dl>

            <div className="list mt-4 overflow-x-auto">
              <table className="w-full min-w-[40rem] text-left text-sm">
                <caption className="sr-only">Comptes anonymes, usage de l'IA et nombre de candidatures</caption>
                <thead className="text-muted">
                  <tr>
                    <th scope="col" className="px-4 py-2 font-semibold">Compte</th>
                    <th scope="col" className="px-3 py-2 font-semibold">Créé le</th>
                    <th scope="col" className="px-3 py-2 font-semibold">Dernière connexion</th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">IA aujourd'hui</th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">IA 7 jours</th>
                    <th scope="col" className="px-4 py-2 text-right font-semibold">Candidatures</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.rows.map((r) => (
                    <tr key={r.id} className="border-t border-line">
                      <th scope="row" className="px-4 py-1.5 font-medium">
                        <span className="flex items-center gap-1.5">
                          <span className="font-mono text-[0.82rem]">{r.code}</span>
                          {r.me && <span className="tag tag-good">Toi</span>}
                          <CopyId id={r.id} code={r.code} />
                        </span>
                      </th>
                      <td className="px-3 py-2">{fmtDate(r.createdAt) || "—"}</td>
                      <td className="px-3 py-2">{fmtDate(r.lastSignInAt) || "jamais"}</td>
                      <td className={`px-3 py-2 text-right ${overview.cap != null && r.aiToday >= overview.cap ? "font-semibold text-bad" : ""}`}>{r.aiToday}</td>
                      <td className="px-3 py-2 text-right">{r.ai7}</td>
                      <td className="px-4 py-2 text-right">{r.applications ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {overview.truncated && <p className="mt-2 text-sm text-muted">Seuls les {overview.rows.length} premiers comptes sont listés ({overview.total} au total).</p>}
            {overview.countedFor < overview.rows.length && <p className="mt-2 text-sm text-muted">Les candidatures ne sont comptées que pour {overview.countedFor} comptes.</p>}

            <h3 className="heading mt-6">Actions IA, 7 derniers jours (tous comptes)</h3>
            <ul className="mt-2 space-y-1.5 text-sm" aria-label="Actions IA par jour">
              {overview.perDay.map((d) => {
                const max = Math.max(...overview.perDay.map((x) => x.n), 1);
                return (
                  <li key={d.day} className="flex items-center gap-3">
                    <span className="w-14 shrink-0 text-muted">{fmtDate(d.day)}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface" aria-hidden><span className="block h-full rounded-full bg-marigold" style={{ width: `${(d.n / max) * 100}%` }} /></span>
                    <span className="w-10 shrink-0 text-right tabular-nums">{d.n}</span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-4 max-w-[62ch] text-sm text-muted">
              Les comptes sont anonymes : un code court, jamais l'adresse. Pour voir qui est qui, copie l'identifiant complet (l'icône à côté du code) et colle-le dans Supabase (Authentication, Users). Cette page ne montre que des totaux, jamais les offres, les CV, les emails ni le texte des candidatures. Les comptes administrateurs (OWNER_EMAILS) n'ont pas de plafond et ne sont pas comptés dans l'IA.
            </p>
          </>
        )}
      </Section>
      </>
    ) },
  ];

  return (
    <div className="admin-dense">
      <PageTitle
        title="Administration"
        sub={sha ? `Version en ligne : ${sha.slice(0, 7)}${process.env.VERCEL_GIT_COMMIT_MESSAGE ? `, « ${process.env.VERCEL_GIT_COMMIT_MESSAGE.split("\n")[0].slice(0, 90)} »` : ""}.` : "Cette page n'est visible que par toi."}
      />
      <AdminTabs tabs={tabs} initial="installation" />
    </div>
  );
}
