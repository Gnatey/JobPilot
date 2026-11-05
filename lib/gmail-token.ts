import type { SupabaseClient } from "@supabase/supabase-js";
import { needsSealing, openToken, sealToken } from "./token-crypto";

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
