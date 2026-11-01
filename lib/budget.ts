import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Temps imparti à une opération serveur (Vercel coupe net une fonction à sa durée maximale, sans message).
 * Les étapes longues (appels IA, synchronisation) consultent `timeLeft()` : elles s'arrêtent proprement avant la limite,
 * gardent ce qui est déjà fait et le disent, au lieu d'être interrompues au milieu.
 */
export class Deadline {
  constructor(readonly end: number) {}
  static in(ms: number) { return new Deadline(Date.now() + ms); }
  left() { return this.end - Date.now(); }
  /** Sous-échéance : au plus `ms` à partir de maintenant, sans jamais dépasser celle-ci. */
  slice(ms: number) { return new Deadline(Math.min(this.end, Date.now() + ms)); }
  /** Même échéance, mais `ms` de moins (réserve pour la suite). */
  minus(ms: number) { return new Deadline(this.end - ms); }
}

const store = new AsyncLocalStorage<Deadline>();

/** Exécute `fn` sous cette échéance ; les appels imbriqués ne peuvent que la raccourcir. */
export function withDeadline<T>(d: Deadline, fn: () => Promise<T>): Promise<T> {
  const outer = store.getStore();
  return store.run(outer && outer.end < d.end ? outer : d, fn);
}

/** Millisecondes restantes (Infinity hors d'une échéance). */
export const timeLeft = () => store.getStore()?.left() ?? Number.POSITIVE_INFINITY;

/** L'échéance en cours (null hors d'une échéance), pour en tirer des sous-échéances. */
export const currentDeadline = () => store.getStore() ?? null;
