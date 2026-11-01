/** `sources` : les CV d'où vient cette réalisation (« CV Data », « CV AMOA »…), pour retrouver l'origine d'une information. */
export type Achievement = { text: string; tags: string[]; sources?: string[] };

export type Experience = {
  id: string;
  company: string;
  sector?: string;
  role: string;
  type?: string; // Alternance, CDI, Freelance, Stage...
  location?: string;
  start: string;
  end: string;
  achievements: Achievement[];
};

export type Education = { degree: string; school: string; start?: string; end?: string; details?: string[] };
export type Project = { name: string; year?: string; description: string; tags: string[]; link?: string };
export type Target = { id: string; title: string; pitch: string };

export type Profile = {
  identity: {
    name: string;
    email: string;
    phone?: string;
    city?: string;
    mobility?: string;
    availability?: string;
    links: { label: string; url: string }[];
  };
  targets: Target[];
  experiences: Experience[];
  education: Education[];
  projects: Project[];
  skills: Record<string, string[]>;
  certifications: string[];
  languages: { name: string; level: string }[];
  interests: string[];
  preferences: {
    contracts: string[]; remote?: string; salary?: string; sectors?: string[]; max_years?: number | null; weekly_goal?: number; ics_token?: string;
    daily_recap?: boolean; recap_send_ok?: boolean;   // récap du matin par Gmail : activé / permission d'envoi accordée
    recap_last?: { at: string; ok: boolean; note?: string };
    search_zone?: SearchZone;   // où chercher (questionnaire d'accueil), reprise par défaut dans Recherche
    onboarded?: boolean;        // questionnaire d'accueil terminé (avec ou sans diagnostic)
    dismissed_skills?: string[]; // suggestions de compétences refusées : on ne les repropose pas
  };
  rules: string[];
  todo: string[];
};

export const STATUSES = [
  { id: "a_postuler", label: "À postuler", color: "bg-slate-400" },
  { id: "postule", label: "Postulé", color: "bg-sky-500" },
  { id: "relance", label: "Relancé", color: "bg-indigo-500" },
  { id: "entretien", label: "Entretien", color: "bg-amber-500" },
  { id: "test", label: "Test / Cas", color: "bg-orange-500" },
  { id: "offre", label: "Offre", color: "bg-emerald-500" },
  { id: "refuse", label: "Refusé", color: "bg-rose-500" },
  { id: "abandonne", label: "Abandonné", color: "bg-zinc-400" },
  { id: "expiree", label: "Offre plus disponible", color: "bg-stone-400" },
] as const;
export type StatusId = (typeof STATUSES)[number]["id"];
// Anciennes saisies : « expire » (sans e final) est lu comme « Offre plus disponible »
const STATUS_ALIAS: Record<string, string> = { expire: "expiree", expiré: "expiree", expiree: "expiree" };
export const statusLabel = (id: string) => {
  const k = STATUS_ALIAS[id] ?? id;
  return STATUSES.find((s) => s.id === k)?.label ?? id;
};
/** Offre écartée ou plus disponible sans jamais avoir postulé : ce n'est pas une candidature, elle n'entre dans aucune statistique. */
export const isNeverSent = (a: { status: string; applied_at?: string | null }) =>
  ["abandonne", "expiree"].includes(STATUS_ALIAS[a.status] ?? a.status) && !a.applied_at;

export const CHANNELS = [
  "LinkedIn",
  "Indeed",
  "France Travail",
  "Welcome to the Jungle",
  "APEC",
  "HelloWork",
  "Meteojob",
  "Site entreprise",
  "Candidature spontanée",
  "Cooptation / réseau",
  "Cabinet / ESN",
  "Malt / freelance",
  "Autre",
];

export type Application = {
  id: string;
  offer_id: string | null;
  company: string;
  title: string;
  url: string | null;
  location: string | null;
  contract: string | null;
  status: StatusId;
  channel: string | null;
  cv_variant: string | null;
  score: number | null;
  applied_at: string | null;
  next_action_at: string | null;
  interview_at?: string | null;
  contact: string | null;
  salary: string | null;
  notes: string | null;
  last_email_at: string | null;
  created_at: string;
  updated_at: string;
};

