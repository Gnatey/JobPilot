# Cahier de recette

Chaque ligne est un parcours à pouvoir refaire. La colonne **Contrôle** dit honnêtement comment c'est vérifié aujourd'hui :

- **Auto** : un test (`npm test`) ou un essai sur le vrai serveur de production le vérifie à chaque ronde.
- **Code** : relu dans le code, sans exécution réelle.
- **À toi** : demande un vrai compte, une vraie IA ou un vrai site ; une ronde nocturne ne peut pas le faire seule.

Une ronde met à jour la colonne « Dernière vérif. » quand elle revérifie une ligne, et ajoute une ligne quand une évolution crée un nouveau parcours.

## Accès et compte

| # | Parcours | Résultat attendu | Contrôle | Dernière vérif. |
|---|----------|------------------|----------|-----------------|
| 1 | Ouvrir une page privée sans être connectée (`/suivi`, `/offres`, `/profil`, `/stats`, `/parametres`, `/importer`…) | Renvoi vers `/login` | Auto (essai serveur) | 2026-11-02 |
| 2 | Appeler une route `/api/...` sans session | Réponse 401 « Non connecté », rien de lu ni d'écrit | Auto (essai serveur) | 2026-11-02 |
| 3 | Pages publiques (`/`, `/login`, mentions légales, confidentialité) | S'affichent sans connexion. `/configuration` n'est plus publique une fois l'app configurée (voir 39) | Auto (essai serveur) | 2026-11-02 |
| 4 | Connexion par lien : `/auth/callback?next=…` | Va seulement vers une page de JobPilot, jamais vers un autre site (`//x`, `/\x`, `https://x`…) | Auto (tests + serveur) | 2026-11-02 |
| 5 | Créer un compte, se connecter (mot de passe ou lien par email) | Arrive sur l'accueil ou « Bienvenue » | À toi | |
| 6 | Mot de passe oublié | Le lien mène à Paramètres pour en choisir un nouveau | Code | 2026-11-02 |
| 7 | Vérification en deux étapes activée | Après le mot de passe, seule la page du code est accessible (sauf appareil de confiance, voir 46-48) | Auto (essai local, faux Supabase, session au niveau mot de passe) ; vrai code de l'application : À toi | 2026-11-03 |
| 8 | Exporter mes données | Fichier avec toutes mes lignes, et seulement les miennes | Code | 2026-11-02 |
| 9 | Supprimer mon compte (taper SUPPRIMER) | Compte et données supprimés, accès Gmail révoqué | À toi | |
| 10 | Un compte voit-il les données d'un autre ? | Non : chaque table filtre sur `user_id = auth.uid()` | Code (SQL des 12 tables) | 2026-11-02 |

## Offres & CV

| # | Parcours | Résultat attendu | Contrôle | Dernière vérif. |
|---|----------|------------------|----------|-----------------|
| 11 | Ajouter une offre par son lien (Welcome to the Jungle, site d'entreprise…) | L'annonce est lue, analysée, rangée dans Offres & CV | À toi | |
| 12 | Même chose avec un lien Indeed, LinkedIn ou Glassdoor | Si la page est bloquée, le message nomme le site et propose le favori ou le collage du texte | Auto (messages) | 2026-11-02 |
| 13 | Lien d'une annonce retirée | « Offre plus disponible » (pas d'analyse inventée) | Auto (`looksGone`, `readOffer`) | 2026-11-02 |
| 14 | Favori « Envoyer à JobPilot » sur une annonce | Le bandeau (salaire, expérience, études, contrat) accompagne la description ; séniorité non écrite = « Non précisé » | Auto (bandeau) ; rendu réel : À toi | 2026-11-02 |
| 15 | « Tout analyser » | Une offre à la fois, meilleur pré-score d'abord, progression visible, arrêt propre sur limite d'IA ou budget du jour, reprise d'un clic | Auto (ordre de la file) ; déroulé réel avec l'IA : À toi | 2026-11-02 |
| 16 | Offre Indeed analysée sur un extrait | Pourcentage marqué « estimé » jusqu'à la lecture de l'annonce entière | Auto (file) ; affichage : À toi | 2026-11-02 |
| 17 | Une offre = une seule ligne « À postuler » | Pas de doublon, la ligne annotée n'est jamais supprimée | Auto (`dups.test.ts`) | 2026-11-02 |
| 18 | Offres & CV ne montre que ce qu'il reste à traiter | Postulé, abandonné, refusé : seulement dans Suivi | Code | 2026-11-02 |
| 19 | Générer CV et lettre pour une offre | Documents créés ; si toutes les IA sont indisponibles, le message dit lesquelles et pourquoi, rien n'est perdu | Auto (chaîne d'IA) ; génération réelle : À toi | 2026-11-02 |

