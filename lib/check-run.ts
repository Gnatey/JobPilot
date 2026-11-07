/**
 * Boucle de « Vérifier les annonces » côté écran : envoie les identifiants par paquets de CHECK_BATCH, un paquet après l'autre, et s'arrête proprement
 * (session expirée, trop de vérifications, échecs répétés, arrêt demandé). Logique pure (la requête est injectée), testée par tests/reco-check.test.ts.
 * Utilisée par components/check-recos.tsx (Recommandées) ; components/check-ads.tsx (Offres & CV) garde sa propre boucle, identique.
 */
import { CHECK_BATCH, chunk, type CheckResult } from "./offer-check";

export type FetchLike = (input: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export async function runChecks(o: {
  endpoint: string; ids: string[]; cancelled: () => boolean; onProgress?: (results: CheckResult[]) => void; fetchFn?: FetchLike;
}): Promise<{ results: CheckResult[]; stopped: string | null }> {
  const doFetch: FetchLike = o.fetchFn ?? ((u, i) => fetch(u, i));
  const results: CheckResult[] = [];
  let stopped: string | null = null;
  let fails = 0;
  for (const batch of chunk(o.ids, CHECK_BATCH)) {
    if (o.cancelled()) { stopped = "Arrêté à ta demande."; break; }
    const res = await doFetch(o.endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: batch }) }).catch(() => null);
    const j = (res ? await res.json().catch(() => ({})) : {}) as { results?: unknown; error?: string };
    if (res?.ok && Array.isArray(j.results)) {
      fails = 0;
      results.push(...(j.results as CheckResult[]));
      o.onProgress?.([...results]);
      continue;
    }
    if (res?.status === 401) { stopped = "Ta session a expiré : reconnecte-toi, puis relance."; break; }
    if (res?.status === 429) { stopped = j.error ?? "Trop de vérifications en peu de temps : réessaie dans un moment."; break; }
    if (++fails >= 3) { stopped = "Plusieurs échecs de suite : je m'arrête, réessaie dans un moment."; break; }
  }
  return { results, stopped };
}
