import Link from "next/link";
import {
  AlertTriangle, ArrowRight, BarChart3, CalendarClock, CalendarDays, Check, ChevronDown, Link2, Mail, MessageSquareText, ScanSearch, Smartphone, X,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { Gauge, ScorePill } from "@/components/ui/score";
import { siteUrl } from "@/lib/site";
import { getT } from "@/lib/i18n/server";
import { tx } from "@/lib/i18n/translate";

const SIGNUP = "/login?mode=signup";
const LOGIN = "/login";

/* ---------- Aperçus : de vraies mises en page de l'appli, avec des données fictives ---------- */

async function HeroPreview() {
  const t = await getT();
  return (
    <div className="relative mx-auto w-full max-w-[30rem] lg:max-w-none" aria-hidden>
      {/* Grand cadran en arrière-plan, le même que celui du logo */}
      <svg viewBox="0 0 100 100" className="pointer-events-none absolute -right-24 -top-20 hidden h-[28rem] w-[28rem] max-w-none opacity-80 sm:block" fill="none">
        <circle cx="50" cy="50" r="42" stroke="var(--color-line)" strokeWidth="5" strokeLinecap="round" strokeDasharray="198 999" transform="rotate(135 50 50)" />
        <circle cx="50" cy="50" r="42" stroke="var(--color-marigold)" strokeWidth="5" strokeLinecap="round" strokeDasharray="38 999" transform="rotate(135 50 50)" />
      </svg>

      {/* CV derrière la carte */}
      <div className="absolute -right-2 -top-8 hidden w-[58%] rotate-[4deg] rounded-xl bg-white p-5 text-[#151c38] shadow-lift ring-1 ring-black/5 sm:block">
        <p className="display text-lg">{t("Prénom Nom")}</p>
        <p className="text-[0.7rem] text-slate-500">{t("Data Analyst")}</p>
        <div className="mt-4 space-y-1.5">
          {[100, 92, 78, 0, 96, 84, 60].map((w, i) => (w ? <div key={i} className="h-1.5 rounded-full bg-slate-200" style={{ width: `${w}%` }} /> : <div key={i} className="h-2" />))}
        </div>
        <div className="mt-4 h-1.5 w-2/3 rounded-full bg-[#f5b800]/60" />
      </div>

      {/* Analyse d'une offre */}
      <div className="relative rounded-3xl border border-line bg-surface p-5 shadow-lift sm:mr-14 sm:mt-16 md:p-6">
        <span className="tag absolute -top-3 left-5">{t("Exemple")}</span>
        <div className="flex items-center gap-5">
          <Gauge value={87} size={108} label="" />
          <div className="min-w-0">
            <p className="text-xs text-muted">{t("Offre collée il y a 20 secondes")}</p>
            <p className="heading text-[1.35rem] leading-tight">{t("Data Analyst, secteur banque")}</p>
            <p className="mt-0.5 text-sm text-muted">{t("Norvia, Paris, CDI")}</p>
          </div>
        </div>
        <ul className="mt-5 space-y-2 text-sm">
          <li className="flex gap-2"><Check size={17} className="mt-0.5 shrink-0 text-good" /> {t("SQL, Power BI et reporting : ton profil les couvre.")}</li>
          <li className="flex gap-2"><Check size={17} className="mt-0.5 shrink-0 text-good" /> {t("2 ans demandés, tu en as 2.")}</li>
          <li className="flex gap-2"><AlertTriangle size={17} className="mt-0.5 shrink-0 text-marigold-deep" /> {t("Anglais courant demandé : à préciser sur ton CV.")}</li>
        </ul>
        <div className="mt-5 flex flex-wrap gap-2">
          <span className="btn btn-primary btn-sm">{t("Je candidate")}</span>
          <span className="btn btn-sm">{t("Pas pour moi")}</span>
        </div>
      </div>

      <div className="absolute -bottom-5 left-3 hidden items-center gap-2.5 rounded-2xl border border-line bg-surface px-3.5 py-2.5 text-sm shadow-lift sm:flex">
        <Mail size={17} className="text-muted" /> <span><b>{t("3 relances")}</b> {t("prêtes à envoyer")}</span>
      </div>
      <div className="absolute -bottom-9 right-0 hidden items-center gap-2.5 rounded-2xl bg-chrome px-3.5 py-2.5 text-sm text-white shadow-lift sm:flex">
        <CalendarClock size={17} className="text-marigold" /> {t("Entretien jeudi, 14 h")}
      </div>
    </div>
  );
}

async function AnalysisPreview() {
  const t = await getT();
  return (
    <div className="card p-5 shadow-lift md:p-6">
      <div className="flex items-center gap-2 rounded-xl bg-paper px-3 py-2 text-sm text-muted">
        <Link2 size={15} className="shrink-0" /><span className="truncate">{t("emploi-exemple.fr/offre/data-analyst-confirme")}</span>
      </div>
      <div className="mt-5 flex items-center gap-5">
        <Gauge value={54} size={108} label="" />
        <div className="min-w-0">
          <p className="heading text-lg leading-tight">{t("Data Analyst confirmé")}</p>
          <p className="text-sm text-muted">{t("Helixa, Lyon, CDI")}</p>
          <span className="tag tag-warn mt-2">{t("Jouable, avec un effort")}</span>
        </div>
      </div>
      <ul className="mt-5 space-y-2 text-sm">
        <li className="flex gap-2"><Check size={17} className="mt-0.5 shrink-0 text-good" /> {t("Python et SQL : dans ton profil.")}</li>
        <li className="flex gap-2"><X size={17} className="mt-0.5 shrink-0 text-bad" /> {t("5 ans d'expérience demandés, tu en as 2.")}</li>
        <li className="flex gap-2"><AlertTriangle size={17} className="mt-0.5 shrink-0 text-marigold-deep" /> {t("Tableau cité 3 fois, absent de ton CV.")}</li>
      </ul>
    </div>
  );
}

async function CvPreview() {
  const t = await getT();
  return (
    <div>
      <div className="mx-auto max-w-sm rounded-xl bg-white p-6 text-[#151c38] shadow-lift ring-1 ring-black/5">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3">
          <div><p className="display text-xl">{t("Prénom Nom")}</p><p className="text-xs text-slate-500">{t("Data Analyst")}</p></div>
          <span className="shrink-0 rounded-full bg-[#f5b800]/25 px-2.5 py-0.5 text-[0.68rem] font-semibold text-[#7a5a00]">{t("Adapté à Norvia")}</span>
        </div>
        <p className="mt-3 text-[0.7rem] font-bold text-slate-500">{t("Expérience")}</p>
        <div className="mt-2 space-y-1.5 text-[0.78rem] leading-snug">
          <p className="rounded-md bg-[#f5b800]/15 px-2 py-1.5">{t("Tableaux de bord Power BI suivis par 40 managers, temps de reporting divisé par 3.")}</p>
          <p className="px-2 py-1">{t("Automatisation de requêtes SQL sur 2 millions de lignes.")}</p>
          <p className="px-2 py-1 text-slate-500">{t("Autres réalisations, moins utiles pour cette offre : mises de côté.")}</p>
        </div>
        <p className="mt-3 text-[0.7rem] font-bold text-slate-500">{t("Compétences")}</p>
        <div className="mt-2 flex flex-wrap gap-1.5 text-[0.7rem]">
          {["SQL", "Power BI", "Python", "Excel"].map((s) => <span key={s} className="rounded-full bg-slate-100 px-2 py-0.5">{t(s)}</span>)}
        </div>
      </div>
      <div className="mt-4 flex justify-center gap-2">
        <span className="btn btn-sm">{t("Télécharger en PDF")}</span>
        <span className="btn btn-sm">{t("Lettre de motivation")}</span>
      </div>
    </div>
  );
}

async function MorningPreview() {
  const t = await getT();
  const rows = [
    { s: 91, t: tx("Data Analyst"), c: "Norvia, Paris, CDI" },
    { s: 78, t: tx("Analyste BI junior"), c: "Altéra, Nanterre, CDI" },
    { s: 63, t: tx("Chargé d'études statistiques"), c: "Helixa, Lille, CDD" },
  ];
  return (
    <div className="card overflow-hidden shadow-lift">
      <div className="flex items-center justify-between gap-3 px-4 py-3.5">
        <p className="font-semibold">{t("Ce matin, 14 nouvelles offres")}</p>
        <span className="tag">{t("triées par score")}</span>
      </div>
      <ul className="border-t border-line">
        {rows.map((r) => (
          <li key={r.t} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-0">
            <ScorePill value={r.s} />
            <div className="min-w-0 flex-1"><p className="truncate font-semibold">{t(r.t)}</p><p className="truncate text-sm text-muted">{t(r.c)}</p></div>
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line"><X size={16} className="text-muted" /></span>
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-marigold text-chrome"><Check size={16} /></span>
          </li>
        ))}
      </ul>
    </div>
  );
}

async function TrackingPreview() {
  const t = await getT();
  const cols = [
    { label: tx("À postuler"), cards: ["Analyste BI, Altéra", "Data Analyst, Norvia"] },
    { label: tx("Postulé"), cards: ["Chargé d'études, Helixa", "Data Analyst, Orvane", "BI Analyst, Kelvia"] },
    { label: tx("Entretien"), cards: ["Data Analyst, Lumen"] },
    { label: tx("Offre"), cards: [] as string[] },
  ];
  return (
    <div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {cols.map((c) => (
          <div key={c.label} className="rounded-2xl bg-paper p-2.5">
            <p className="flex justify-between px-1 pb-2 text-xs font-semibold text-muted"><span>{t(c.label)}</span><span>{c.cards.length}</span></p>
            <div className="space-y-2">
              {c.cards.map((card) => <p key={card} className="rounded-xl border border-line bg-surface px-2.5 py-2 text-[0.78rem] leading-snug shadow-sm">{t(card)}</p>)}
              {!c.cards.length && <p className="rounded-xl border border-dashed border-line px-2.5 py-2 text-[0.78rem] text-muted">{t("Bientôt")}</p>}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-sm shadow-sm">
        <Mail size={18} className="shrink-0 text-muted" />
        <p>{t("Réponse de Lumen lue et classée :")} <b>{t("entretien")}</b>{t(". Le statut est à jour.")}</p>
      </div>
    </div>
  );
}

/* ---------- Mise en page ---------- */

async function Feature({ title, text, points, flip, children }: { title: string; text: string; points: string[]; flip?: boolean; children: React.ReactNode }) {
  const t = await getT();
  return (
    <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-2 lg:gap-20">
      <div className={`min-w-0 ${flip ? "lg:order-2" : ""}`}>
        <h3 className="display text-[2.1rem] md:text-[2.7rem]">{t(title)}</h3>
        <p className="mt-4 max-w-[32rem] text-lg text-muted">{t(text)}</p>
        <ul className="mt-6 space-y-2.5">
          {points.map((p) => <li key={p} className="flex gap-2.5"><Check size={19} className="mt-1 shrink-0 text-good" /> {t(p)}</li>)}
        </ul>
      </div>
      <div aria-hidden className={`min-w-0 rounded-3xl bg-line/45 p-4 sm:p-7 ${flip ? "lg:order-1" : ""}`}>{children}</div>
    </div>
  );
}

const ALSO = [
  { icon: ScanSearch, title: tx("Un diagnostic de CV franc"), text: tx("Positionnement, incohérences, lisibilité par les robots de tri, plan d'action.") },
  { icon: MessageSquareText, title: tx("L'entretien préparé"), text: tx("Une fiche tirée de l'offre et de ton profil, pour ne pas arriver à froid.") },
  { icon: Mail, title: tx("Les relances rédigées"), text: tx("Après un entretien resté sans nouvelles, le brouillon du message t'attend.") },
  { icon: BarChart3, title: tx("Des stats qui servent"), text: tx("Candidatures, réponses, entretiens : tu vois ce qui marche et ce qui bloque.") },
  { icon: CalendarDays, title: tx("Ton agenda à jour"), text: tx("Entretiens et relances s'affichent dans Google Agenda, Apple ou Outlook.") },
  { icon: Smartphone, title: tx("Sur ton téléphone"), text: tx("S'installe comme une appli, avec un mode sombre qui suit celui de ton téléphone.") },
];

const STEPS = [
  { t: tx("Crée ton espace"), d: tx("Un email et un mot de passe, rien d'autre. Compte une demi-minute.") },
  { t: tx("Dis ce que tu cherches"), d: tx("Quelques questions avec des listes : postes, contrats, zone. Puis dépose ton CV, ou passe cette étape.") },
  { t: tx("Trie les offres du matin"), d: tx("Chaque offre arrive avec son score. Tu gardes ou tu écartes d'un geste.") },
  { t: tx("Postule en deux clics"), d: tx("Le CV et la lettre sont prêts. Tu envoies, tu cliques « envoyé », le suivi se met à jour.") },
];

const PRINCIPLES = [
  { t: tx("Rien ne part sans toi"), d: tx("JobPilot prépare les CV, les lettres et les relances. C'est toi qui envoies chaque candidature.") },
  { t: tx("Rien n'est inventé"), d: tx("Les documents reprennent ce qui est dans ton profil. Quand une information manque, l'app te le dit au lieu de la deviner.") },
  { t: tx("Rien à payer"), d: tx("L'app tourne sur des services gratuits. Pas d'abonnement, pas de carte bancaire demandée.") },
];

const FAQ = [
  { q: tx("C'est vraiment gratuit ?"), a: tx("Oui. L'app s'appuie sur des services gratuits : tes alertes emploi reçues par Gmail, l'IA de Google en formule gratuite et la base Supabase. En contrepartie, l'IA a un quota par jour qui se remet à zéro chaque matin. Si elle est saturée, l'app réessaie toute seule, puis te prévient.") },
  { q: tx("L'app postule-t-elle à ma place ?"), a: tx("Non, jamais. Elle prépare le CV, la lettre et les relances. Tu envoies toi-même, puis tu marques la candidature comme envoyée pour que le suivi reste juste.") },
  { q: tx("Que deviennent mes données ?"), a: tx("Chaque compte n'accède qu'à ses propres données, et tu peux tout exporter ou supprimer dans Réglages. Pour analyser ton CV et les offres, l'app envoie leur texte à l'IA de Google : avec la formule gratuite, Google peut réutiliser ces textes pour améliorer ses produits. Évite d'y mettre ce que tu ne veux pas partager (numéro de sécurité sociale, par exemple).") },
  { q: tx("Faut-il connecter Gmail ?"), a: tx("Non, c'est facultatif. Connecté en lecture seule, Gmail permet de ranger les réponses de recruteurs et les alertes emploi. La permission d'envoyer n'est demandée que si tu actives le récap du matin (un email à toi-même). Tu peux déconnecter Gmail à tout moment dans Réglages. Les données de Gmail ne servent qu'à ça : jamais de publicité, jamais vendues, jamais utilisées pour entraîner une IA (détails dans la page Confidentialité).") },
  { q: tx("Ça marche pour quel métier ?"), a: tx("Tous. Le questionnaire propose des familles de métiers, comme sur les sites d'emploi. Les alertes de tes sites d'emploi arrivent notées dans l'app, et la page Recherche ouvre chaque site avec ta recherche déjà remplie ; pour une offre trouvée ailleurs, colle son lien ou son texte.") },
  { q: tx("Faut-il un CV prêt pour commencer ?"), a: tx("Non. Tu peux déposer un ou plusieurs CV (PDF, Word, texte) : l'app les fusionne en un profil maître, la base de tous tes CV sur mesure. Tu peux aussi passer cette étape et le faire plus tard.") },
];

/** Données structurées pour Google : ce qu'est le service, en quelques champs (nom, catégorie, gratuit). Texte fixe, pas de contenu d'utilisateur. */
const structuredData = () => JSON.stringify({
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "JobPilot",
  url: siteUrl(),
  description: tx("Suivi de candidatures, analyse des offres d'emploi, CV et lettres de motivation sur mesure."),
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  inLanguage: "fr",
  offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
}).replace(/</g, "\\u003c");

export async function Landing() {
  const t = await getT();
  return (
    <div className="bg-paper text-ink">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: structuredData() }} />
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-5 md:px-8">
        <Logo />
        <nav aria-label={t("Sections")} className="hidden items-center gap-7 text-[0.95rem] md:flex">
          <a href="#fonctions" className="text-muted hover:text-ink">{t("Fonctions")}</a>
          <a href="#etapes" className="text-muted hover:text-ink">{t("Comment ça marche")}</a>
          <a href="#questions" className="text-muted hover:text-ink">{t("Questions")}</a>
        </nav>
        <div className="flex items-center gap-2">
          <Link href={LOGIN} className="btn btn-ghost btn-sm">{t("Se connecter")}</Link>
          <Link href={SIGNUP} className="btn btn-primary btn-sm"><span className="sm:hidden">{t("S'inscrire")}</span><span className="hidden sm:inline">{t("Créer mon espace")}</span></Link>
        </div>
      </header>

      <div>
        {/* Accroche */}
        <section className="relative overflow-hidden">
          <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-16 px-5 pb-24 pt-8 md:px-8 lg:grid-cols-[1.05fr_1fr] lg:gap-10 lg:pb-32 lg:pt-14">
            <div className="relative">
              <h1 className="display text-[3.2rem] sm:text-[4.4rem] lg:text-[4.8rem]">{t("Colle une offre. JobPilot s'occupe du reste.")}</h1>
              <p className="mt-6 max-w-[34rem] text-lg text-muted md:text-xl">
                {t("Il note ta compatibilité avec l'annonce, écrit le CV et la lettre qui vont avec, range les réponses des recruteurs et te dit qui relancer. Toi, tu postules.")}
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href={SIGNUP} className="btn btn-primary btn-xl">{t("Créer mon espace")} <ArrowRight size={18} /></Link>
                <Link href={LOGIN} className="btn btn-xl">{t("J'ai déjà un compte")}</Link>
              </div>
              <ul className="mt-8 flex flex-col gap-2 text-[0.95rem] text-muted sm:flex-row sm:flex-wrap sm:gap-x-6">
                {["Gratuit", "Rien ne part sans ton accord", "Prêt en deux minutes"].map((point) => (
                  <li key={point} className="flex items-center gap-2"><Check size={17} className="text-good" /> {t(point)}</li>
                ))}
              </ul>
            </div>
            <HeroPreview />
          </div>
        </section>

        {/* Fonctions */}
        <section id="fonctions" className="scroll-mt-6 border-t border-line py-20 md:py-28">
          <div className="mx-auto max-w-6xl px-5 md:px-8">
            <h2 className="display max-w-[18ch] text-[2.5rem] md:text-[3.6rem]">{t("Tout ce qui te fatigue dans une recherche d'emploi")}</h2>
            <p className="mt-4 max-w-[38rem] text-lg text-muted">{t("Voici ce que JobPilot prend en charge. Les aperçus ci-dessous montrent les vrais écrans de l'appli, avec des données fictives.")}</p>

            <div className="mt-16 space-y-24 md:mt-20 md:space-y-32">
              <Feature title={t("Sache en 20 secondes si l'offre vaut le coup")}
                text="Colle le lien ou le texte d'une annonce. JobPilot la compare à ton profil et te donne un score, avec les raisons."
                points={["Ce qui colle, ce qui manque, ce qui est hors de portée", "Les pièges repérés : années d'expérience, outils exigés, salaire", "Tu perds moins de temps sur les offres qui n'étaient pas pour toi"]}>
                <AnalysisPreview />
              </Feature>
              <Feature flip title={t("Un CV et une lettre pour chaque offre")}
                text="L'app choisit dans ton profil les réalisations qui comptent pour cette annonce, et laisse le reste de côté."
                points={["Prêt à télécharger en PDF, mis en page proprement", "Aucune invention : tout vient de ton profil", "Un seul profil maître à tenir à jour, pas dix fichiers Word"]}>
                <CvPreview />
              </Feature>
              <Feature title={t("Chaque matin, des offres déjà triées")}
                text="Un clic depuis n'importe quel site d'offres envoie la page à JobPilot, qui note chaque offre. Tes alertes emploi Gmail arrivent notées elles aussi."
                points={["Un geste pour garder ou écarter, sans ouvrir vingt onglets", "Tes refus apprennent à l'app ce que tu ne veux pas", "Les offres trop exigeantes pour ton expérience sont masquées"]}>
                <MorningPreview />
              </Feature>
              <Feature flip title={t("Tes candidatures suivies sans y penser")}
                text="Chaque candidature a son statut, son CV et, après un entretien, sa relance. Gmail, si tu le connectes, met le suivi à jour."
                points={["Un tableau simple, de « à postuler » à « offre »", "Les réponses de recruteurs lues et classées toutes seules", "Un brouillon de relance quand un entretien reste sans nouvelles"]}>
                <TrackingPreview />
              </Feature>
            </div>

            <ul className="mt-24 grid grid-cols-1 gap-x-12 gap-y-9 border-t border-line pt-14 sm:grid-cols-2 lg:grid-cols-3">
              {ALSO.map(({ icon: Icon, title, text }) => (
                <li key={title} className="flex gap-4">
                  <Icon size={24} className="mt-0.5 shrink-0 text-marigold-deep" />
                  <div><h3 className="heading text-lg">{t(title)}</h3><p className="mt-1 text-muted">{t(text)}</p></div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Étapes */}
        <section id="etapes" className="scroll-mt-6 bg-chrome py-20 text-white md:py-28">
          <div className="mx-auto max-w-6xl px-5 md:px-8">
            <h2 className="display max-w-[16ch] text-[2.5rem] md:text-[3.6rem]">{t("Comment ça marche")}</h2>
            <ol className="mt-14 grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
              {STEPS.map((s, i) => (
                <li key={s.t} className="border-t border-white/15 pt-5">
                  <span className="display text-[3.4rem] leading-none text-marigold" aria-hidden>{i + 1}</span>
                  <h3 className="heading mt-3 text-xl">{t(s.t)}</h3>
                  <p className="mt-2 text-chrome-ink">{t(s.d)}</p>
                </li>
              ))}
            </ol>
            <div className="mt-14"><Link href={SIGNUP} className="btn btn-primary btn-xl">{t("Commencer maintenant")} <ArrowRight size={18} /></Link></div>
          </div>
        </section>

        {/* Principes */}
        <section className="py-20 md:py-28">
          <div className="mx-auto max-w-6xl px-5 md:px-8">
            <h2 className="display max-w-[16ch] text-[2.5rem] md:text-[3.6rem]">{t("Il prépare. C'est toi qui décides.")}</h2>
            <div className="mt-12 grid gap-10 md:grid-cols-3 md:gap-12">
              {PRINCIPLES.map((p) => (
                <div key={p.t} className="border-t-2 border-ink pt-5">
                  <h3 className="heading text-2xl">{t(p.t)}</h3>
                  <p className="mt-3 text-lg text-muted">{t(p.d)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Questions */}
        <section id="questions" className="scroll-mt-6 border-t border-line py-20 md:py-28">
          <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-5 md:px-8 lg:grid-cols-[1fr_1.6fr] lg:gap-20">
            <h2 className="display text-[2.5rem] md:text-[3.2rem]">{t("Questions fréquentes")}</h2>
            <div className="border-t border-line">
              {FAQ.map((f) => (
                <details key={f.q} className="group border-b border-line py-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-semibold [&::-webkit-details-marker]:hidden">
                    {t(f.q)}
                    <ChevronDown size={20} className="shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden />
                  </summary>
                  <p className="mt-3 max-w-[40rem] text-muted">{t(f.a)}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Appel final */}
        <section className="px-5 pb-20 md:px-8 md:pb-28">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-8 rounded-[2rem] bg-chrome px-7 py-12 text-white md:flex-row md:items-center md:justify-between md:px-14 md:py-16">
            <div>
              <h2 className="display max-w-[16ch] text-[2.4rem] md:text-[3.4rem]">{t("Garde ton énergie pour les entretiens.")}</h2>
              <p className="mt-3 max-w-[30rem] text-lg text-chrome-ink">{t("Crée ton espace, dis ce que tu cherches, et laisse JobPilot faire la partie pénible.")}</p>
            </div>
            <div className="flex w-full shrink-0 flex-col gap-3 sm:w-auto">
              <Link href={SIGNUP} className="btn btn-primary btn-xl">{t("Créer mon espace")} <ArrowRight size={18} /></Link>
              <Link href={LOGIN} className="btn btn-xl !border-white/25 !bg-transparent !text-white hover:!bg-white/10">{t("Se connecter")}</Link>
            </div>
          </div>
        </section>
      </div>

      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 border-t border-line px-5 py-8 text-sm text-muted md:px-8">
        <Logo size={24} />
        <nav aria-label={t("Pied de page")} className="flex flex-wrap gap-x-6 gap-y-2">
          <Link href={LOGIN} className="hover:text-ink">{t("Se connecter")}</Link>
          <Link href={SIGNUP} className="hover:text-ink">{t("Créer mon espace")}</Link>
          <Link href="/mentions-legales" className="hover:text-ink">{t("Mentions légales")}</Link>
          <Link href="/confidentialite" className="hover:text-ink">{t("Confidentialité")}</Link>
        </nav>
      </footer>
    </div>
  );
}