export type OfferExtract = {
  title: string;
  company: string;
  location: string;
  contract: string;
  remote: string;
  seniority: string;
  salary: string;
  domain: string;
  company_context: string;
  missions: string[];
  must_have: string[];
  nice_to_have: string[];
  soft_skills: string[];
  keywords: string[];
  red_flags: string[];
};

export type ScoreBlock = { score: number; comment: string };
export const TEMPLATES = [
  { id: "classique", label: "Classique", for: "Banque, finance, assurance, secteur public, grands groupes industriels" },
  { id: "moderne", label: "Moderne", for: "Startups, scale-ups, tech, marketing, médias" },
  { id: "esn", label: "ESN / Conseil", for: "ESN, cabinets de conseil, portage : format dossier de compétences" },
  { id: "compact", label: "Compact ATS", for: "Grosses plateformes RH, offres très filtrées, candidatures en ligne" },
  { id: "colonnes", label: "Deux colonnes", for: "PME, industrie, commerce, logistique : compétences et langues dans une colonne latérale" },
  { id: "timeline", label: "Chronologique", for: "Parcours long, reconversion, missions : les dates en marge se lisent d'un coup d'œil" },
  { id: "elegant", label: "Élégant", for: "Luxe, mode, communication, culture, cabinets : sobre, avec une touche de serif" },
  { id: "bandeau", label: "Bandeau couleur", for: "Marketing, e-commerce, design, médias : en-tête coloré, compétences en pastilles" },
] as const;
export type TemplateId = (typeof TEMPLATES)[number]["id"];
/** Deux modèles n'existent que pour les lettres (voir lib/letter.ts) ; les autres noms sont ceux des modèles de CV. */
const LETTER_ONLY: Record<string, string> = { sobre: "Sobre", colonne: "Colonne" };
export const templateLabel = (id?: string | null) => TEMPLATES.find((t) => t.id === id)?.label ?? LETTER_ONLY[id ?? ""] ?? id ?? "";

/** Compétence que la personne a probablement sans l'avoir écrite : elle doit la confirmer avant qu'elle entre dans son profil. */
export type SkillSuggestion = {
  skill: string;
  category: string;   // catégorie de compétences du profil où la ranger
  evidence: string;   // l'élément exact du profil qui rend cette compétence plausible
  confidence: "forte" | "moyenne";
};

export type OfferAnalysis = {
  score: number;
  verdict: string;
  recommended_variant: string;
  company_type: string;
  recommended_template: TemplateId;
  template_reason: string;
  breakdown: {
    hard_skills: ScoreBlock;
    experience: ScoreBlock;
    domain: ScoreBlock;
    education: ScoreBlock;
    soft_skills: ScoreBlock;
    logistics: ScoreBlock;
  };
  matched_keywords: string[];
  missing_keywords: string[];
  strengths: string[];
  gaps: { gap: string; how_to_address: string }[];
  should_apply: "oui" | "oui_avec_effort" | "non";
  questions_to_expect: string[];
  skill_suggestions?: SkillSuggestion[]; // mots-clés manquants que le profil rend plausibles, à confirmer
};

export type CvDoc = {
  headline: string;
  summary: string;
  experiences: { company: string; role: string; location?: string; dates: string; bullets: string[] }[];
  education: { degree: string; school: string; dates: string }[];
  skills: { label: string; items: string }[];
  projects: { name: string; description: string; link?: string }[];
  /** Liens choisis pour CE CV (LinkedIn, portfolio, GitHub, puis ceux qui servent l'offre). Absent sur les anciens CV. */
  links?: { label: string; url: string }[];
  certifications: string[];
  languages: string;
  extras?: string;
  ats_keywords_used: string[];
  notes_for_candidate: string[];
};

/**
 * Lettre de motivation. Les lettres récentes sont découpées en parties (salutation, paragraphes, formule, destinataire, date) pour être mises en page
 * par un modèle ; `body` en garde le texte complet. Les anciennes lettres n'ont que `body` : voir lib/letter.ts.
 */
