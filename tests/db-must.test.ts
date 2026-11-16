// Audit du 16 novembre 2026 : les écritures en base dont l'erreur était ignorée (une cinquantaine). Sans réseau ni vraie base.
// (1) `must` : une écriture refusée devient une erreur claire (jamais un « ok » trompeur), sans rien divulguer de la base.
// (2) `applyEmail` : la candidature avance AVANT que l'e-mail soit rangé, et un échec laisse l'e-mail à relire (avant, le changement de statut était perdu pour de bon).
// (3) Garde-fou de code : une écriture dont le résultat est jeté doit être déclarée ici, avec sa raison.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { ok, done } from "./helpers";
import { fakeSupabase } from "./fake-supabase";
import { must } from "../lib/db-must";
import { applyEmail, type MailRow } from "../lib/email-apply";
import { HttpError } from "../lib/supabase/server";

/* ---------- (1) must ---------- */
{
  const good = { data: [{ id: 1 }], error: null };
  ok("must : sans erreur, rend le résultat tel quel", must(good) === good);

  const logged: string[] = [];
  const realError = console.error;
  console.error = (...a: unknown[]) => { logged.push(a.map(String).join(" ")); };
  let thrown: unknown;
  try { must({ data: null, error: { code: "23502", message: "null value in column", details: "Failing row contains (enc:v1:SECRET-TOKEN)" } }, "Ton profil"); } catch (e) { thrown = e; }
  console.error = realError;
  ok("must : une erreur de la base lève une HttpError 500", thrown instanceof HttpError && (thrown as HttpError & { status: number }).status === 500);
  ok("must : le message nomme ce qui n'est pas enregistré", String((thrown as Error)?.message).startsWith("Ton profil n'a pas pu être enregistré"));
  ok("must : le message de l'utilisateur ne contient rien de technique", !/23502|null value|Failing row|SECRET/.test(String((thrown as Error)?.message)));
  ok("must : le journal garde le code et le message", logged.some((l) => l.includes("23502") && l.includes("null value in column")));
  ok("must : le journal ne recopie jamais le détail de la ligne refusée (jeton chiffré, texte de CV…)", !logged.some((l) => /Failing row|SECRET/.test(l)));
  let dflt: unknown;
  try { must({ error: { message: "x" } }); } catch (e) { dflt = e; }
  ok("must : libellé par défaut", String((dflt as Error)?.message).startsWith("Ce changement n'a pas pu être enregistré"));
}

/* ---------- (2) applyEmail ---------- */
type Failing = { table: string; op: string };
/** Enveloppe de la fausse base : une écriture donnée (table + opération) répond une erreur, le reste est normal. */
function failOn(sb: ReturnType<typeof fakeSupabase>["sb"], rules: Failing[]) {
  const real = sb as unknown as { from: (t: string) => Record<string, (...a: unknown[]) => unknown> };
  return {
    from: (t: string) => {
      const q = real.from(t);
      return new Proxy(q, {
        get(target, prop: string) {
          const v = target[prop];
          if (typeof v !== "function") return v;
          if (["update", "insert", "upsert", "delete"].includes(prop) && rules.some((r) => r.table === t && r.op === prop)) {
            return () => {
              const chain: unknown = new Proxy({}, { get: (_o, p) => (p === "then" ? (res: (v: unknown) => unknown) => res({ data: null, error: { code: "XX000", message: "panne simulée" } }) : () => chain) });
              return chain;
            };
          }
          return (...a: unknown[]) => v.apply(target, a);
        },
      });
    },
  } as never;
}

const mail: MailRow = { id: "g1", threadId: "t1", from: "rh@acme.fr", subject: "Invitation à un entretien", snippet: "Pouvez-vous…", date: "2026-11-10T09:00:00Z" };
const seed = () => ({ applications: [{ id: "a1", user_id: "u1", status: "postule", applied_at: "2026-11-01", next_action_at: "2026-11-20" }] });
const silent = <T,>(f: () => Promise<T>) => { const e = console.error; console.error = () => {}; return f().finally(() => { console.error = e; }); };

