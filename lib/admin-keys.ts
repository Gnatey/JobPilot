/**
 * Administration › Clés : l'état des variables d'environnement (logique pure, testée par tests/admin-keys.test.ts).
 * Règle d'or : une VALEUR n'est jamais renvoyée, sauf pour les réglages qui ne sont pas des secrets et qui sont listés dans `SHOWN`
 * (plafond d'IA, ordre des fournisseurs, adresse publique de l'app). Pour tout le reste, on dit seulement « présente » ou « absente »,
 * plus un défaut de forme (espace ou guillemets autour de la valeur, nombre illisible) sans jamais le citer.
 */

type Env = Record<string, string | undefined>;

export type KeyGroup = "Indispensables" | "IA" | "Tâche du matin et Gmail" | "Sources d'offres" | "Pages légales" | "Lecture des annonces";

export const KEY_GROUPS: readonly KeyGroup[] = ["Indispensables", "IA", "Tâche du matin et Gmail", "Sources d'offres", "Pages légales", "Lecture des annonces"];

type KeyDef = {
  name: string;
  group: KeyGroup;
  role: string;
  /** Sans elle, l'application ne démarre pas ou une fonction centrale manque. */
  required?: boolean;
  /** Réglage numérique : plus petit nombre accepté (sinon la valeur est « illisible »). */
  min?: number;
};

export const KEYS: readonly KeyDef[] = [
  { name: "NEXT_PUBLIC_SUPABASE_URL", group: "Indispensables", required: true, role: "Adresse de la base et de la connexion (Supabase › Project Settings › API)" },
  { name: "NEXT_PUBLIC_SUPABASE_ANON_KEY", group: "Indispensables", required: true, role: "Clé publique de la base (anon / publishable)" },
  { name: "NEXT_PUBLIC_APP_URL", group: "Indispensables", required: true, role: "Adresse du site, pour les retours de connexion Gmail" },
  { name: "OWNER_EMAILS", group: "Indispensables", role: "Adresses administratrices (séparées par des virgules) : seules à voir cette page, sans plafond d'IA" },

  { name: "GEMINI_API_KEY", group: "IA", role: "Gemini, gratuit (aistudio.google.com) : principal pour l'analyse et les CV" },
  { name: "GROQ_API_KEY", group: "IA", role: "Groq (console.groq.com) : tri rapide et secours ; palier payant possible" },
  { name: "MISTRAL_API_KEY", group: "IA", role: "Mistral, gratuit (console.mistral.ai) : secours ; son offre gratuite peut entraîner ses modèles" },
  { name: "ANTHROPIC_API_KEY", group: "IA", role: "Claude, payant (console.anthropic.com) : dernier recours de la chaîne" },
  { name: "AI_DAILY_BUDGET", group: "IA", min: 5, role: "Plafond d'actions IA par personne et par jour (5 ou plus ; une analyse vaut 2). Absent = aucun plafond" },
  { name: "AI_PROVIDER", group: "IA", role: "Impose un seul fournisseur (gemini, groq, mistral ou anthropic)" },
  { name: "AI_MAIN_CHAIN", group: "IA", role: "Ordre des fournisseurs pour l'analyse et les CV (ex. gemini,groq)" },
  { name: "AI_FAST_CHAIN", group: "IA", role: "Ordre des fournisseurs pour le tri rapide (ex. groq,gemini)" },

  { name: "SUPABASE_SERVICE_ROLE_KEY", group: "Tâche du matin et Gmail", role: "Clé de service : tâche du matin, comptes de cette page, chiffrement des accès Gmail" },
  { name: "CRON_SECRET", group: "Tâche du matin et Gmail", role: "Protège la tâche automatique du matin" },
  { name: "TOKEN_ENCRYPTION_KEY", group: "Tâche du matin et Gmail", role: "Clé qui chiffre les accès Gmail en base (facultative : sinon dérivée de la clé de service)" },
  { name: "GOOGLE_CLIENT_ID", group: "Tâche du matin et Gmail", role: "Connexion Gmail" },
  { name: "GOOGLE_CLIENT_SECRET", group: "Tâche du matin et Gmail", role: "Connexion Gmail" },

  { name: "ADZUNA_APP_ID", group: "Sources d'offres", role: "Adzuna (gratuit) : offres chaque matin" },
  { name: "ADZUNA_APP_KEY", group: "Sources d'offres", role: "Adzuna" },
  { name: "JOOBLE_API_KEY", group: "Sources d'offres", role: "Jooble (gratuit, sur demande) : une clé par pays" },

  { name: "PUBLISHER_NAME", group: "Pages légales", role: "Nom de l'éditeur, affiché dans les mentions légales" },
  { name: "PUBLISHER_EMAIL", group: "Pages légales", role: "Adresse de contact, affichée dans les mentions légales et la confidentialité" },

  { name: "JINA_READER", group: "Lecture des annonces", role: "« off » éteint le lecteur de secours (Jina) pour LinkedIn, Indeed, Glassdoor" },
  { name: "JINA_API_KEY", group: "Lecture des annonces", role: "Facultative : relève les limites du lecteur de secours" },
];

