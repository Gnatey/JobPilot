# JobPilot : contexte pour toute session Claude

Appli perso de suivi de candidatures de Juliana (data analyst / BI, France). Elle veut l'ouvrir à ses amis plus tard. On se tutoie, tout est en français.

## Pile et déploiement
- Next.js 15, React 19, Tailwind v4, Supabase (RLS : chaque ligne appartient à un `user_id`).
- IA 100 % gratuite : Gemini, Groq et Mistral avec bascule automatique (`lib/llm.ts`). Ne jamais ajouter d'API payante.
- Dépôt GitHub `Gnatey/JobPilot`. Un push sur `main` redéploie Vercel tout seul (~1 min 40) : jobpilot-ashy.vercel.app.
- Vérifier avant de livrer : `npm run typecheck`, `npm run build`, `npm test`.
- Journaux Vercel (offre Hobby) : 1 heure seulement. Utiliser `since: "50m"`.

## Règles de collaboration (voulues par Juliana)
- **Paquets** : les petites évolutions sont regroupées et livrées ensemble. Seul un très très très gros bug part tout de suite, et dans ce cas on livre en même temps toutes les évolutions en attente.
- Faire les changements directement dans les fichiers, sans allers-retours inutiles.
- Retour honnête et réaliste, jamais de flatterie. Dans le doute, vérifier avant de douter d'elle.
- Après chaque livraison : un court bilan en français.
- Jamais de clé ou de secret dans le chat ni dans le dépôt : les clés vont directement dans Vercel.
- Pas de migration de base automatique : toute évolution du schéma est additive, écrite dans `supabase/` et signalée à Juliana pour qu'elle la lance. Préférer ranger une donnée dans une colonne existante (ex. `reject_reason` porte « autre: texte »).

