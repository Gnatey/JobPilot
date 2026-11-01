import { NextResponse } from "next/server";
import { HttpError } from "./supabase/server";
import { Deadline, withDeadline } from "./budget";

/**
 * `handle(fn)` ou `handle(budgetMs, fn)` : avec un budget, l'opération (et les appels IA qu'elle fait) s'arrête proprement
 * avant la durée maximale de la fonction Vercel, avec un message clair au lieu d'une coupure brutale.
 */
export function handle<T>(fn: () => Promise<T>): Promise<NextResponse>;
export function handle<T>(budgetMs: number, fn: () => Promise<T>): Promise<NextResponse>;
export function handle<T>(a: number | (() => Promise<T>), b?: () => Promise<T>): Promise<NextResponse> {
  const fn = typeof a === "number" ? b! : a;
  const run = typeof a === "number" ? () => withDeadline(Deadline.in(a), fn) : fn;
  return run()
    .then((data) => NextResponse.json(data))
    .catch((e: unknown) => {
      const status = e instanceof HttpError ? e.status : 500;
      const message = e instanceof Error ? e.message : "Erreur inconnue";
      if (status === 500) console.error(e);
      return NextResponse.json({ error: message }, { status });
    });
}
