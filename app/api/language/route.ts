import { requireUser, HttpError } from "@/lib/supabase/server";
import { handle } from "@/lib/http";
import { patchPreferences } from "@/lib/profile";
import { isLocale } from "@/lib/i18n/locales";

/** Retient la langue choisie dans le profil (le cookie, lui, est posé par le navigateur) : les textes de l'IA et les e-mails suivent. */
export async function POST(req: Request) {
  return handle(async () => {
    const { supabase, user } = await requireUser();
    const { lang } = (await req.json().catch(() => ({}))) as { lang?: unknown };
    if (!isLocale(lang)) throw new HttpError(400, "Langue inconnue.");
    await patchPreferences(supabase, user.id, { lang });
    return { ok: true, lang };
  });
}
