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

## Audit 2 : 2 novembre 2026, nuit (rendu, fluidité, simplicité)
Rapport complet : `docs/audit-2026-11-02.md`. Lecture seule, rien de modifié dans le code ; tout est à mettre dans le prochain paquet.

- **Méthode** : site construit contre un faux Supabase (données fictives), 16 pages rendues par Chromium en 1280 px et 390 px, avec mesures et interactions. Pas de vrai compte, pas de PDF, pas de mode sombre.
- **Bon** : zéro débordement, zéro erreur console, zéro requête en échec ; « Autre » et « Tout analyser » se comportent comme prévu.
- **À corriger** : stats et apprentissage sans pagination (coupés à 1 000 lignes) ; Suivi sur téléphone (200 cartes à plat) ; « Tout analyser (N) » qui ne dit pas combien sont analysables ; trois chiffres différents pour « à trier » ; Offres & CV en liste plate.
- **À vérifier avec Juliana** : nombre de recommandations en base (> 1 000 ?), titre « En cours de développement » de Recherche, type de clés JWT de Supabase, réponse à « À décider ».

## Évolution : partie admin du site (3 novembre 2026, nuit)
Demandée par Juliana (« des choses que les utilisateurs ne devraient pas voir »). Pas une ronde de contrôle, mais elle clôt un point laissé ouvert par la ronde 1 (messages d'erreur techniques renvoyés tels quels).

- **Ajouté** : page `/admin` (comptes et usage de l'IA, installation, test des IA, sources d'offres, liens) ; garde `lib/admin-guard.ts` (adresse dans OWNER_EMAILS **et** adresse confirmée selon Supabase, sinon page introuvable) ; entrée de menu et bouton dans Réglages réservés à l'admin ; logique pure testable `lib/admin.ts` + `tests/admin.test.ts` ; lecture des comptes par la clé de service (`lib/admin-data.ts`), uniquement des totaux, jamais de contenu.
- **Verrouillé** : `/configuration` (publique) redirige vers `/admin` une fois l'app configurée ; `POST /api/health/ai` réservé à l'admin (n'importe quel compte pouvait déclencher des appels IA) ; messages d'erreur avec noms de clés, « Vercel », « Supabase », SQL masqués aux non-admins dans `handle()` (8 messages concernés sur 71 passés en revue) ; message de l'agenda neutre ; rappel « Ajoute la clé IA » de l'accueil réservé à l'admin.
- **Changé de sens** : être admin demande maintenant une adresse dans OWNER_EMAILS (ou SEED_PROFILE_EMAIL). Avant, sans liste, tout le monde voyait l'installation. `isAdmin` supprimé de `lib/quota.ts`.
- **Vérifié** : typecheck, build, `npm test` (5 fichiers) ; rendu local avec faux Supabase : admin (bureau et téléphone), compte ordinaire, visiteur déconnecté.
- **Non testé** : vrai compte admin sur Vercel, vraie liste de comptes Supabase, réponse réelle des IA depuis `/admin`, porte « adresse confirmée » (le faux Supabase répond toujours oui).
- **Texte légal modifié** : la page Confidentialité précise ce que l'admin voit. À relire par Juliana.
- **Détail technique** : la page « introuvable » est servie avec le code HTTP 200 (le chargement progressif de `app/loading.tsx` est déjà parti) ; elle porte `noindex` et ne révèle rien.