/** Réglages dont la valeur peut s'afficher : ni clé, ni secret, ni adresse de personne. */
export const SHOWN: ReadonlySet<string> = new Set(["AI_DAILY_BUDGET", "AI_PROVIDER", "AI_MAIN_CHAIN", "AI_FAST_CHAIN", "JINA_READER", "NEXT_PUBLIC_APP_URL"]);

export type KeyState = "ok" | "missing";
export type KeyRow = {
  name: string;
  group: KeyGroup;
  role: string;
  required: boolean;
  state: KeyState;
  /** Valeur d'un réglage non secret (voir `SHOWN`), sinon rien. */
  value?: string;
  /** Défaut de forme, sans citer la valeur. */
  problem?: string;
};

/** Une valeur collée avec des espaces ou des guillemets autour est la faute classique dans Vercel : la clé « existe » mais est refusée. */
export function formProblem(raw: string): string | undefined {
  if (raw !== raw.trim()) return "espace ou retour à la ligne au début ou à la fin";
  if (/^["'`]|["'`]$/.test(raw)) return "guillemets autour de la valeur";
  return undefined;
}

export function describeKeys(env: Env = process.env): KeyRow[] {
  return KEYS.map((k): KeyRow => {
    const raw = env[k.name];
    const present = typeof raw === "string" && raw.trim() !== "";
    const row: KeyRow = { name: k.name, group: k.group, role: k.role, required: Boolean(k.required), state: present ? "ok" : "missing" };
    if (!present) return row;
    const problem = formProblem(raw);
    if (problem) row.problem = problem;
    else if (k.min != null) {
      const n = Number(raw);
      if (!Number.isFinite(n)) row.problem = "ce n'est pas un nombre : aucun plafond ne sera posé";
      else if (n <= 0) row.problem = "0 ou négatif : aucun plafond ne sera posé";
      else if (n < k.min) row.problem = `trop petit : ${k.min} est le minimum, le plafond sera relevé à ${k.min}`;
    }
    if (SHOWN.has(k.name)) row.value = raw.trim().replace(/\s+/g, " ").slice(0, 80);
    return row;
  });
}

/** Pour l'en-tête de l'onglet : combien d'indispensables manquent, combien de défauts de forme. */
export function keysSummary(rows: readonly KeyRow[]): { missingRequired: number; problems: number; aiKeys: number } {
  return {
    missingRequired: rows.filter((r) => r.required && r.state === "missing").length,
    problems: rows.filter((r) => r.problem).length,
    aiKeys: rows.filter((r) => r.group === "IA" && /_API_KEY$/.test(r.name) && r.state === "ok").length,
  };
}

export const rowsOfGroup = (rows: readonly KeyRow[], group: KeyGroup): KeyRow[] => rows.filter((r) => r.group === group);