await (async () => {
  // chemin normal
  {
    const { sb, tables } = fakeSupabase(seed());
    const app = { id: "a1", status: "postule", applied_at: "2026-11-01" };
    const r = await applyEmail(sb, "u1", mail, "entretien", app);
    ok("applyEmail : candidature avancée et e-mail rangé", r.ok && r.moved && tables.applications[0].status === "entretien" && tables.emails?.length === 1);
    ok("applyEmail : l'e-mail est rattaché à la candidature", tables.emails?.[0]?.application_id === "a1");
    ok("applyEmail : la relance programmée est effacée à l'entretien", tables.applications[0].next_action_at === null);
    ok("applyEmail : la date de dernier e-mail est notée", tables.applications[0].last_email_at === mail.date);
    ok("applyEmail : l'étape en mémoire suit (les e-mails suivants de la synchro la voient)", app.status === "entretien");
  }
  // sans candidature : seulement rangé
  {
    const { sb, tables } = fakeSupabase(seed());
    const r = await applyEmail(sb, "u1", mail, "entretien", undefined);
    ok("applyEmail : sans candidature visée, l'e-mail est rangé sans lien", r.ok && !r.moved && tables.emails?.length === 1 && tables.emails[0].application_id === null);
    ok("applyEmail : sans candidature visée, rien ne bouge", tables.applications[0].status === "postule");
  }
  // catégorie qui ne change pas l'étape
  {
    const { sb, tables } = fakeSupabase(seed());
    const r = await applyEmail(sb, "u1", { ...mail, subject: "Merci" }, "autre", { id: "a1", status: "postule", applied_at: "2026-11-01" });
    ok("applyEmail : catégorie neutre = ok sans changement d'étape", r.ok && !r.moved && tables.applications[0].status === "postule" && tables.applications[0].last_email_at === mail.date);
  }
  // la candidature ne se met pas à jour : rien n'est rangé, l'e-mail sera relu
  {
    const { sb, tables } = fakeSupabase(seed());
    const app = { id: "a1", status: "postule", applied_at: "2026-11-01" };
    const r = await silent(() => applyEmail(failOn(sb, [{ table: "applications", op: "update" }]), "u1", mail, "entretien", app));
    ok("échec de la candidature : résultat « pas ok »", !r.ok && !r.moved);
    ok("échec de la candidature : l'e-mail n'est PAS rangé (la synchro suivante le relira)", !(tables.emails ?? []).length);
    ok("échec de la candidature : l'étape en mémoire ne bouge pas", app.status === "postule" && tables.applications[0].status === "postule");
  }
  // l'e-mail ne se range pas : la candidature a avancé, la reprise ne la fait pas avancer deux fois
  {
    const { sb, tables } = fakeSupabase(seed());
    const app = { id: "a1", status: "postule", applied_at: "2026-11-01" };
    const r = await silent(() => applyEmail(failOn(sb, [{ table: "emails", op: "upsert" }]), "u1", mail, "entretien", app));
    ok("échec du rangement : résultat « pas ok » mais la candidature a avancé", !r.ok && r.moved && tables.applications[0].status === "entretien");
    // Reprise à la synchro suivante : les candidatures sont relues, l'e-mail n'était pas connu
    const again = await applyEmail(sb, "u1", mail, "entretien", { id: "a1", status: String(tables.applications[0].status), applied_at: "2026-11-01" });
    ok("reprise : e-mail rangé, sans second changement d'étape", again.ok && !again.moved && tables.emails?.length === 1 && tables.applications[0].status === "entretien");
    const second = await applyEmail(sb, "u1", mail, "entretien", { id: "a1", status: "entretien", applied_at: "2026-11-01" });
    ok("reprise rejouée : toujours un seul e-mail rangé (même clé)", second.ok && tables.emails?.length === 1);
  }
  // un refus ne remet jamais une candidature « À postuler » en Refusé (règle de nextStatus gardée)
  {
    const { sb, tables } = fakeSupabase({ applications: [{ id: "a2", user_id: "u1", status: "a_postuler", applied_at: null }] });
    const r = await applyEmail(sb, "u1", { ...mail, id: "g2" }, "refus", { id: "a2", status: "a_postuler", applied_at: null });
    ok("un refus ne touche pas une ligne « À postuler »", r.ok && !r.moved && tables.applications[0].status === "a_postuler");
  }
})();

