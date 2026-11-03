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
- `lib/analyze-queue.ts` + `components/analyze-all.tsx` : « Tout analyser » (file par meilleur pré-score, arrêt propre sur limite d'IA ou budget du jour).
- `lib/quota.ts` : budget d'actions IA par jour (60 par défaut, une analyse d'offre = 2).
- `app/admin/page.tsx`, `lib/admin.ts` (logique pure, testée), `lib/admin-guard.ts` (porte), `lib/admin-data.ts` (comptes par la clé de service) : partie admin, réservée aux adresses de `OWNER_EMAILS`. Tout nouvel écran technique (clés, installation, comptes, usage) va là, jamais dans les pages des utilisateurs. `handle()` (`lib/http.ts`) masque aux non-admins les messages d'erreur qui nomment une variable, Vercel, Supabase ou du SQL : écrire ces messages sans crainte, mais garder un message clair pour l'utilisateur quand il peut agir.
- `lib/reauth.ts` (logique pure, testée), `middleware.ts`, `app/api/auth/trust/route.ts`, `components/two-factor.tsx` : reconnexion espacée. Session fermée après 90 jours (30 pour l'admin) depuis la dernière authentification ; code à 6 chiffres non redemandé sur un appareil de confiance (cookie `jp_trust` signé avec `SUPABASE_SERVICE_ROLE_KEY`, même durée).
- `lib/bookmarklet.ts`, `app/importer/page.tsx`, `lib/offer-header.ts` : favori « Envoyer à JobPilot ».
- `components/reason-chips.tsx`, `lib/types.ts` : raisons d'écart, « Autre » avec pourquoi libre.

## Comportements voulus à ne pas casser
- Offres & CV ne montre que ce qu'il reste à traiter. Postulé, abandonné ou refusé : c'est dans Suivi.
- Suivi : « En cours » cache Refusé / Abandonné / Offre plus disponible ; « Tout » les affiche.
- Un seul pourcentage par offre : celui de l'analyse complète. Pour une offre analysée d'après un simple extrait (Indeed…), il est marqué « estimé » (`analysis.estimated`) jusqu'à la lecture de l'annonce entière via le favori.
- Ce que l'annonce ne dit pas n'est jamais un point négatif. La séniorité non écrite est « Non précisé ».
- Nulle part (accueil, Recommandées, Tri rapide, Recherche) d'étiquette « Peu probable » : une étoile ou un pourcentage de pré-tri seulement sur les offres vraiment proches du profil (≥ 70).
- Le tableau des comptes de `/admin` est anonyme (code court, jamais d'adresse) : le détail d'un compte se consulte dans Supabase. Ne pas y remettre d'emails.
- La balise `google-site-verification` de `app/layout.tsx` prouve à Google que le site est à Juliana (validation du branding de l'écran d'autorisation Gmail) : ne pas la retirer.

## Pas encore fait (à ne pas faire sans demande)
- Photo sur le CV (cadre photo dans le profil maître).
- Adresse email professionnelle pour les pages légales.
- Renforts quand Supabase ou Gemini atteignent leurs limites.
- Où ranger une offre analysée mais pas encore décidée (Recommandées › À trier, ou section « À décider » dans Offres & CV) : question posée à Juliana, pas de réponse.

## Rondes de contrôle
Une ronde = audit + tests + corrections sûres. Elle lit `docs/journal-des-rondes.md` avant de commencer et y ajoute son entrée à la fin.
- `docs/cahier-de-recette.md` : les parcours à pouvoir refaire, avec ce qui est vérifié automatiquement, relu, ou à tester par Juliana. Une ronde le met à jour et y ajoute une ligne pour chaque nouveau parcours.
- `npm test` : tests sans réseau ni vraie IA (dans `tests/`, un fichier = un processus ; ajouter un fichier `*.test.ts` suffit). Les routes ne peuvent exporter que GET/POST…, donc la logique à tester vit dans `lib/`.
- Une ronde corrige seulement ce qui est petit, sûr et testé ; le reste est signalé à Juliana, jamais fait de nuit (migrations, montées de version, changements qui touchent toutes les routes).
