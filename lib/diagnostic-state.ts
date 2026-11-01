import type { Diagnostic } from "./types";

/** Une analyse de CV tourne en arrière-plan : sa ligne contient d'abord un état « en cours », puis le diagnostic ou l'erreur. */
export type DiagnosticRow = Diagnostic | { status: "pending"; started_at: string; text?: string } | { status: "error"; error: string; detail?: string; started_at?: string; text?: string };

/** Au-delà de ce délai, une analyse « en cours » est considérée comme perdue (la fonction a été coupée). */
export const STALE_MS = 6 * 60_000;

export type DiagState =
  | { state: "done"; diagnostic: Diagnostic }
  | { state: "pending"; startedAt: string }
  | { state: "error"; message: string; canRetry: boolean; detail?: string };

export function diagState(content: unknown, createdAt: string, now = Date.now()): DiagState {
  const c = (content ?? {}) as Record<string, unknown>;
  if (typeof c.overall_score === "number") return { state: "done", diagnostic: content as Diagnostic };
  const startedAt = typeof c.started_at === "string" ? c.started_at : createdAt;
  const canRetry = typeof c.text === "string" && c.text.length >= 200;
  if (c.status === "error") return { state: "error", message: typeof c.error === "string" && c.error ? c.error : "L'analyse n'a pas abouti.", canRetry, detail: typeof c.detail === "string" ? c.detail : undefined };
  if (c.status === "pending") {
    if (now - new Date(startedAt).getTime() > STALE_MS) return { state: "error", message: "L'analyse a été interrompue (délai dépassé). Ton CV n'a rien perdu.", canRetry };
    return { state: "pending", startedAt };
  }
  return { state: "error", message: "Cette analyse est illisible.", canRetry: false };
}
