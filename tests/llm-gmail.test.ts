// Contenu venu de Gmail : jamais envoyé à un fournisseur d'IA qui peut entraîner ses modèles avec l'offre gratuite (règle « Limited Use » de Google).
// Fetch scripté, aucune vraie IA.
import { ok, done } from "./helpers";

const env = process.env as Record<string, string | undefined>;
const calls: { who: string; prompt: string }[] = [];
const q: Record<string, unknown[]> = { gemini: [], groq: [], mistral: [] };
const who = (url: string) => (url.includes("generativelanguage") ? "gemini" : url.includes("groq") ? "groq" : "mistral");
(globalThis as unknown as { fetch: unknown }).fetch = async (url: string, init: { body: string }) => {
  const w = who(url);
  calls.push({ who: w, prompt: init.body });
  const next = q[w].shift() as { status: number; body?: unknown } | undefined;
  if (!next) throw new Error("plus de réponse scriptée pour " + w);
  const body = next.body ?? {};
  return { ok: next.status < 300, status: next.status, headers: { get: () => null }, json: async () => body, text: async () => JSON.stringify(body) };
};
const compat = (o: unknown) => ({ status: 200, body: { choices: [{ message: { content: JSON.stringify(o) }, finish_reason: "stop" }] } });
const gem = (o: unknown) => ({ status: 200, body: { candidates: [{ content: { parts: [{ text: JSON.stringify(o) }] }, finishReason: "STOP" }] } });
const busy = { status: 429, body: { error: { message: "rate limit" } } };
const reset = () => { calls.length = 0; for (const k of Object.keys(q)) q[k] = []; };
const seq = () => calls.map((c) => c.who).join(">");

env.MISTRAL_API_KEY = "m"; env.GROQ_API_KEY = "q"; env.GEMINI_API_KEY = "g"; delete env.ANTHROPIC_API_KEY; delete env.AI_PROVIDER; delete env.AI_MAIN_CHAIN;
env.GROQ_API_BASE = "http://groq.test/openai/v1"; env.MISTRAL_API_BASE = "http://mistral.test/v1";
env.AI_FAST_CHAIN = "groq,mistral,gemini";
const { structured, str, TRAINS_ON_FREE } = await import("../lib/llm");
const { classifyEmails, extractAlertOffers } = await import("../lib/ai");
const schema = { properties: { a: str() }, required: ["a"] };
const run = async (opts: Record<string, unknown>) => { try { return { v: await structured<{ a: string }>({ system: "s", prompt: "p", schema, fast: true, ...opts }) }; } catch (e) { return { e: e as { status?: number; message: string } }; } };

ok("Mistral est la liste des fournisseurs qui peuvent entraîner leurs modèles", JSON.stringify(TRAINS_ON_FREE) === JSON.stringify(["mistral"]));

// 1. Sans l'option : Groq saturé → Mistral répond (comportement habituel, inchangé)
reset(); q.groq = [busy]; q.mistral = [compat({ a: "mistral" })];
let r = await run({});
ok("tâche ordinaire : Groq saturé → Mistral prend la main", r.v?.a === "mistral" && seq() === "groq>mistral", seq());

// 2. Contenu Gmail : Groq saturé → Mistral est sauté, Gemini répond
reset(); q.groq = [busy]; q.mistral = [compat({ a: "NE DOIT PAS ARRIVER" })]; q.gemini = [gem({ a: "gemini" })];
r = await run({ noTraining: true });
ok("contenu Gmail : Groq saturé → Mistral sauté, Gemini répond", r.v?.a === "gemini" && !calls.some((c) => c.who === "mistral"), seq());

// 3. Contenu Gmail : Groq puis Gemini saturés → erreur, jamais Mistral
reset(); q.groq = [busy]; q.gemini = [busy, busy, busy]; q.mistral = [compat({ a: "NE DOIT PAS ARRIVER" })];
r = await run({ noTraining: true });
ok("contenu Gmail : tout le reste saturé → échec propre, Mistral n'a rien reçu", !!r.e && !calls.some((c) => c.who === "mistral"), `${seq()} | ${r.e?.message?.slice(0, 80)}`);

// 4. Mistral seul configuré : les emails ne partent nulle part, message clair
env.AI_FAST_CHAIN = "mistral";
reset(); q.mistral = [compat({ a: "NE DOIT PAS ARRIVER" })];
r = await run({ noTraining: true });
ok("Mistral seul : refus clair, aucun appel", r.e?.status === 500 && /n'entraîne pas ses modèles/.test(r.e.message) && calls.length === 0, r.e?.message?.slice(0, 90));
reset(); q.mistral = [compat({ a: "ok" })];
r = await run({});
ok("Mistral seul, tâche ordinaire (CV, offre) : fonctionne comme avant", r.v?.a === "ok" && seq() === "mistral");

// 5. Les deux fonctions qui lisent des emails demandent bien cette protection : leur texte n'atteint jamais Mistral
env.AI_FAST_CHAIN = "mistral,groq,gemini";
reset(); q.groq = [compat({ items: [{ id: "1", category: "refus", company: "X", is_job_related: true }] })]; q.mistral = [compat({ items: [] })];
const cls = await classifyEmails([{ id: "1", from: "rh@x.test", subject: "Votre candidature", snippet: "Nous avons le regret…" }], ["X"]);
ok("classifyEmails : l'extrait d'email passe par Groq, pas par Mistral", cls[0]?.category === "refus" && seq() === "groq", seq());
reset(); q.groq = [busy]; q.mistral = [compat({ offers: [] })]; q.gemini = [gem({ offers: [{ title: "Data analyst", company: "Y", location: "Paris", url: "", snippet: "" }] })];
const offers = await extractAlertOffers("alertes@jobs.test", "3 nouvelles offres", "Data analyst chez Y, Paris");
ok("extractAlertOffers : Groq saturé → Gemini, jamais Mistral", offers.length === 1 && !calls.some((c) => c.who === "mistral"), seq());
done();
