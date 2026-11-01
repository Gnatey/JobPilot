import type Anthropic from "@anthropic-ai/sdk";
import { HttpError } from "./supabase/server";
import { timeLeft } from "./budget";

/**
 * Couche IA : Gemini (gratuit via Google AI Studio) ou Claude, au choix.
 * Choix automatique : Gemini si GEMINI_API_KEY est présente, sinon Claude.
 * Forcer avec AI_PROVIDER=gemini ou AI_PROVIDER=anthropic.
 */
export function provider(): "gemini" | "anthropic" {
  const p = process.env.AI_PROVIDER?.toLowerCase();
  if (p === "gemini" || p === "anthropic") return p;
  return process.env.GEMINI_API_KEY ? "gemini" : "anthropic";
}

const MODELS = {
  gemini: {
    main: () => process.env.GEMINI_MODEL || "gemini-3.8-flash",
    fast: () => process.env.GEMINI_FAST_MODEL || "gemini-3.5-flash-lite",
  },
  anthropic: {
    main: () => process.env.CLAUDE_MODEL || "claude-sonnet-5-5",
    fast: () => process.env.CLAUDE_FAST_MODEL || "claude-haiku-5-5",
  },
};

/** Quel fournisseur et quels modèles sont utilisés (affiché dans Réglages). */
export function modelInfo() {
  const p = provider();
  return { provider: p, main: MODELS[p].main(), fast: MODELS[p].fast(), configured: p === "gemini" ? Boolean(process.env.GEMINI_API_KEY) : Boolean(process.env.ANTHROPIC_API_KEY) };
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
};

/** Appelle le modèle et renvoie un objet JSON conforme au schéma. */
export async function structured<T>(opts: Opts): Promise<T> {
  return provider() === "gemini" ? gemini<T>(opts) : claude<T>(opts);
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
    if (!useFast && Number.isFinite(left)) {
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
    if (res.status === 429 && !useFast) return again({ forceFast: true, busy: 0 });
    if (res.status === 429) throw new HttpError(429, "Quota gratuit Gemini atteint pour aujourd'hui. Il se remet à zéro vers 9 h (heure de Paris).");
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
