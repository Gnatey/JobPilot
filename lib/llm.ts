import type Anthropic from "@anthropic-ai/sdk";
import { HttpError } from "./supabase/server";
import { timeLeft } from "./budget";

/**
 * Couche IA : plusieurs fournisseurs, avec répartition des tâches et bascule automatique.
 *  - Gemini (Google AI Studio), Groq et Mistral : gratuits. Claude : payant.
 *  - Deux familles de tâches : « fast » (tri d'emails, extraction : beaucoup de volume) et « main » (analyse, rédaction de CV).
 *    Chaque famille a sa chaîne de fournisseurs : le premier qui répond gagne ; s'il est saturé, a atteint sa limite ou échoue, on passe au suivant.
 *  - Seuls les fournisseurs dont la clé est présente comptent : avec la seule clé Gemini, rien ne change.
 *  - AI_PROVIDER=gemini|groq|mistral|anthropic impose un fournisseur unique ; AI_FAST_CHAIN / AI_MAIN_CHAIN (ex. « groq,mistral,gemini ») fixent l'ordre.
 */
export type ProviderId = "gemini" | "groq" | "mistral" | "anthropic";

const KEYS: Record<ProviderId, string> = { gemini: "GEMINI_API_KEY", groq: "GROQ_API_KEY", mistral: "MISTRAL_API_KEY", anthropic: "ANTHROPIC_API_KEY" };
export const PROVIDER_NAMES: Record<ProviderId, string> = { gemini: "Google (Gemini)", groq: "Groq", mistral: "Mistral AI", anthropic: "Anthropic (Claude)" };

/** Tri d'emails et extraction d'abord sur Groq (rapide, gros volume) ; analyse et rédaction d'abord sur Gemini. Chacun est le secours de l'autre. */
const DEFAULT_CHAIN: Record<"fast" | "main", ProviderId[]> = {
  fast: ["groq", "mistral", "gemini", "anthropic"],
  main: ["gemini", "mistral", "groq", "anthropic"],
};

const isProvider = (s: string): s is ProviderId => s in KEYS;
const configured = (id: ProviderId) => Boolean(process.env[KEYS[id]]);

