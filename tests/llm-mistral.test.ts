// Chaîne d'IA : modèle Mistral refusé par l'offre gratuite, messages clairs quand plus aucune IA ne répond. Fetch scripté, aucune vraie IA.
import { ok, done } from "./helpers";

const env = process.env as Record<string, string | undefined>;
type R = { status: number; json?: unknown; headers?: Record<string, string> };
const calls: { who: string; body: Record<string, unknown> }[] = [];
const q: Record<string, R[]> = { gemini: [], groq: [], mistral: [] };
const who = (url: string) => (url.includes("generativelanguage") ? "gemini" : url.includes("groq") ? "groq" : "mistral");
(globalThis as unknown as { fetch: unknown }).fetch = async (url: string, init: { body: string }) => {
  const w = who(url);
  calls.push({ who: w, body: JSON.parse(init.body) });
  const r = q[w].shift();
  if (!r) throw new Error("plus de réponse scriptée pour " + w);
  const h = r.headers ?? {};
  return { ok: r.status < 300, status: r.status, headers: { get: (k: string) => h[k.toLowerCase()] ?? null }, json: async () => r.json ?? {}, text: async () => (r.json ? JSON.stringify(r.json) : "") };
};
const cOk = (o: unknown): R => ({ status: 200, json: { choices: [{ message: { content: JSON.stringify(o) }, finish_reason: "stop" }] } });
const tier403: R = { status: 403, json: { object: "error", message: "This model is not available in your subscription tier", type: "invalid_model", code: "1" } };

env.MISTRAL_API_KEY = "m"; env.GROQ_API_KEY = "q"; delete env.GEMINI_API_KEY; delete env.ANTHROPIC_API_KEY; delete env.AI_PROVIDER;
env.GROQ_API_BASE = "http://groq.test/openai/v1"; env.MISTRAL_API_BASE = "http://mistral.test/v1";
const { structured, str } = await import("../lib/llm");
const schema = { properties: { a: str() }, required: ["a"] };
const run = async (opts: Record<string, unknown> = {}) => { try { return { v: await structured<{ a: string }>({ system: "s", prompt: "p", schema, ...opts }) }; } catch (e) { return { e: e as Error & { status?: number } }; } };
const seq = () => calls.map((c) => c.who).join(">");
const reset = () => { calls.length = 0; for (const k of Object.keys(q)) q[k] = []; };

// 1. 403 « modèle non inclus » : la clé est bonne, on passe au modèle suivant de Mistral (pas au fournisseur suivant)
env.AI_MAIN_CHAIN = "mistral,groq";
reset(); q.mistral = [tier403, cOk({ a: "medium" })];
let r = await run({});
ok("403 modèle non inclus → même fournisseur, modèle de repli", r.v?.a === "medium" && seq() === "mistral>mistral" && calls[0].body.model === "mistral-large-2512" && calls[1].body.model === "mistral-medium-latest", `${seq()} ${calls.map((c) => c.body.model).join(" → ")}`);
reset(); q.mistral = [cOk({ a: "direct" })];
r = await run({});
ok("le modèle refusé n'est plus réessayé ensuite", r.v?.a === "direct" && calls.length === 1 && calls[0].body.model === "mistral-medium-latest", calls.map((c) => c.body.model).join());

// 2. Tous les modèles de repli refusés → Groq prend la main
reset(); q.mistral = [tier403, tier403]; q.groq = [cOk({ a: "groq" })];
r = await run({});
ok("tous les modèles Mistral refusés → fournisseur suivant", r.v?.a === "groq" && seq() === "mistral>mistral>groq", seq());

// 3. Message final : dit pourquoi chaque IA n'a pas répondu
env.AI_MAIN_CHAIN = "mistral,groq";
reset(); q.mistral = [{ status: 403, json: { message: "Forbidden" } }]; q.groq = [{ status: 429, json: { error: { message: "rate limit" } }, headers: { "retry-after": "60" } }];
r = await run({});
ok("tout indisponible → message qui nomme chaque IA", r.e?.status === 503 && /Mistral AI \(clé ou modèle refusé\)/.test(r.e.message) && /Groq \(limite atteinte\)/.test(r.e.message), r.e?.message);

// 4. Une vraie clé invalide (401) reste annoncée comme telle
env.AI_MAIN_CHAIN = "mistral";
reset(); q.mistral = [{ status: 401, json: { message: "Unauthorized" } }];
r = await run({});
ok("401 → clé invalide (pas de changement de modèle)", /Clé Mistral invalide/.test(r.e?.message ?? "") && calls.length === 1, r.e?.message);
done();
