/** Variables d'environnement : lesquelles sont indispensables, lesquelles activent une fonction. */
export const ENV_VARS: { name: string; required: boolean; role: string; alt?: string | string[] }[] = [
  { name: "NEXT_PUBLIC_SUPABASE_URL", required: true, role: "Base de données et connexion (Supabase > Project Settings > API > Project URL)" },
  { name: "NEXT_PUBLIC_SUPABASE_ANON_KEY", required: true, role: "Base de données et connexion (clé anon / publishable)" },
  { name: "GEMINI_API_KEY", required: true, alt: ["GROQ_API_KEY", "MISTRAL_API_KEY", "ANTHROPIC_API_KEY"], role: "IA : analyse des offres, CV, lettres. Gratuit sur aistudio.google.com (ou une clé Groq, Mistral ou Claude)" },
  { name: "GROQ_API_KEY", required: false, role: "IA de secours et tri des emails, gratuit sur console.groq.com : répartit la charge avec Gemini" },
  { name: "MISTRAL_API_KEY", required: false, role: "IA de secours, gratuit sur console.mistral.ai (désactive l'entraînement dans Privacy) : répartit la charge avec Gemini" },
  { name: "NEXT_PUBLIC_APP_URL", required: true, role: "Ton adresse Vercel, pour les redirections Gmail" },
  { name: "OWNER_EMAILS", required: false, role: "Ton adresse (plusieurs possibles, séparées par des virgules) : seule à voir l'installation, sans plafond d'IA" },
  { name: "SUPABASE_SERVICE_ROLE_KEY", required: false, role: "Tâche automatique du matin" },
  { name: "CRON_SECRET", required: false, role: "Protège la tâche automatique du matin" },
  { name: "GOOGLE_CLIENT_ID", required: false, role: "Connexion Gmail" },
  { name: "GOOGLE_CLIENT_SECRET", required: false, role: "Connexion Gmail" },
  { name: "ADZUNA_APP_ID", required: false, role: "Recherche automatique d'offres Adzuna (gratuit, clé immédiate)" },
  { name: "ADZUNA_APP_KEY", required: false, role: "Recherche automatique d'offres Adzuna" },
  { name: "JOOBLE_API_KEY", required: false, role: "Recherche automatique d'offres Jooble (gratuit, sur demande)" },
  { name: "AI_DAILY_BUDGET", required: false, role: "Actions IA par personne et par jour (60 par défaut)" },
];

// Les NEXT_PUBLIC_* sont figées au moment du build : il faut redéployer après les avoir ajoutées.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
export function supabaseConfigured() {
  try {
    const u = new URL(SUPABASE_URL);
    return u.protocol === "https:" && SUPABASE_ANON_KEY.trim().length > 20 && SUPABASE_ANON_KEY === SUPABASE_ANON_KEY.trim();
  } catch {
    return false;
  }
}
/** Valeurs de repli qui permettent au build de passer ; le middleware redirige vers /configuration. */
export const SAFE_SUPABASE_URL = supabaseConfigured() ? SUPABASE_URL : "https://configuration-manquante.invalid";
export const SAFE_SUPABASE_KEY = supabaseConfigured() ? SUPABASE_ANON_KEY : "configuration-manquante-configuration-manquante";
