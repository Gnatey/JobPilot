/**
 * Quand Google refuse de renouveler l'accès à Gmail : que s'est-il passé, et que dire ? (logique pure, testée dans tests/gmail-errors.test.ts)
 *
 * Avant, n'importe quel refus s'appelait « accès expiré » : une panne passagère de Google, une clé d'application modifiée
 * et un vrai accès retiré donnaient le même message, et Réglages n'offrait aucun moyen de se reconnecter.
 * Le code renvoyé par Google (`invalid_grant`, `invalid_client`…) ne contient aucun secret : on le lit pour trier les cas.
 */

/** Texte montré quand la personne doit reconnecter Gmail. Partagé avec le navigateur (le bouton « Synchroniser » y reconnaît ce cas). */
export const GMAIL_EXPIRED_MSG = "Accès Gmail expiré : reconnecte ton compte Gmail.";

export type TokenIssue = "expired" | "config" | "unavailable";

/**
 * - expired : l'accès a été retiré, a expiré ou ne peut plus être lu : reconnecter Gmail règle tout ;
 * - config : Google ne reconnaît plus l'application (clé ou secret modifiés) : reconnecter ne servirait à rien, c'est un réglage de l'admin ;
 * - unavailable : Google ne répond pas ou limite les demandes : réessayer plus tard, sans rien reconnecter.
 */
export function classifyTokenFailure(status: number, googleError?: string | null): TokenIssue {
  const code = (googleError ?? "").toLowerCase();
  if (code === "invalid_grant") return "expired";
  if (code === "invalid_client" || code === "unauthorized_client") return "config";
  if (status === 429 || status >= 500 || code === "temporarily_unavailable" || code === "server_error") return "unavailable";
  return "expired"; // refus sans explication : le plus probable est un accès retiré, reconnecter est le bon geste
}

export const TOKEN_MESSAGE: Record<TokenIssue, string> = {
  expired: GMAIL_EXPIRED_MSG,
  config: "Google ne reconnaît plus la clé de l'application (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET dans Vercel) : vérifie-les, reconnecter Gmail n'y changera rien.",
  unavailable: "Google ne répond pas pour le moment : réessaie dans quelques minutes (rien n'est à reconnecter).",
};

/** Statut HTTP de chaque cas. Jamais 429 ni 503 : le reste de l'app les lit comme « IA saturée » et s'arrête pour tout le monde. */
export const TOKEN_STATUS: Record<TokenIssue, number> = { expired: 401, config: 502, unavailable: 502 };

export const isExpiredMessage = (message: unknown) => typeof message === "string" && message.startsWith("Accès Gmail expiré");

/** Marque laissée dans le profil quand l'accès a expiré : Réglages et l'accueil proposent alors « Reconnecter ». Effacée à la reconnexion. */
export type GmailIssue = { at: string };

/** Le bouton de reconnexion garde la permission d'envoi quand le récap du matin est activé (sinon il se désactiverait sans bruit). */
export const reconnectHref = (recap: boolean) => `/api/gmail/connect${recap ? "?recap=1" : ""}`;
