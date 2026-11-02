# Ronde du 2 novembre 2026 (soir)

Première ronde. Elle suit la livraison du paquet du soir (« Autre » avec pourquoi libre, favori plus fidèle, « Tout analyser », Mistral réparé). Commit du paquet : `ddf04be`, déployé et en ligne (Vercel READY, aucune erreur d'exécution dans la demi-heure qui a suivi).

## Ce qui a été fait

1. **Tests automatiques** (`npm test`, 4 fichiers, tous verts) : doublons de candidatures, chaîne d'IA avec Mistral (403 « modèle non inclus », 401 clé invalide, message final qui nomme chaque IA), raisons d'écart, lecture d'annonces, bandeau du favori, file de « Tout analyser », étoile d'accueil, redirection après connexion.
2. **Contrôle complet** : `npm run typecheck`, `npm run build`, `npm test`.
3. **Essai sur le vrai serveur de production** (build réel, Supabase injoignable) : pages publiques, pages privées, routes API, cron, agenda, redirection de connexion.
4. **Audit statique** : les 39 routes API, le SQL des 12 tables, les sorties réseau, le XSS, les secrets en dur, `npm audit`.
5. **Cahier de recette** créé : `docs/cahier-de-recette.md` (32 parcours, avec ce qui est vérifié automatiquement, relu, ou à tester avec un vrai compte).

## Trouvé et corrigé

| Gravité | Constat | Correction |
|---|---|---|
| Moyenne | **Redirection ouverte** sur `/auth/callback?next=…` : `/\evil.com`, `/<tab>/evil.com` et `/<retour ligne>/evil.com` passaient le filtre (« commence par `/` mais pas `//` ») et envoyaient vers un autre site, **sans code de connexion valide** (sans `code`, la route redirige directement). Utilisable pour du hameçonnage avec une adresse qui commence par ton domaine. | `lib/safe-next.ts` : l'analyseur d'adresses tranche, seul un chemin du site passe. 16 adresses hostiles testées (`tests/safe-next.test.ts`) puis revérifiées sur le vrai serveur. |
| Faible | **Agenda `.ics`** : le `\;` du code n'était qu'un `;` (les points-virgules d'un titre ou d'une entreprise n'étaient pas échappés) et un retour chariot isolé n'était pas traité. | Échappement corrigé ; la vraie ligne a été exécutée pour le vérifier. |

## Vérifié, rien à corriger

- Toutes les routes API exigent une session (401 sinon), sauf deux publiques voulues : l'agenda (jeton secret de 48 caractères, filtré sur l'utilisateur du jeton) et le retour de connexion.
- Cron : refus sans le bon secret, y compris `Bearer undefined` (le secret absent ne peut pas être « deviné »).
- Gmail : l'état de sécurité du retour de connexion est comparé au cookie.
- SQL : les 12 tables ont le RLS (`user_id = auth.uid()`) ; le budget d'IA ne peut être qu'augmenté par son propre compte (`spend_ai`), donc pas de contournement du plafond.
- Réseau : la lecture des liens d'offres refuse les adresses internes, recontrôle chaque redirection, garde le DNS et limite taille et durée. Les autres appels sortants vont vers des adresses fixes.
- Aucun secret dans le dépôt, un seul `dangerouslySetInnerHTML` (script de thème, contenu fixe).
- En-têtes de sécurité présents (`X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`).

## Constaté, laissé tel quel (à ta décision)

- **`npm audit`** : 2 alertes (`postcss` embarqué dans Next). `postcss` ne traite ici que le CSS du projet, au build : pas exploitable. Le correctif est un saut vers Next 16 (changement cassant), donc pas fait de nuit.
- **Jeton Gmail** (`gmail_accounts.refresh_token`) stocké en clair dans la base, protégé par le RLS. Acceptable pour toi seule ; avant d'ouvrir aux amis, à chiffrer.
- **Suppression du compte** : demande d'être connectée et de taper SUPPRIMER, sans redemander le mot de passe. À durcir avant d'ouvrir aux amis.
- **Erreurs inattendues** : le message technique est renvoyé tel quel au navigateur (utile pour diagnostiquer, moins propre à montrer à des amis). Un corps de requête illisible donne une 500 au lieu d'une 400. Changer ça touche toutes les routes : à décider avec toi.

## Non testé (impossible depuis ici)

- Tout ce qui demande un vrai compte Supabase : connexion, deux étapes, export, suppression, droits entre comptes en vrai.
- Les vraies IA : le déroulé de « Tout analyser » et la génération de CV avec Gemini, Groq et Mistral réels. Les noms de modèles de repli Mistral (`mistral-medium-latest`, `mistral-small-latest`, `open-mistral-nemo`) ne sont pas vérifiés contre ton offre gratuite ; la raison exacte du refus de Groq non plus.
- Gmail, le cron réel, l'abonnement à l'agenda.
- **Tout le visuel** (colonnes de Suivi qui défilent, formulaire « Autre », étoile d'accueil, bandeau « estimé ») : aucun contrôle visuel fait cette nuit, pas de compte de test à l'écran.
- Les offres déjà mal analysées avant ce paquet ne sont pas réanalysées automatiquement ; « estimé » ne vaut que pour les analyses faites après la mise en ligne.

## Pour la prochaine ronde

Relire `docs/cahier-de-recette.md` et revérifier d'abord les lignes « À toi » que Juliana aura testées. Idée la plus utile : un compte de test avec un faux Supabase pour pouvoir faire le contrôle visuel (Playwright).
