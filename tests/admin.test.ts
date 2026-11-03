// Partie admin : qui est admin, quels messages d'erreur sont masqués aux autres, calcul de la vue « comptes et usage ».
import { adminEmails, isAdminEmail, looksTechnical, messageFor, PUBLIC_ERROR, buildAccountRows, aiPerDay, lastDays, summarize, supabaseDashboardUrl, type AdminUser, type UsageRow } from "../lib/admin";
import { spendAi, isOwner } from "../lib/quota";
import { ok, done } from "./helpers";

// ---------- Qui est admin ----------
const env = (OWNER_EMAILS?: string, SEED_PROFILE_EMAIL?: string) => ({ OWNER_EMAILS, SEED_PROFILE_EMAIL });
ok("aucune liste configurée : personne n'est admin (sûr par défaut)", !isAdminEmail("juliana@example.fr", env()) && !isAdminEmail("juliana@example.fr", env("", "")) && !isAdminEmail("juliana@example.fr", env(" , ,")));
ok("adresse listée : admin", isAdminEmail("juliana@example.fr", env("juliana@example.fr")));
ok("majuscules et espaces sans importance", isAdminEmail("  Juliana@Example.FR ", env(" JULIANA@example.fr , autre@x.fr ")));
ok("plusieurs adresses", isAdminEmail("autre@x.fr", env("juliana@example.fr, autre@x.fr")));
ok("SEED_PROFILE_EMAIL compte aussi", isAdminEmail("seed@x.fr", env("juliana@example.fr", "seed@x.fr")));
ok("adresse absente, vide ou null : refusée", !isAdminEmail(null, env("a@x.fr")) && !isAdminEmail(undefined, env("a@x.fr")) && !isAdminEmail("", env("a@x.fr")));
ok("ressemblance ou morceau d'adresse : refusé", !isAdminEmail("a@x.fr.evil.com", env("a@x.fr")) && !isAdminEmail("xa@x.fr", env("a@x.fr")) && !isAdminEmail("a@x", env("a@x.fr")) && !isAdminEmail("a", env("a@x.fr")));
ok("adminEmails nettoie la liste", JSON.stringify(adminEmails(env(" A@x.fr ,, b@x.fr ", "C@x.fr"))) === JSON.stringify(["a@x.fr", "b@x.fr", "c@x.fr"]));

// ---------- Messages techniques masqués aux non-admins ----------
const technical = [
  "La suppression du compte demande SUPABASE_SERVICE_ROLE_KEY dans Vercel. Ajoute-la, redéploie, puis recommence.",
  "Gmail non configuré (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).",
  "Aucune clé IA : ajoute GEMINI_API_KEY (gratuit) dans Vercel. GROQ_API_KEY et MISTRAL_API_KEY (gratuits aussi) répartissent la charge.",
  "GEMINI_API_KEY manquante dans les variables d'environnement",
  "Clé Gemini invalide : vérifie GEMINI_API_KEY dans Vercel.",
  "Mistral : le modèle mistral-small n'est pas inclus dans ton offre gratuite (la clé est bonne). Change MISTRAL_MODEL dans Vercel.",
  "Clé Groq invalide : vérifie GROQ_API_KEY dans Vercel.",
  "Aucune clé IA : ajoute GEMINI_API_KEY (gratuit) ou ANTHROPIC_API_KEY dans Vercel.",
  "Erreur Supabase : relation does not exist",
  "Colle le script dans le SQL Editor puis Run.",
];
for (const m of technical) ok(`technique : ${m.slice(0, 48)}…`, looksTechnical(m) && messageFor(m, false) === PUBLIC_ERROR && messageFor(m, true) === m);

const plain = [
  "Non connecté",
  "Tape SUPPRIMER pour confirmer.",
  "Toutes les IA configurées sont saturées pour le moment. Réessaie dans quelques minutes.",
  "Cette offre n'est plus disponible.",
  "Colle un lien ou le texte de l'annonce.",
  "Introuvable",
];
for (const m of plain) ok(`message normal conservé : ${m.slice(0, 48)}`, !looksTechnical(m) && messageFor(m, false) === m);
ok("le message public ne contient rien de technique", !looksTechnical(PUBLIC_ERROR));

