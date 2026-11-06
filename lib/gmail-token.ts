import type { SupabaseClient } from "@supabase/supabase-js";
import { needsSealing, openToken, sealToken } from "./token-crypto";
import { accessToken } from "./gmail";
import { GMAIL_EXPIRED_MSG } from "./gmail-errors";
import { patchPreferences } from "./profile";
import { HttpError } from "./supabase/server";

/** Jeton de rafraîchissement lisible. Un ancien jeton stocké en clair est chiffré au passage (la lecture suivante le trouvera chiffré). */
export async function readRefreshToken(supabase: SupabaseClient, userId: string, stored: string): Promise<string> {
  const plain = await openToken(stored, userId);
  if (needsSealing(stored)) {
    try {
      await supabase.from("gmail_accounts").update({ refresh_token: await sealToken(plain, userId) }).eq("user_id", userId);
    } catch {
      // Tant pis : le jeton reste lisible tel quel, on réessaiera à la prochaine lecture
    }
  }
  return plain;
}

/**
 * Jeton d'accès Gmail tout prêt. Quand l'accès est perdu (retiré, expiré, ou jeton devenu illisible), on le note dans le profil :
 * Réglages et l'accueil affichent alors « Reconnecter Gmail », au lieu de laisser la personne devant une synchro qui échoue sans issue.
 */
export async function gmailAccessToken(supabase: SupabaseClient, userId: string, stored: string): Promise<string> {
  const lost = async () => {
    await patchPreferences(supabase, userId, { gmail_issue: { at: new Date().toISOString() } }).catch(() => {});
    return new HttpError(401, GMAIL_EXPIRED_MSG);
  };
  let refresh: string;
  try {
    refresh = await readRefreshToken(supabase, userId, stored);
  } catch {
    throw await lost(); // jeton chiffré qu'on ne sait plus ouvrir (clé de chiffrement changée) : reconnecter en crée un nouveau
  }
  try {
    return await accessToken(refresh);
  } catch (e) {
    if (e instanceof HttpError && e.status === 401) throw await lost();
    throw e;
  }
}