/* ---------- (3) garde-fou : écritures dont le résultat est jeté ---------- */
const root = process.cwd(); // les tests se lancent depuis la racine du dépôt
const walk = (d: string): string[] =>
  readdirSync(d).flatMap((n) => {
    const p = join(d, n);
    if (n === "node_modules" || n === ".next" || n === ".git") return [];
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
const files = [...walk(join(root, "app/api")), ...walk(join(root, "lib"))];

/** Écritures VOLONTAIREMENT sans contrôle d'erreur, avec la raison. Toute autre écriture jetée fait échouer le test : l'envelopper dans `must(...)` ou lire `error`. */
const ALLOWED: [string, string, string][] = [
  ["app/api/cron/daily/route.ts", `from("profiles").update({ cron_at`, "colonne peut-être absente (migration pas lancée) : sans effet voulu"],
  ["app/api/offers/[id]/reanalyze/route.ts", `from("applications").update({ score: analysis.score })`, "report du pourcentage sur Suivi, après une analyse déjà enregistrée : ne pas perdre l'analyse payée pour un score de carte"],
  ["app/api/offers/[id]/generate/route.ts", `from("applications").update({ cv_variant`, "variante affichée sur la carte, après un document déjà enregistré"],
  ["app/api/offers/analyze/route.ts", `from("application_texts").delete()`, "table ajoutée par une mise à jour de la base pas forcément lancée"],
  ["app/api/insights/route.ts", `from("insights").insert`, "mémoire d'un résultat d'IA déjà affiché : ne pas le perdre pour un échec de rangement"],
  ["lib/sync.ts", `from("gmail_accounts").update({ last_sync_at`, "la date n'avance pas : la synchro suivante relit la même fenêtre, sans perte"],
  ["lib/sync.ts", `from("documents").insert({`, "CV automatique, désactivé par défaut (AUTO_GENERATE_CV)"],
  ["lib/profile.ts", `from("profiles").upsert({ user_id: user.id, data: initial })`, "profil initial recréé à la prochaine lecture"],
  ["lib/cv-job.ts", `from("diagnostics").update({ content: { status: "error"`, "déjà dans le chemin d'erreur : rien de plus à signaler"],
  ["lib/gmail-token.ts", `from("gmail_accounts").update({ refresh_token`, "rechiffrement d'un ancien jeton au passage : refait à la lecture suivante"],
  ["lib/reco-age-db.ts", `from("recommendations").delete()`, "nettoyage des offres jamais lues : refait à chaque visite"],
  ["lib/offer-ops.ts", `.update({ status: "rejected", reject_reason: "expiree"`, "rangement d'une annonce retirée : refait à la prochaine vérification"],
  ["lib/offer-ops.ts", `.delete().eq("user_id", userId).in("id", drop`, "nettoyage des doublons sans travail : refait à la prochaine lecture"],
];

const hits: { file: string; text: string }[] = [];
for (const f of files) {
  const lines = readFileSync(f, "utf8").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    const m = /^(?:(?:if|for) \(.*\)\s*|else\s+)?await\s+(\w+)\s*\.from\(/.exec(t) || /^(?:(?:if|for) \(.*\)\s*)?await\s+(\w+)\s*$/.exec(t);
    if (!m) continue;
    let buf = t;
    for (let j = i; !lines[j].includes(";") && j < i + 8; j++) buf += " " + lines[j + 1]?.trim();
    if (/\.(update|insert|delete|upsert)\(/.test(buf)) hits.push({ file: relative(root, f), text: buf });
  }
}
const norm = (s: string) => s.replace(/\s+/g, " ");
const unexpected = hits.filter((h) => !ALLOWED.some(([file, frag]) => h.file === file && norm(h.text).includes(norm(frag))));
ok("aucune écriture de app/api ni de lib/ ne jette son résultat sans l'avoir déclaré ici", unexpected.length === 0, unexpected.map((u) => `${u.file} : ${u.text.slice(0, 90)}`).join(" | "));
const stale = ALLOWED.filter(([file, frag]) => !hits.some((h) => h.file === file && norm(h.text).includes(norm(frag))));
ok("chaque exception déclarée existe encore dans le code (sinon la retirer)", stale.length === 0, stale.map((s) => `${s[0]} : ${s[1]}`).join(" | "));

done();