## Où est quoi
- `lib/llm.ts` : chaîne d'IA (Gemini, Groq, Mistral), reprises, plafonds, messages d'erreur par fournisseur.
- `lib/ai.ts` : extraction d'offre, analyse (score), CV, lettre, diagnostics.
- `lib/fit.ts`, `lib/fit-stock.ts`, `lib/quick-score.ts` : filtre « adapté à mon profil » et pré-score gratuit (sans IA).
- `lib/offer-ops.ts`, `lib/app-pick.ts` : offres, candidatures, doublons (une offre = une seule ligne « À postuler »).
- `lib/sources/` : sources d'offres automatiques (Adzuna, Jooble ; clés dans Vercel, facultatives). `searchAll` les interroge en parallèle (une source en panne n'arrête pas l'autre, doublons entre sources écartés), `probeSources` sert au bouton « Tester les sources » d'Administration. Une clé ne doit jamais apparaître dans un message d'erreur (celle de Jooble est dans l'adresse). France Travail n'est volontairement pas branché (API réservée) ; `tests/sources.test.ts`.
- `lib/analyze-queue.ts` + `components/analyze-all.tsx` : « Tout analyser » (file par meilleur pré-score, arrêt propre sur limite d'IA ou budget du jour).
- `lib/quota.ts` : budget d'actions IA par jour (60 par défaut, une analyse d'offre = 2).
- `app/admin/page.tsx`, `lib/admin.ts` (logique pure, testée), `lib/admin-guard.ts` (porte), `lib/admin-data.ts` (comptes par la clé de service) : partie admin, réservée aux adresses de `OWNER_EMAILS`. Tout nouvel écran technique (clés, installation, comptes, usage) va là, jamais dans les pages des utilisateurs. `handle()` (`lib/http.ts`) masque aux non-admins les messages d'erreur qui nomment une variable, Vercel, Supabase ou du SQL : écrire ces messages sans crainte, mais garder un message clair pour l'utilisateur quand il peut agir.
- `lib/paged.ts` : `fetchAll` lit une table page après page. Toute requête qui lit TOUTE une table (statistiques, apprentissage, doublons, file « Tout analyser »…) doit l'utiliser avec un `.order("id")` : Supabase coupe sinon à 1 000 lignes sans le dire, et un `limit(N)` avec N > 1 000 n'y change rien (`tests/paged.test.ts` interdit ces `limit`). Les candidatures se lisent par `loadApplications` (`lib/applications.ts`, accueil, Suivi, rechargement de Suivi) et jamais avec un `limit` ; Offres & CV lit offres, CV, candidatures et recommandations par `fetchAll` ; les onglets de Recommandées affichent des totaux exacts (`olderThanLoaded`) même quand la liste chargée est plus courte (`tests/applications.test.ts` le vérifie).
- `lib/token-crypto.ts` (logique pure, testée), `lib/gmail-token.ts` : jetons Gmail chiffrés en base (AES-GCM, `enc:v1:`, clé = `TOKEN_ENCRYPTION_KEY` sinon dérivée de `SUPABASE_SERVICE_ROLE_KEY`, liée à la personne). Ne jamais lire `gmail_accounts.refresh_token` sans `readRefreshToken` / `openToken`, ni l'écrire sans `sealToken`. Les anciens jetons en clair sont lus puis chiffrés au passage.
- `lib/reauth.ts` (logique pure, testée), `middleware.ts`, `app/api/auth/trust/route.ts`, `components/two-factor.tsx` : reconnexion espacée. Session fermée après 90 jours (30 pour l'admin) depuis la dernière authentification ; code à 6 chiffres non redemandé sur un appareil de confiance (cookie `jp_trust` signé avec `SUPABASE_SERVICE_ROLE_KEY`, même durée).
- `lib/rate-limit.ts` + fin de `scripts/upgrade.sql` (fonction SQL `rate_limit`, table `rate_hits`) : limite de requêtes par personne (`LIMITS` : mot de passe, suppression, export, test des sources). Ouverte en cas de panne ou si la base n'est pas à jour. Une nouvelle route coûteuse ou sensible : ajouter un seau dans `LIMITS` et appeler `rateLimit(supabase, "…")` juste après `requireUser()`.
- `.github/workflows/verifications.yml` (+ `tests/ci.test.ts`) : GitHub Actions à chaque envoi (types, tests, construction, `npm audit`). Node 24 comme le projet Vercel. `package.json` › `overrides.next.postcss` règle la faille `postcss` de Next 15 : à retirer après la montée vers Next 16 (essai concluant fait dans une copie le 5 novembre, pas mis en ligne : attend l'accord de Juliana ; `middleware.ts` y devient `proxy.ts`).
- **Migrations de base** : la source est `scripts/upgrade.sql` ; `node scripts/gen-migration.mjs` en tire `supabase/upgrade.sql` et `lib/migration-sql.ts` (bouton « Copier le script » d'Administration › Installation) ; recopier aussi le bloc à la fin de `supabase/schema.sql` ; ajouter la sonde correspondante dans `dbOk` (`app/admin/page.tsx`). Toujours additif et rejouable.
- `lib/csp.ts` + `next.config.ts` : politique de sécurité du navigateur (CSP). Tout nouvel appel du navigateur vers un autre service (fetch, image, police…) doit y être ajouté, `tests/csp.test.ts` le réclame. `script-src` garde `'unsafe-inline'` (Next.js). Pas d'en-tête COOP : le favori « Envoyer à JobPilot » a besoin de l'onglet qui l'a ouvert.
- `app/globals.css`, `tests/contrast.test.ts`, `tests/titles.test.ts` : accessibilité. Texte posé sur un fond plein rouge ou vert : `text-on-solid` (jamais `text-white`, illisible en sombre). Petit lien ou bouton de texte : classe `hit` (zone de toucher élargie sur écran tactile). Chaque page a un titre d'onglet unique ; une page « use client » le reçoit d'un `layout.tsx` voisin. Une couleur du thème qui change doit garder le contraste AA (le test le vérifie, clair et sombre).
- `tests/sql-rls.test.ts` : vraie base PostgreSQL locale (PGlite). Toute nouvelle table doit avoir la sécurité par ligne et une politique `user_id = auth.uid()` ; une table sans politique exprès (comme `rate_hits`) se déclare dans `NO_POLICY`.
- `lib/bookmarklet.ts`, `app/importer/page.tsx`, `lib/offer-header.ts` : favori « Envoyer à JobPilot ».
- `components/fit-page.tsx`, `lib/print-layout.ts`, `components/document-view.tsx`, `app/globals.css` (bloc `@media print`) : CV et lettres tiennent sur une page A4. FitPage mesure sur 184 × 271 mm ; la feuille imprimée a une largeur minimale de 184 mm (sinon l'iPhone, qui met la page en forme plus étroite, déborde sur 2 pages) ; le titre de la page = nom du fichier PDF tant que le document est affiché (l'impression de l'iPhone est asynchrone). Ne pas remettre le titre à `afterprint`, ne pas utiliser `@media (width)` en impression.
- `components/reason-chips.tsx`, `lib/types.ts` : raisons d'écart, « Autre » avec pourquoi libre.

## Comportements voulus à ne pas casser
- Offres & CV ne montre que ce qu'il reste à traiter. Postulé, abandonné ou refusé : c'est dans Suivi.
- Suivi : « En cours » cache Refusé / Abandonné / Offre plus disponible ; « Tout » les affiche.
- Un seul pourcentage par offre : celui de l'analyse complète. Pour une offre analysée d'après un simple extrait (Indeed…), il est marqué « estimé » (`analysis.estimated`) jusqu'à la lecture de l'annonce entière via le favori.
- Ce que l'annonce ne dit pas n'est jamais un point négatif. La séniorité non écrite est « Non précisé ».
- Nulle part (accueil, Recommandées, Tri rapide, Recherche) d'étiquette « Peu probable » : une étoile ou un pourcentage de pré-tri seulement sur les offres vraiment proches du profil (≥ 70).
- Une offre analysée mais pas décidée reste dans Recommandées › À trier, avec son score. « Je candidate » (À postuler) → Offres & CV ; postulée → Suivi. Offres & CV ne liste pas les offres encore à trier dans Recommandées (`lib/offers-todo.ts`) ; seules les analyses faites à la main y sont « À décider ».
- Pages indexables par Google : l'accueil visiteur et les deux pages légales (`lib/site.ts` en tient la liste ; `robots.txt` les ouvre avec les fichiers qu'il faut pour les afficher, `sitemap.xml` les annonce ; `tests/robots.test.ts` vérifie qu'aucune autre ne l'est). Tout le reste est fermé et en « noindex ».
- Supprimer son compte exige une connexion de moins de 10 minutes (`recentlyAuthenticated`, `app/api/account/delete`) : marche avec mot de passe ou lien par e-mail. L'export de données ne contient jamais le jeton Gmail.
- Contenu venu de Gmail (tri des emails, alertes) : jamais envoyé à Mistral, dont l'offre gratuite peut entraîner ses modèles (règle « Limited Use » de Google) : option `noTraining` de `structured()` (`lib/llm.ts`). Toute nouvelle fonction d'IA qui lit des emails doit la poser ; la page Confidentialité (section Gmail) le promet.
- Le tableau des comptes de `/admin` est anonyme (code court, jamais d'adresse) : le détail d'un compte se consulte dans Supabase. Ne pas y remettre d'emails.
- La balise `google-site-verification` de `app/layout.tsx` prouve à Google que le site est à Juliana (validation du branding de l'écran d'autorisation Gmail) : ne pas la retirer.

## Refonte en cours
Juliana a demandé (5 novembre 2026) une refonte complète, dans l'ordre de `docs/plan-refonte.md` (paquets 1 à 5). Elle a d'abord voulu valider chaque paquet, puis a dit « non lance tout » : les paquets s'enchaînent, chacun testé, livré, suivi d'un court bilan. S'arrêter seulement pour ce qui dépend d'elle (SQL à lancer, adresse e-mail pour les pages légales, choix de la stratégie d'IA partagée) et prévenir avant de mettre en ligne une montée de version majeure (Next 16). Avancement : voir `docs/plan-refonte.md` et `docs/journal-des-rondes.md`.

## Pas encore fait (à ne pas faire sans demande)
- Photo sur le CV (cadre photo dans le profil maître).
- Adresse email professionnelle pour les pages légales.
- Renforts quand Supabase ou Gemini atteignent leurs limites.

## Rondes de contrôle
Une ronde = audit + tests + corrections sûres. Elle lit `docs/journal-des-rondes.md` avant de commencer et y ajoute son entrée à la fin.
- `docs/cahier-de-recette.md` : les parcours à pouvoir refaire, avec ce qui est vérifié automatiquement, relu, ou à tester par Juliana. Une ronde le met à jour et y ajoute une ligne pour chaque nouveau parcours.
- `npm test` : tests sans réseau ni vraie IA (dans `tests/`, un fichier = un processus ; ajouter un fichier `*.test.ts` suffit). Les routes ne peuvent exporter que GET/POST…, donc la logique à tester vit dans `lib/`.
- Une ronde corrige seulement ce qui est petit, sûr et testé ; le reste est signalé à Juliana, jamais fait de nuit (migrations, montées de version, changements qui touchent toutes les routes).