/** Fournisseurs à essayer, dans l'ordre, pour cette famille de tâches (seuls ceux dont la clé est présente). */
export function chainFor(fast: boolean): ProviderId[] {
  const forced = process.env.AI_PROVIDER?.toLowerCase().trim();
  if (forced && isProvider(forced)) return configured(forced) ? [forced] : [];
  const custom = (process.env[fast ? "AI_FAST_CHAIN" : "AI_MAIN_CHAIN"] ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(isProvider);
  return [...new Set(custom.length ? custom : DEFAULT_CHAIN[fast ? "fast" : "main"])].filter(configured);
}

/** Tous les fournisseurs réellement utilisés (pour Réglages, la page confidentialité et le test). */
export const activeProviders = (): ProviderId[] => [...new Set([...chainFor(false), ...chainFor(true)])];

export const provider = (): ProviderId => chainFor(false)[0] ?? chainFor(true)[0] ?? "gemini";

const MODELS = {
  gemini: {
    main: () => process.env.GEMINI_MODEL || "gemini-3.8-flash",
    fast: () => process.env.GEMINI_FAST_MODEL || "gemini-3.5-flash-lite",
  },
  anthropic: {
    main: () => process.env.CLAUDE_MODEL || "claude-sonnet-5-5",
    fast: () => process.env.CLAUDE_FAST_MODEL || "claude-haiku-5-5",
  },
  groq: {
    main: () => process.env.GROQ_MODEL || "openai/gpt-oss-120b",
    fast: () => process.env.GROQ_FAST_MODEL || "openai/gpt-oss-20b",
  },
  mistral: {
    main: () => process.env.MISTRAL_MODEL || "mistral-large-latest",
    fast: () => process.env.MISTRAL_FAST_MODEL || "mistral-small-latest",
  },
};
const modelOf = (id: ProviderId, fast: boolean) => (fast ? MODELS[id].fast() : MODELS[id].main());

/** Quels fournisseurs et quels modèles sont utilisés (affiché dans Réglages). */
export function modelInfo() {
  const fast = chainFor(true), main = chainFor(false);
  const describe = (ids: ProviderId[], isFast: boolean) => ids.map((id) => ({ id, name: PROVIDER_NAMES[id], model: modelOf(id, isFast) }));
  const first = provider();
  return { provider: first, main: modelOf(first, false), fast: modelOf(first, true), configured: main.length > 0 || fast.length > 0, chains: { fast: describe(fast, true), main: describe(main, false) } };
}

type Opts = {
  system: string;
  prompt: string;
  schema: Record<string, unknown>;
  name?: string;
  fast?: boolean; // tâches simples : extraction, tri d'emails
  maxTokens?: number;
  /** Budget de réflexion du modèle, en tokens (1024 par défaut) ; null = réglage du modèle */
  thinking?: number | null;
  /** Travail en arrière-plan (personne n'attend devant l'écran) : délais plus larges avant d'abandonner */
  patient?: boolean;
  /** Interne : un autre fournisseur peut prendre le relais, donc inutile d'insister sur celui-ci quand il est saturé */
  failover?: boolean;
};

/** Erreur « saturé / limite atteinte » d'un fournisseur, avec le délai d'attente qu'il indique (en secondes). */
class Busy extends HttpError {
  constructor(status: number, message: string, public retryAfter?: number, public detail?: string) {
    super(status, message);
  }
}
/** Message du fournisseur, raccourci et sans identifiant d'organisation : pour le test des clés et les journaux, jamais pour l'écran des utilisateurs. */
const clean = (s: string) => s.replace(/org_\w+/g, "org_…").replace(/\s+/g, " ").slice(0, 220);

const BUSY_ALL = "Toutes les IA configurées sont saturées ou ont atteint leur limite du jour. Réessaie dans quelques minutes : rien n'est perdu.";
const call = <T>(id: ProviderId, o: Opts): Promise<T> => (id === "gemini" ? gemini<T>(o) : id === "anthropic" ? claude<T>(o) : compat<T>(id, o));

/**
 * Fournisseurs qui viennent de répondre « saturé » (429) : on les met en pause quelques minutes et on les essaie en dernier,
 * pour ne pas perdre une demi-seconde à chaque appel sur un quota déjà épuisé. Mémoire de l'instance seulement : c'est une aide, pas une garantie.
 */
const cooldown = new Map<ProviderId, number>();
const COOL_MAX_MS = 10 * 60_000;
const coolDown = (id: ProviderId, ms: number) => cooldown.set(id, Date.now() + Math.min(Math.max(ms, 15_000), COOL_MAX_MS));
const cooling = (id: ProviderId) => (cooldown.get(id) ?? 0) > Date.now();

/** Appelle l'IA et renvoie un objet JSON conforme au schéma, en essayant les fournisseurs de la chaîne dans l'ordre. */
export async function structured<T>(opts: Opts): Promise<T> {
  const all = chainFor(Boolean(opts.fast));
  if (!all.length) throw new HttpError(500, "Aucune clé IA : ajoute GEMINI_API_KEY (gratuit) dans Vercel. GROQ_API_KEY et MISTRAL_API_KEY (gratuits aussi) répartissent la charge.");
  const chain = [...all.filter((id) => !cooling(id)), ...all.filter(cooling)];
  let busy = 0;
  for (let i = 0; i < chain.length; i++) {
    const rest = chain.length - i - 1;
    try {
      return await call<T>(chain[i], { ...opts, failover: rest > 0 });
    } catch (e) {
      const status = e instanceof HttpError ? e.status : (e as { status?: number })?.status;
      if (status === 429) coolDown(chain[i], e instanceof Busy && e.retryAfter ? e.retryAfter * 1000 : 60_000);
      if (status && [429, 503, 504].includes(status)) busy++;
      // Dernier fournisseur, ou plus assez de temps pour en essayer un autre : l'erreur remonte
      if (!rest || timeLeft() < 9_000) {
        if (chain.length > 1 && busy === i + 1 && !(e instanceof HttpError && e.status === 504)) throw new HttpError(503, BUSY_ALL);
        throw e;
      }
      console.warn(`[ia] ${chain[i]} n'a pas pu répondre (${e instanceof Error ? e.message : e}${e instanceof Busy && e.detail ? ` | ${e.detail}` : ""}) : bascule sur ${chain[i + 1]}`);
    }
  }
  throw new HttpError(503, BUSY_ALL);
}

/** Interroge chaque fournisseur configuré, un par un (bouton « Tester l'IA » de Réglages). */
export async function pingProviders() {
  return Promise.all(activeProviders().map(async (id) => {
    const t0 = Date.now();
    try {
      await call<{ ok: boolean }>(id, { fast: true, maxTokens: 50, system: "Réponds ok=true.", prompt: "ping", schema: { properties: { ok: { type: "boolean" } }, required: ["ok"] } });
      return { id, name: PROVIDER_NAMES[id], model: modelOf(id, true), ok: true as const, ms: Date.now() - t0 };
    } catch (e) {
      const detail = e instanceof Busy && e.detail ? ` Réponse du fournisseur : « ${e.detail} »` : "";
      return { id, name: PROVIDER_NAMES[id], model: modelOf(id, true), ok: false as const, ms: Date.now() - t0, error: (e instanceof Error ? e.message : String(e)) + detail };
    }
  }));
}

/* ---------------- Gemini ---------------- */

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  error?: { code: number; message: string; status: string };
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const BUSY_MSG = "L'IA de Google est saturée en ce moment (ça passe en général en quelques minutes). Réessaie dans un instant : rien n'est perdu.";
const TIME_MSG = "L'IA a été trop lente pour finir dans le temps imparti. Relance dans un instant : rien n'est perdu.";

type GState = {
  attempt?: number;        // réponses illisibles déjà rencontrées
  forceFast?: boolean;     // bascule sur le modèle léger
  busy?: number;           // échecs de saturation (503 et co) sur le modèle en cours
  t0?: number;             // début de l'appel, pour ne pas dépasser le temps imparti
  /** Niveau de simplification de la demande quand Gemini la refuse (400) :
   *  0 = comme demandé · 1 = réflexion à 1024 · 2 = sans réglage de réflexion · 3 = + schéma dans la consigne seulement · 4 = + réponse plafonnée */
  relax?: number;
  grow?: number;           // coefficient de place donnée à la réponse après une réponse coupée (MAX_TOKENS)
  lowThink?: boolean;      // réflexion réduite : elle consomme la même place que la réponse
};

const MAX_RELAX = 4;

async function gemini<T>(opts: Opts, st: GState = {}): Promise<T> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new HttpError(500, "GEMINI_API_KEY manquante dans les variables d'environnement");
  const { attempt = 0, busy = 0, t0 = Date.now() } = st;
  const relax = st.relax ?? 0;
  const useFast = opts.fast || st.forceFast;
  const model = useFast ? MODELS.gemini.fast() : MODELS.gemini.main();
  const schema = { type: "object", ...opts.schema };
  const again = (patch: GState) => gemini<T>(opts, { ...st, t0, ...patch });
  // Temps imparti par la route (voir lib/budget.ts) : on ne démarre pas un appel qui ne pourrait pas finir
  if (timeLeft() < 7_000) throw new HttpError(504, TIME_MSG);

  // Saturation (503, 500…) ou délai dépassé : on patiente un peu, puis on bascule sur le modèle léger, souvent moins chargé
  const overloaded = async (): Promise<T> => {
    if (opts.failover) throw new Busy(503, BUSY_MSG); // un autre fournisseur prend le relais : inutile d'insister ici
    if (timeLeft() < 15_000) throw new HttpError(504, TIME_MSG);
    if (Date.now() - t0 > (opts.patient ? 130_000 : 50_000)) throw new HttpError(503, BUSY_MSG); // plus assez de temps devant nous
    if (busy < 2) {
      await sleep(1500 * (busy + 1));
      return again({ busy: busy + 1 });
    }
    if (!useFast) return again({ forceFast: true, busy: 0 });
    throw new HttpError(503, BUSY_MSG);
  };

  // Réflexion interne bornée : c'est elle qui rendait l'analyse d'un CV si longue. Un modèle qui refuse ce réglage est réessayé en le simplifiant (voir `relax`).
  const asked = opts.thinking ?? 1024;
  const thinking = opts.thinking === null || relax >= 2 ? {} : { thinkingConfig: { thinkingBudget: st.lowThink ? 512 : relax === 1 ? 1024 : asked } };
  const room = Math.max(opts.maxTokens ?? 4000, 4000) * 2 + 2048; // réponse + marge pour la réflexion
  const maxOutputTokens = relax >= 4 ? 8192 : Math.min(32_768, Math.round(room * (st.grow ?? 1)));

  // Délai de l'appel : celui du mode, borné par le temps qui reste. Le modèle principal n'a droit qu'à une part du temps restant,
  // pour qu'il en reste assez au modèle léger s'il faut basculer.
  const base = opts.patient ? (useFast ? 60_000 : 100_000) : useFast ? 40_000 : 50_000;
  const left = timeLeft();
  const timeout = Math.min(base, useFast ? left - 2_000 : Math.min(left - 2_000, Math.max(12_000, left * 0.75)));

  let res: Response;
  try {
    res = await fetch(`${process.env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com"}/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: `${opts.system}\n\nRéponds UNIQUEMENT par un objet JSON valide, conforme à ce schéma JSON :\n${JSON.stringify(schema)}` }],
        },
        contents: [{ role: "user", parts: [{ text: opts.prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          ...(relax >= 3 ? {} : { responseJsonSchema: schema }),
          maxOutputTokens,
          temperature: 0.4,
          ...thinking,
        },
      }),
      signal: AbortSignal.timeout(timeout),
    });
  } catch {
    // Délai dépassé avec un temps imparti serré : inutile de réessayer le même modèle, on passe au modèle léger
    if (!useFast && Number.isFinite(left) && !opts.failover) {
      if (timeLeft() < 15_000) throw new HttpError(504, TIME_MSG);
      return again({ forceFast: true, busy: 0 });
    }
    return overloaded(); // délai dépassé ou coupure réseau
  }
  const json = (await res.json().catch(() => ({}))) as GeminiResponse;

  if (!res.ok) {
    const msg = json.error?.message ?? `HTTP ${res.status}`;
    // Demande refusée (400) : on la simplifie pas à pas jusqu'à ce que le modèle l'accepte.
    // Un message qui nomme le réglage fautif permet de sauter directement au bon niveau.
    if (res.status === 400 && !/API key/i.test(msg) && relax < MAX_RELAX) {
      const target = /thinking/i.test(msg) ? 2 : /schema|responseJsonSchema|Unknown name/i.test(msg) ? 3 : relax + 1;
      let next = Math.max(target, relax + 1);
      if (next === 1 && asked === 1024) next = 2; // rien à changer au niveau 1 : on passe au suivant
      return again({ relax: Math.min(next, MAX_RELAX) });
    }
    // Quota du modèle principal épuisé : on bascule sur le modèle léger
    if (res.status === 429 && !useFast && !opts.failover) return again({ forceFast: true, busy: 0 });
    if (res.status === 429) throw new Busy(429, "Quota gratuit Gemini atteint pour aujourd'hui. Il se remet à zéro vers 9 h (heure de Paris).", Number(res.headers?.get?.("retry-after")) || undefined);
    if (res.status === 400 && /API key/i.test(msg)) throw new HttpError(500, "Clé Gemini invalide : vérifie GEMINI_API_KEY dans Vercel.");
    if (res.status >= 500 || json.error?.status === "UNAVAILABLE" || /high demand|overloaded/i.test(msg)) return overloaded();
    throw new Error(`Gemini (${model}, niveau ${relax}) : ${msg}`);
  }

  const text = (json.candidates?.[0]?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? "").join("").trim();
  try {
    return JSON.parse(text.replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim()) as T;
  } catch {
    const reason = json.candidates?.[0]?.finishReason;
    // Réponse coupée (MAX_TOKENS) : on la redemande avec plus de place et moins de réflexion. Autre cause : une seule nouvelle tentative.
    const cut = reason === "MAX_TOKENS";
    const time = Date.now() - t0 < (opts.patient ? 200_000 : 90_000) && timeLeft() > 25_000;
    if (time && (attempt < 1 || (cut && attempt < 2))) return again({ attempt: attempt + 1, ...(cut ? { grow: (st.grow ?? 1) * 1.8, lowThink: true } : {}) });
    throw new Error(`Réponse illisible de Gemini${reason ? ` (${reason})` : ""}`);
  }
}

/* ---------------- Groq et Mistral (API « chat completions » compatible OpenAI) ---------------- */

const COMPAT = {
  groq: { url: () => `${process.env.GROQ_API_BASE || "https://api.groq.com/openai/v1"}/chat/completions`, env: "GROQ_API_KEY", label: "Groq" },
  mistral: { url: () => `${process.env.MISTRAL_API_BASE || "https://api.mistral.ai/v1"}/chat/completions`, env: "MISTRAL_API_KEY", label: "Mistral" },
} as const;

type CompatResponse = {
  choices?: { message?: { content?: string | { type?: string; text?: string }[] | null }; finish_reason?: string }[];
  error?: { message?: string; type?: string; code?: string | number } | string;
  /** Mistral met le message à la racine : { object: "error", message, type, code } */
  message?: string;
  type?: string;
};

type CState = {
  relax?: number; // 0 = schéma JSON demandé au fournisseur · 1 = « objet JSON » + schéma dans la consigne · 2 = en plus sans réglage de réflexion
  grow?: number;  // place supplémentaire après une réponse coupée
  attempt?: number;
};

/** Les clés « required » du schéma doivent toutes être présentes : sinon la réponse est écartée et le fournisseur suivant prend le relais. */
function checkShape(value: unknown, schema: Record<string, unknown>) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Réponse inattendue (pas un objet JSON)");
  const required = Array.isArray(schema.required) ? (schema.required as string[]) : [];
  const missing = required.filter((k) => !(k in (value as Record<string, unknown>)));
  if (missing.length) throw new Error(`Réponse incomplète (manque : ${missing.join(", ")})`);
}

async function compat<T>(id: "groq" | "mistral", opts: Opts, st: CState = {}): Promise<T> {
  const cfg = COMPAT[id];
  const key = process.env[cfg.env];
  if (!key) throw new HttpError(500, `${cfg.env} manquante dans les variables d'environnement`);
  const relax = st.relax ?? 0;
  const model = modelOf(id, Boolean(opts.fast));
  const schema = { type: "object", ...opts.schema };
  const again = (patch: CState) => compat<T>(id, opts, { ...st, ...patch });
  const left = timeLeft();
  if (left < 7_000) throw new HttpError(504, TIME_MSG);
  // Pas de réflexion interne « maximale » sur ces modèles : plus rapide, et la place de réponse reste raisonnable pour les plafonds de débit du palier gratuit
  const maxTokens = Math.min(16_000, Math.round(((opts.maxTokens ?? 4000) + 1500) * (st.grow ?? 1)));
  const reasoning = id === "groq" && model.startsWith("openai/gpt-oss") && relax < 2 ? { reasoning_effort: (opts.thinking ?? 1024) <= 512 || opts.fast ? "low" : "medium" } : {};
  const base = opts.patient ? 70_000 : opts.fast ? 25_000 : 40_000;
  const timeout = Math.max(5_000, Math.min(base, left - 2_000));

  let res: Response;
  try {
    res = await fetch(cfg.url(), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: `${opts.system}\n\nRéponds UNIQUEMENT par un objet JSON valide, conforme à ce schéma JSON :\n${JSON.stringify(schema)}` },
          { role: "user", content: opts.prompt },
        ],
        response_format: relax === 0 ? { type: "json_schema", json_schema: { name: (opts.name ?? "respond").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60), schema, strict: false } } : { type: "json_object" },
        [id === "groq" ? "max_completion_tokens" : "max_tokens"]: maxTokens,
        temperature: 0.4,
        ...reasoning,
      }),
      signal: AbortSignal.timeout(timeout),
    });
  } catch {
    throw new Busy(503, `${cfg.label} n'a pas répondu à temps.`); // délai dépassé ou coupure réseau
  }
  // Corps lu en texte : si ce n'est pas du JSON (page d'erreur d'un proxy, par exemple), on garde le début pour comprendre
  const raw = await res.text().catch(() => "");
  let json: CompatResponse = {};
  try { json = raw ? (JSON.parse(raw) as CompatResponse) : {}; } catch { /* corps non JSON */ }

  if (!res.ok) {
    const fromBody = typeof json.error === "string" ? json.error : (json.error?.message ?? json.message ?? (json.type ? String(json.type) : ""));
    const msg = fromBody || (raw && !raw.trim().startsWith("{") ? raw.trim() : "") || `HTTP ${res.status} (corps vide)`;
    // Demande refusée (400/422) : on la simplifie (schéma JSON → « objet JSON » → sans réglage de réflexion)
    if ((res.status === 400 || res.status === 422) && relax < 2) return again({ relax: relax + 1 });
    if (res.status === 401 || res.status === 403) throw new HttpError(500, `Clé ${cfg.label} invalide : vérifie ${cfg.env} dans Vercel.`);
    if (res.status === 429) {
      const wait = Number(res.headers?.get?.("retry-after")) || undefined;
      // Dernier recours (aucun autre fournisseur) et attente courte : on patiente une fois
      if (!opts.failover && wait && wait <= 6 && timeLeft() > wait * 1000 + 15_000 && !st.attempt) {
        await sleep(wait * 1000);
        return again({ attempt: 1 });
      }
      throw new Busy(429, `${cfg.label} : limite gratuite atteinte pour le moment.`, wait, clean(`${msg}${wait ? ` (retry-after ${wait} s)` : ""}`));
    }
    if (res.status >= 500) throw new Busy(503, `${cfg.label} est saturé en ce moment.`, undefined, clean(`HTTP ${res.status} ${msg}`));
    // 413 (demande trop grosse pour le palier gratuit) et le reste : on passe au fournisseur suivant
    throw new Error(`${cfg.label} (${model}) : ${msg}`);
  }

  const choice = json.choices?.[0];
  const content = choice?.message?.content;
  const text = (Array.isArray(content) ? content.map((p) => p.text ?? "").join("") : (content ?? "")).trim();
  // Réponse coupée : on redemande une fois avec plus de place
  if (choice?.finish_reason === "length" && !st.grow && timeLeft() > 20_000) return again({ grow: 1.7 });
  try {
    const parsed = JSON.parse(text.replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim());
    checkShape(parsed, schema);
    return parsed as T;
  } catch (e) {
    if (!st.attempt && timeLeft() > 20_000) return again({ attempt: 1 });
    throw new Error(`Réponse inutilisable de ${cfg.label}${choice?.finish_reason ? ` (${choice.finish_reason})` : ""} : ${e instanceof Error ? e.message : e}`);
  }
}

