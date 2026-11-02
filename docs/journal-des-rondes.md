# Journal des rondes

Une entrée par ronde : ce qui a été vérifié, trouvé, corrigé, et ce qui reste ouvert. Une ronde lit ce fichier avant de commencer pour ne pas refaire ce qui est déjà vérifié.

<!-- Les entrées sont ajoutées ci-dessous, la plus récente en bas. -->

## Ronde 1 : 2 novembre 2026, soir
Rapport complet : `docs/ronde-nocturne-2026-11-02.md`. Cahier de recette créé : `docs/cahier-de-recette.md`.

- **Vérifié** : typecheck, build, `npm test` (4 fichiers) ; essai sur le vrai serveur de production (pages publiques en 200, pages privées vers `/login`, API en 401, cron en 401, jeton d'agenda inconnu en 404) ; audit des routes API, du SQL (RLS sur les 12 tables, `spend_ai`), des sorties réseau (protection SSRF), XSS, secrets en dur.
- **Corrigé** : redirection ouverte sur `/auth/callback?next=` (`/\evil.com` et variantes passaient) → `lib/safe-next.ts` + tests ; échappement `;` et retours chariot dans l'agenda `.ics`.
- **Laissé ouvert** : alertes `npm audit` (postcss dans Next, non exploitable ici, correctif = Next 16) ; jeton Gmail en clair en base et suppression de compte sans mot de passe (à durcir avant d'ouvrir aux amis) ; messages d'erreur techniques renvoyés tels quels.
- **Non testé** : tout ce qui demande un vrai compte, de vraies IA, Gmail, le cron réel, et tout le visuel. Noms de modèles de repli Mistral non vérifiés.
- **À refaire la prochaine fois** : relire les lignes « À toi » du cahier de recette que Juliana aura testées ; envisager un compte de test pour un contrôle visuel (Playwright).