## Recherche, recommandations, accueil

| # | Parcours | Résultat attendu | Contrôle | Dernière vérif. |
|---|----------|------------------|----------|-----------------|
| 20 | Trier une recommandation et écarter avec une raison | La raison est gardée et compte dans les statistiques | Auto (helpers de raisons) | 2026-11-02 |
| 21 | Raison « Autre » | Champ « Pourquoi ? » facultatif ; « Valider sans préciser » possible ; Échap annule ; texte limité à 200 caractères | Auto (helpers) ; interface : À toi | 2026-11-02 |
| 22 | Accueil, Recommandées, Tri rapide, Recherche | Nulle part d'étiquette « Peu probable » ni de pourcentage de pré-tri bas ; une étoile seulement sur les offres vraiment proches (≥ 70) ; boutons alignés avec le titre quand il n'y a pas d'étoile | Auto (`isClose`, rendu local sans « Peu probable » ni débordement) ; visuel sur vraies données : À toi | 2026-11-03 |
| 23 | Recherche avec critères et sources | Résultats filtrés, pré-score affiché | À toi | |
| 24 | Tâche automatique du matin (cron) | Refuse tout appel sans le bon secret (401, même avec « Bearer undefined ») ; sinon lit Gmail, relance les recherches, prépare les offres | Auto pour le refus ; exécution réelle : À toi | 2026-11-02 |

## Suivi, agenda, stats

| # | Parcours | Résultat attendu | Contrôle | Dernière vérif. |
|---|----------|------------------|----------|-----------------|
| 25 | Suivi : colonnes | Une colonne longue défile dans sa hauteur au lieu d'allonger la page | À toi (visuel) | |
| 26 | Suivi : « En cours » / « Tout » | « En cours » cache Refusé, Abandonné, Offre plus disponible ; « Tout » les montre | Code | 2026-11-02 |
| 27 | Agenda à s'abonner (Paramètres) | Adresse secrète ; jeton inconnu = 404 ; entretiens et relances avec `;` `,` et retours à la ligne bien échappés | Auto (jeton) ; échappement vérifié ; abonnement réel : À toi | 2026-11-02 |
| 28 | Connexion Gmail | Retour refusé si l'état de sécurité ne correspond pas au cookie | Code | 2026-11-02 |
| 29 | Statistiques des refus et raisons | « Autre : texte » compté comme « Autre » | Auto (`reasonKey`) | 2026-11-02 |

## IA et budget

| # | Parcours | Résultat attendu | Contrôle | Dernière vérif. |
|---|----------|------------------|----------|-----------------|
| 30 | Mistral refuse un modèle hors offre gratuite (403) | Bascule vers un autre modèle Mistral, puis Groq si tous sont refusés ; une vraie clé invalide (401) reste annoncée comme telle | Auto (`llm-mistral.test.ts`) ; noms de modèles réels : À toi | 2026-11-02 |
| 31 | Toutes les IA indisponibles | Message qui nomme chaque IA et la cause (clé ou modèle refusé, limite atteinte…) | Auto | 2026-11-02 |
| 32 | Budget d'actions IA du jour atteint (60 par défaut, une analyse = 2) | Message clair, arrêt propre de « Tout analyser », reprise le lendemain | Code ; plafond non contournable côté client (SQL `spend_ai`) | 2026-11-02 |