export type LetterDoc = {
  subject: string;
  body: string;
  notes_for_candidate: string[];
  greeting?: string;
  paragraphs?: string[];
  signoff?: string;
  recipient?: string;
  /** Date de la lettre : AAAA-MM-JJ, ou un texte libre si la personne l'a réécrite. */
  date?: string;
  /** Titre affiché sous le nom, le même que sur le CV de la même offre. */
  headline?: string;
};
export type PrepDoc = {
  pitch_60s: string;
  likely_questions: { question: string; angle: string }[];
  questions_to_ask: string[];
  company_research_todo: string[];
};

export const REJECT_REASONS = [
  { id: "trop_senior", label: "Trop senior" },
  { id: "metier", label: "Pas mon métier" },
  { id: "lieu", label: "Lieu / trajet" },
  { id: "salaire", label: "Salaire" },
  { id: "contrat", label: "Type de contrat" },
  { id: "secteur", label: "Secteur" },
  { id: "entreprise", label: "Cette entreprise" },
  { id: "doublon", label: "Déjà vue" },
  { id: "expiree", label: "Offre plus disponible" },
  { id: "autre", label: "Autre" },
] as const;
/** Raisons qui ne disent rien de tes goûts (annonce retirée, tri en lot) : l'app n'en tire aucune règle. */
export const NEUTRAL_REASONS: readonly string[] = ["score_bas", "expiree"];
// « score_bas » vient du tri en lot : pas proposé comme choix, mais affiché dans les stats
export const rejectLabel = (id?: string | null) =>
  id === "score_bas" ? "Score trop bas" : REJECT_REASONS.find((r) => r.id === id)?.label ?? id ?? "";

/* ---------- Questionnaire d'accueil et diagnostic ---------- */

/** Zone de recherche : tout le pays, des départements ou des villes (une ville se cherche dans son département). */
export type SearchZone = {
  scope: "france" | "departement" | "ville";
  departments: { code: string; name: string }[];
  cities: { name: string; dept: string; deptName?: string }[];
};

export type OnboardingAnswers = {
  target_roles: string[];      // métiers visés (liste ou saisie libre)
  contracts: string[];         // CDI, CDD, Freelance, Alternance, Stage, Intérim
  zone: SearchZone | null;     // où chercher
  location: string;            // villes visées, en clair (déduit de la zone)
  mobility: string;            // zone en clair (déduit de la zone)
  remote: string[];            // Présentiel, Hybride, Full remote ; vide = peu importe
  experience_years: string[];  // tranches d'expérience, plusieurs possibles
  availability: string;        // Immédiate, Sous 1 mois, Sous 3 mois
  salary: string;              // prétentions, libre
  search_since: string;        // depuis combien de temps
  applications_per_week: string;
  responses: string;           // Aucune réponse, Refus sans entretien, Entretiens sans offre, Ça avance
  blockers: string;            // ce qui coince selon la personne
  sectors: string[];
};

export type Diagnostic = {
  overall_score: number;               // 0-100 : qualité du CV pour les cibles visées
  verdict: string;                     // 3-4 phrases franches
  positioning: { recommended_targets: { title: string; why: string }[]; comment: string };
  strengths: string[];
  issues: { issue: string; severity: "bloquant" | "important" | "mineur"; fix: string }[];
  inconsistencies: string[];
  missing_metrics: string[];
  ats: { ok: string[]; problems: string[] };
  search_strategy: string;             // lecture des réponses au questionnaire : où ça bloque
  actions: { action: string; why: string; priority: "haute" | "moyenne" | "basse" }[];
  changes_since_last?: string[];       // pour un CV redéposé : ce qui a changé / progressé
};

/** Nom lisible d'une variante de CV (ex : data_bi → « CV Data BI »). */
export function variantLabel(v: string | null | undefined) {
  if (!v) return "";
  if (v === "data_bi") return "CV Data BI";
  if (v === "ba_amoa") return "CV BA / AMOA";
  const t = v.replace(/_/g, " ").trim();
  return `CV ${t.charAt(0).toUpperCase()}${t.slice(1)}`; // ex : data_analyst → « CV Data analyst »
}
