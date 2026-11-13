import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { requireUser } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import { PageTitle, Section } from "@/components/ui/page-title";
import { SyncButton } from "@/components/sync-button";
import { ThemePicker } from "@/components/theme";
import { AccountCard, Bookmarklet, DataControls, GmailControls, Prefs, RecapControls } from "@/components/settings-controls";
import { fmtDate } from "@/lib/format";
import { isOwner, usedToday, dailyBudget, describeUsage } from "@/lib/quota";
import { getT } from "@/lib/i18n/server";
import { tx } from "@/lib/i18n/translate";

export const dynamic = "force-dynamic";
export const metadata = { title: tx("Réglages") };

const MSG: Record<string, string> = {
  ok: "Gmail est connecté.",
  recap_ok: "C'est activé : tu recevras ton récap chaque matin vers 7 h. Clique « M'envoyer un test maintenant » pour le voir tout de suite.",
  erreur: "La connexion Gmail a échoué. Réessaie.",
  pas_de_refresh: "Google n'a pas renvoyé d'accès durable. Retire JobPilot dans ton compte Google (Sécurité > Applications tierces) puis reconnecte-le.",
};

export default async function Parametres({ searchParams }: { searchParams: Promise<{ gmail?: string }> }) {
  const t = await getT();
  const { gmail: flash } = await searchParams;
  const { supabase, user } = await requireUser();
  const admin = isOwner(user.email);
  const [{ data: gmail }, { count }, profile, used] = await Promise.all([
    supabase.from("gmail_accounts").select("email, last_sync_at").maybeSingle(),
    supabase.from("emails").select("id", { count: "exact", head: true }),
    getProfile(supabase, user),
    usedToday(supabase, user.id),
  ]);

  const gmailIssue = profile.preferences.gmail_issue ?? null;
  const recapOn = !!profile.preferences.daily_recap && !!profile.preferences.recap_send_ok;

  return (
    <>
      <PageTitle title={t("Réglages")} />
      {flash && MSG[flash] && <p className="mb-6 rounded-xl bg-surface p-3 text-sm" role="status">{t(MSG[flash])}</p>}

      {admin && (
        <Section title={t("Administration")} id="administration">
          <p className="max-w-[62ch] text-muted">{t("Installation, test des IA, sources d'offres, comptes et usage : tout ce qui est réservé à l'admin est dans une page à part.")}</p>
          <Link className="btn btn-sm mt-3" href="/admin"><ShieldCheck size={15} aria-hidden /> {t("Ouvrir l'administration")}</Link>
        </Section>
      )}

      <Section title={t("Gmail")} id="gmail">
        {gmail ? (
          <>
            <p>{gmailIssue ? t("Compte") : t("Connecté")} : <strong>{gmail.email}</strong></p>
            <p className="mt-1 text-sm text-muted">
              {t("Dernière lecture :")} {gmail.last_sync_at ? t(fmtDate(gmail.last_sync_at)) : t("jamais")}, {count ?? 0} {t("emails de recrutement rangés.")}
            </p>
            {gmailIssue && (
              <p className="mt-3 max-w-[62ch] rounded-xl border border-bad/40 bg-bad/10 p-3 text-sm" role="alert">
                <strong>{t("Google a coupé l'accès à ta boîte mail")}</strong> {t("(constaté le")} {t(fmtDate(gmailIssue.at))}{t(") : tes emails ne sont plus lus. Clique « Reconnecter Gmail » : quelques secondes, et tout ce qui est déjà rangé reste là.")}
              </p>
            )}
            <div className="mt-4 flex flex-wrap items-start gap-2">
              <SyncButton label={t("Lire mes emails maintenant")} />
              <GmailControls connected issue={!!gmailIssue} recap={recapOn} />
            </div>
            <RecapControls email={gmail.email} enabled={!!profile.preferences.daily_recap} sendOk={!!profile.preferences.recap_send_ok} last={profile.preferences.recap_last} />
          </>
        ) : (
          <>
            <p className="max-w-[62ch]">
              {t("L'app lit (sans en écrire ni en envoyer à d'autres) les emails liés à ta recherche : alertes LinkedIn, Indeed, APEC, WTTJ, accusés de réception, refus, invitations à des entretiens. Elle met ton suivi à jour et range les offres des alertes dans Recommandées.")}
            </p>
            <div className="mt-4"><GmailControls connected={false} /></div>
          </>
        )}
        <p className="mt-4 max-w-[62ch] text-sm text-muted">
          {t("Chaque matin vers 7 h, l'app lit Gmail, relance tes recherches sauvegardées (si une source d'offres est branchée), calcule le score des meilleures offres et les range dans Recommandées. Elle n'envoie aucune candidature sans toi.")}
        </p>
      </Section>

      {used !== null && !isOwner(user.email) && (
        <p className="mb-6 text-sm text-muted" role="note">
          {t("Actions IA utilisées aujourd'hui :")} <strong className="text-ink">{t(describeUsage(used, dailyBudget()).figure)}</strong>. {t(describeUsage(used, dailyBudget()).note)}
        </p>
      )}

      <Section title={t("Mes objectifs")}>
        <Prefs maxYears={profile.preferences.max_years ?? null} weeklyGoal={profile.preferences.weekly_goal ?? 5} dailyQuota={profile.preferences.daily_quota ?? 10} />
      </Section>

      <Section title={t("Analyser une offre en un clic")}>
        <Bookmarklet />
      </Section>

      <Section title={t("Apparence")}>
        <ThemePicker />
      </Section>

      <Section title={t("Compte")}>
        <AccountCard email={user.email ?? ""} />
        <h3 className="heading mt-8">{t("Mes données")}</h3>
        <p className="mb-3 mt-1 max-w-[62ch] text-sm text-muted">{t("Tout t'appartient : télécharge une copie complète, ou supprime ton compte et tout ce qu'il contient.")}</p>
        <DataControls />
      </Section>
    </>
  );
}
