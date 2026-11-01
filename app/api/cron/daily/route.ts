import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { syncGmail, runSavedSearches, autoPrepare } from "@/lib/sync";
import { sendDailyRecap } from "@/lib/recap";
import { HttpError } from "@/lib/supabase/server";
import { Deadline, withDeadline } from "@/lib/budget";

export const maxDuration = 300;

const BUDGET_MS = 270_000;   // on s'arrête avant la limite de la fonction (300 s) ; les comptes restants passent en premier demain
const MIN_SHARE_MS = 90_000; // temps minimal accordé à un compte
const RECAP_MS = 15_000;     // réservé à l'envoi du récap, quoi qu'il arrive aux étapes précédentes

/**
 * Tâche quotidienne (Vercel Cron, voir vercel.json) : pour chaque utilisateur,
 * lit Gmail, relance les recherches sauvegardées, prépare les meilleures offres et, si l'utilisateur l'a activé, lui envoie son récap par email.
 * Équitable : les comptes les moins récemment traités passent d'abord, chacun a sa part de temps, et l'IA n'est plus sollicitée dès qu'elle est saturée.
 * Un compte dont le passage est trop long est interrompu proprement (ce qui est lu est gardé) ; il est marqué comme traité dès le début pour ne pas bloquer les autres le lendemain.
 * Utilise la clé service_role : uniquement côté serveur, protégée par CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const all = Deadline.in(BUDGET_MS);
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  // cron_at : date du dernier passage (colonne ajoutée par la mise à jour 4 ; sans elle, ordre de la base)
  let { data: users, error } = await admin.from("profiles").select("user_id").order("cron_at", { ascending: true, nullsFirst: true });
  if (error) ({ data: users } = await admin.from("profiles").select("user_id"));

  const report: Record<string, unknown> = {};
  let aiDown = false; // quota ou saturation de l'IA : inutile d'insister pour les comptes suivants
  const step = <T,>(f: () => Promise<T>) =>
    f().catch((e: unknown) => {
      if (e instanceof HttpError && (e.status === 429 || e.status === 503)) aiDown = true;
      return { error: e instanceof Error ? e.message : "erreur" };
    });
  let done = 0;

  const list = users ?? [];
  for (const { user_id } of list) {
    if (all.left() < MIN_SHARE_MS) { report._skipped = list.length - done; break; }
    // Marqué dès le début : si ce passage est coupé, le compte ne repasse pas en tête demain en bloquant tous les autres
    await admin.from("profiles").update({ cron_at: new Date().toISOString() }).eq("user_id", user_id); // sans effet si la colonne n'existe pas encore
    // Part de ce compte : le temps restant partagé entre les comptes restants, avec un minimum
    const mine = all.slice(Math.max(MIN_SHARE_MS, all.left() / (list.length - done)));
    const sync = mine.minus(RECAP_MS);
    try {
      // Chaque étape est indépendante : un échec (ex. Gmail expiré) n'empêche ni la recherche ni le récap
      const gmail = aiDown ? { skipped: "IA indisponible" } : await step(() => withDeadline(sync.slice(sync.left() * 0.55), () => syncGmail(admin, user_id)));
      if (typeof gmail === "object" && "stopped" in gmail && gmail.stopped === "ia") aiDown = true;
      const searches = await step(() => withDeadline(sync, () => runSavedSearches(admin, user_id)));
      const prep = aiDown ? { skipped: "IA indisponible" } : await step(() => withDeadline(sync, async () => {
        const r = await autoPrepare(admin, user_id);
        if (r.stopped && r.stopped !== "temps") aiDown = true; // « temps » ne concerne que ce compte
        return r;
      }));
      const recap = await step(() => withDeadline(mine, () => sendDailyRecap(admin, user_id)));
      report[user_id] = { gmail, searches, prep, recap };
    } catch (e) {
      report[user_id] = { error: e instanceof Error ? e.message : "erreur" };
    }
    done++;
  }
  return NextResponse.json(report);
}