/* ---------------- Claude ---------------- */

let client: Anthropic | null = null;

async function claude<T>(opts: Opts): Promise<T> {
  if (!process.env.ANTHROPIC_API_KEY) throw new HttpError(500, "Aucune clé IA : ajoute GEMINI_API_KEY (gratuit) ou ANTHROPIC_API_KEY dans Vercel.");
  // Chargé à la demande : inutile (et lent au démarrage) quand on utilise Gemini
  if (!client) client = new (await import("@anthropic-ai/sdk")).default();
  const name = opts.name ?? "respond";
  const res = await client.messages.create({
    model: opts.fast ? MODELS.anthropic.fast() : MODELS.anthropic.main(),
    max_tokens: opts.maxTokens ?? 4000,
    system: opts.system,
    tools: [{ name, description: "Renvoie le résultat structuré.", input_schema: { type: "object", ...opts.schema } as Anthropic.Tool.InputSchema }],
    tool_choice: { type: "tool", name },
    messages: [{ role: "user", content: opts.prompt }],
  });
  const block = res.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") throw new Error("Réponse de Claude inattendue");
  return block.input as T;
}

/* ---------------- Helpers de schéma JSON ---------------- */

export const str = (description?: string) => ({ type: "string", ...(description ? { description } : {}) });
export const int = (description?: string) => ({ type: "integer", ...(description ? { description } : {}) });
export const arr = (items: object, description?: string) => ({ type: "array", items, ...(description ? { description } : {}) });
export const obj = (properties: Record<string, object>, required = Object.keys(properties)) => ({
  type: "object",
  properties,
  required,
});