## Administration (réservée aux adresses de OWNER_EMAILS)

| # | Parcours | Résultat attendu | Contrôle | Dernière vérif. |
|---|----------|------------------|----------|-----------------|
| 33 | Compte ordinaire ouvre `/admin` | Page « introuvable » (rien sur les comptes, les clés ou l'installation) ; pas d'entrée « Administration » dans le menu ni dans Réglages | Auto (essai local, faux Supabase) | 2026-11-03 |
| 34 | Visiteur déconnecté ouvre `/admin` ou `/configuration` | Renvoi vers `/login` | Auto (essai local) | 2026-11-03 |
| 35 | Admin ouvre `/admin` (bureau et téléphone) | Comptes et usage de l'IA, installation, sources d'offres, liens ; aucun débordement ni erreur console ; menu « Administration » | Auto (faux Supabase) ; vraie liste de comptes : À toi | 2026-11-03 |
| 36 | `POST /api/health/ai` (test des IA) | 404 pour un compte ordinaire et un visiteur ; l'admin passe la garde | Auto (essai local) ; réponse réelle des IA : À toi | 2026-11-03 |
| 37 | Erreur technique (nom de clé, Vercel, Supabase, SQL) renvoyée par une route | Message simple pour un compte ordinaire, message complet pour l'admin ; le détail reste dans les journaux | Auto (`admin.test.ts` : 10 messages techniques masqués, 6 messages normaux gardés, vrai message de limite du jour gardé) ; affichage réel : Code | 2026-11-03 |
| 38 | Calculs de `/admin` : IA du jour et sur 7 jours, tri, au plafond, comptes sans adresse, liste vide | Chiffres justes | Auto (`admin.test.ts`) | 2026-11-03 |
| 39 | `/configuration` | Redirige vers `/admin` dès que Supabase est configuré ; reste publique tant qu'il ne l'est pas (personne ne peut alors se connecter) | Auto (essai local, cas configuré) ; cas non configuré : Code | 2026-11-03 |
| 40 | Accueil sans clé d'IA | Le rappel « Ajoute la clé IA gratuite » n'apparaît que pour l'admin, avec un lien vers `/admin` | Auto (essai local) | 2026-11-03 |
| 41 | Porte de `/admin` : adresse dans OWNER_EMAILS **et** adresse confirmée selon Supabase | Un compte non confirmé qui porterait la même adresse n'entre pas | Code (le faux Supabase répond toujours « confirmée ») | 2026-11-03 |
| 42 | Page Confidentialité | Dit ce que l'admin voit (liste de comptes anonyme, dates, usage IA, nombre de candidatures) et jamais le contenu ; décrit aussi le cookie de session (90 jours) et le cookie facultatif « appareil de confiance » | À toi : relire le texte | |
| 43 | Balise `google-site-verification` sur la page d'accueil publique (preuve de propriété pour Google Search Console, requise pour valider le branding de l'écran Gmail) | La balise est dans le HTML de `/` pour un visiteur déconnecté | Auto (build + serveur local, 2026-11-03) ; en ligne : voir journal | 2026-11-03 |
| 44 | Tableau « Comptes » de `/admin` | Aucune adresse email : un code court (8 premiers caractères de l'identifiant), « Toi » sur ta ligne, bouton qui copie l'identifiant complet pour le retrouver dans Supabase (Authentication > Users) | Auto (`admin.test.ts` + rendu local : aucune adresse dans la page, copie vérifiée) ; vrais comptes : À toi | 2026-11-03 |
| 45 | Session limitée : 90 jours (30 pour l'admin) depuis la dernière authentification (mot de passe, lien ou code) | Au-delà, la session est fermée sur cet appareil seulement, renvoi vers `/login` avec un message ; l'API répond 401 | Auto (`reauth.test.ts` + essai local avec jetons à 89, 91, 29 et 31 jours) ; durée réelle : À toi (attendre un mois pour l'admin) | 2026-11-03 |
| 46 | Page du code à 6 chiffres : case « Ne plus demander le code sur cet appareil pendant 90 jours » (30 pour l'admin), cochée par défaut | Cochée : cookie `jp_trust` posé (HttpOnly, signé) et plus de code aux connexions suivantes sur cet appareil ; décochée : code redemandé | Auto (vrai navigateur, faux Supabase, code factice) ; vraie application d'authentification : À toi | 2026-11-03 |
| 47 | Cookie `jp_trust` falsifié, d'une autre personne, signé avec une autre clé, trop vieux (> 90 jours, > 30 pour l'admin) ou daté du futur | Refusé : le code est demandé | Auto (`reauth.test.ts` + essai local) | 2026-11-03 |
| 48 | `POST /api/auth/trust` | 401 sans session ou avant le code ; 403 si le code date de plus de 2 minutes ; 503 sans clé de service ; sinon pose le cookie | Auto (essai local) | 2026-11-03 |
| 49 | Sans `SUPABASE_SERVICE_ROLE_KEY` dans Vercel | La case est masquée (le code est demandé à chaque connexion) ; la session limitée à 90 / 30 jours fonctionne quand même | Auto (essai local) | 2026-11-03 |
| 50 | Page du code après un bon code | Arrive sur l'accueil sans rester bloquée sur la saisie (rechargement complet) | Auto (vrai navigateur) ; chez toi : À toi | 2026-11-03 |
| 51 | Offre analysée depuis Recommandées (« Voir le diagnostic »), rien décidé | Elle reste dans Recommandées › À trier, avec son pourcentage (« analyse complète ») ; elle n'est pas dans Offres & CV (une note dit « N offres analysées attendent ta décision dans Recommandées ») | Auto (`offers-todo.test.ts` + rendu local) ; vraies données : À toi | |
| 52 | « Je candidate » sur une offre (analysée ou non) | Elle quitte Recommandées, toast « Ajoutée à Offres & CV », elle apparaît dans Offres & CV (À postuler) ; une fois postulée (« Envoyée »), elle est dans Suivi et plus dans Offres & CV | Auto (`offers-todo.test.ts`) ; toast et parcours complet : À toi | |
| 53 | Offre analysée à la main (lien ou texte collé), jamais passée par Recommandées | Reste dans Offres & CV, état « À décider » (seul endroit où elle peut être) | Auto (`offers-todo.test.ts` + rendu local) | |
| 54 | « Voir le diagnostic » sur une offre sans texte lisible (Indeed…) | Message « Je n'ai pas le texte complet… », page « Analyser une offre » avec le **lien déjà rempli** et la zone de collage ; au retour, le bouton n'est pas resté sur « Analyse en cours… » | Auto (rendu local avec réponse 422 simulée) ; vrai Indeed : À toi | |
| 55 | **CV ou lettre en PDF depuis un iPhone** (Télécharger en PDF → Enregistrer dans Fichiers) | **1 seule page A4** (mêmes retours à la ligne que l'aperçu « Tient sur 1 page ») et le fichier proposé s'appelle `CV_NOM_Prénom_Titre_du_poste` (jamais « Document ») | Auto : titre de la page réglé en permanence, même si « afterprint » part tout de suite (rendu local, téléphone simulé) ; mise en page identique de 527 à 695 px de large sur 4 modèles de CV et une lettre (Chromium) ; `tests/print-layout.test.ts`. **iPhone réel (WebKit) : À toi, voir le journal** | |