// Le vrai message de limite du jour (celui que voit un ami) ne doit jamais être masqué
{
  const fake = { rpc: async () => ({ data: -1, error: null }) } as never;
  let msg = "";
  try { await spendAi(fake, { email: "ami@example.fr" }, 2); } catch (e) { msg = (e as Error).message; }
  ok("limite du jour : message clair et non masqué", msg.includes("limite d'actions IA") && !looksTechnical(msg), msg.slice(0, 60));
  let called = false;
  const spy = { rpc: async () => { called = true; return { data: -1, error: null }; } } as never;
  process.env.OWNER_EMAILS = "juliana@example.fr";
  await spendAi(spy, { email: "Juliana@example.fr" }, 2);
  ok("l'admin n'a pas de plafond (aucun compteur touché)", !called && isOwner("juliana@example.fr"));
  delete process.env.OWNER_EMAILS;
}

// ---------- Vue « comptes et usage » ----------
const now = new Date("2026-11-03T10:00:00Z");
ok("7 jours, du plus ancien à aujourd'hui", JSON.stringify(lastDays(now)) === JSON.stringify(["2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02", "2026-11-03"]));
const users: AdminUser[] = [
  { id: "a", email: "a@x.fr", created_at: "2026-09-01T10:00:00Z", last_sign_in_at: "2026-11-02T08:00:00Z" },
  { id: "b", email: "b@x.fr", created_at: "2026-10-01T10:00:00Z", last_sign_in_at: "2026-11-03T07:00:00Z" },
  { id: "c", email: null, created_at: "2026-10-20T10:00:00Z", last_sign_in_at: null },
  { id: "d", email: "d@x.fr", created_at: "2026-08-01T10:00:00Z", last_sign_in_at: "2026-09-01T08:00:00Z" },
];
const usage: UsageRow[] = [
  { user_id: "a", day: "2026-11-03", n: 40 }, { user_id: "a", day: "2026-11-02", n: 12 },
  { user_id: "b", day: "2026-11-03", n: 60 }, { user_id: "b", day: "2026-10-20", n: 99 }, // hors des 7 jours : ignoré
  { user_id: "d", day: "2026-10-30", n: 5 },
];
const rows = buildAccountRows(users, usage, { a: 12, b: 3 }, now);
const by = (id: string) => rows.find((r) => r.id === id)!;
ok("IA aujourd'hui et sur 7 jours", by("a").aiToday === 40 && by("a").ai7 === 52 && by("b").aiToday === 60 && by("b").ai7 === 60 && by("d").aiToday === 0 && by("d").ai7 === 5);
ok("jours trop anciens ignorés", by("b").ai7 === 60);
ok("candidatures : nombre connu ou null", by("a").applications === 12 && by("c").applications === null);
ok("compte sans adresse affiché clairement", by("c").email === "(sans adresse)");
ok("tri : IA du jour décroissante, puis dernière connexion", rows.map((r) => r.id).join("") === "badc", rows.map((r) => r.id).join(""));
const perDay = aiPerDay(usage, now);
ok("total par jour", perDay.length === 7 && perDay[6].n === 100 && perDay[5].n === 12 && perDay[2].n === 5 && perDay[0].n === 0);
const sum = summarize(rows, 60, now);
ok("synthèse : comptes, actifs 7 j, IA du jour, au plafond", sum.accounts === 4 && sum.active7 === 2 && sum.aiToday === 100 && sum.atCap === 1, JSON.stringify(sum));
ok("liste vide sans erreur", buildAccountRows([], [], {}, now).length === 0 && summarize([], 60, now).accounts === 0);

// ---------- Lien vers Supabase ----------
ok("lien Supabase déduit de l'adresse du projet", supabaseDashboardUrl("https://abcdefghijklmnop.supabase.co") === "https://supabase.com/dashboard/project/abcdefghijklmnop");
ok("adresse inattendue : pas de lien", supabaseDashboardUrl("https://127.0.0.1:54321") === null && supabaseDashboardUrl("") === null && supabaseDashboardUrl(undefined) === null && supabaseDashboardUrl("pas une url") === null && supabaseDashboardUrl("https://evil.com/abcdefghijklmnop.supabase.co") === null);
done();
