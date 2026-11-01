# JobPilot

Ta plateforme de recherche d'emploi : elle trouve les offres, les score par rapport à ton parcours, les range, et prépare CV, lettre et entretien quand tu le décides.

## Ce que fait l'app

| Écran | Rôle |
|---|---|
| **Aujourd'hui** | Le « cap du jour » en une phrase et un gros bouton : entretien à préparer, relance due, candidature à envoyer ou offres à trier. Colle un lien d'offre en haut : l'analyse démarre toute seule |
| **Recommandées** | Les offres lues dans tes alertes emploi (LinkedIn, Indeed, APEC, WTTJ…) et tes recherches sauvegardées, triées par compatibilité. **Je candidate** les envoie dans le suivi, **Pas pour moi** les range dans les **Écartées** avec une raison (annulable). Bouton « Écarter sous X % » pour vider d'un coup les offres faibles |
| **Tri rapide** | Une offre à la fois, en plein écran : glisse à droite pour candidater (elle arrive dans Offres & CV, à postuler), à gauche pour ne pas postuler (elle part dans Suivi, en **Abandonné**, avec sa raison ; annulable). Flèches du clavier, 1 à 9 et 0 pour la raison. 30 offres triées en 2 minutes |
| **Suivi** | Ton « Notion » : liste, tableau ou **calendrier du mois** (entretiens, relances à faire, envois : un clic sur un jour liste les événements, un clic sur un événement ouvre la fiche), glisser-déposer, relances, date et heure des entretiens, historique des statuts, documents rattachés, classement des candidatures sans nouvelles depuis 3 semaines, export CSV. Icône d'origine (offre analysée ou saisie à la main), fiche en lecture seule d'un clic, bouton **Agenda** (relances et entretiens dans Google Agenda ou Apple Calendrier) |
| **Offres & CV** | Ce qu'il te reste à traiter : offres à postuler ou pas encore tranchées (les autres sont dans Suivi). **Refaire l'analyse** (une analyse du quota du jour), **Supprimer** une offre, **Je ne postule pas** (→ Suivi, Abandonné). Score détaillé, mots-clés présents ou manquants, modèle de CV conseillé, liens pour se renseigner sur l'entreprise (avis, santé financière, actualités). CV, LM (lettre de motivation) et préparation d'entretien en un clic |
| **CV** | Enregistrement automatique, couverture des mots-clés de l'offre en direct, nom du PDF automatique, bouton « J'ai envoyé ma candidature » (statut et relance à 7 jours mis à jour) |
| **Recherche** | Jusqu'à 3 postes (liste déroulante par familles de métiers ou saisie libre), zone (France, départements ou villes), contrat, ancienneté : tout se coche et se décoche. Interroge Adzuna et Jooble si tu as branché une clé (sinon, liens préremplis vers LinkedIn, Indeed, WTTJ, France Travail…) ; ta dernière recherche est mémorisée ; « Recevoir chaque matin » la relance automatiquement. Villes cherchées par nom, code postal ou numéro de département. Section **Chercher aussi sur les autres sites** : Indeed, LinkedIn, HelloWork, Welcome to the Jungle, Meteojob, APEC, France Travail ouvrent leur page de résultats avec ton poste et ta zone déjà remplis |
| **Stats** | Répartition des candidatures par statut (camembert ; les offres abandonnées sans avoir postulé n'y comptent pas), taux de réponse en phrases lisibles par site, par CV, par score et par contrat, raisons d'écart, et un diagnostic IA avec un objectif chiffré pour la semaine |
| **Page d'accueil publique** | Ce que voit un visiteur sur `/` : à quoi sert le site, aperçus de l'appli (données fictives), étapes, questions fréquentes, boutons « Créer mon espace » et « Se connecter ». Toutes les autres pages demandent d'être connecté |
| **Questionnaire d'accueil (première connexion)** | Listes déroulantes avec recherche : postes par familles de métiers (comme Indeed ou Welcome to the Jungle), secteurs, zone (France, départements ou villes via geo.api.gouv.fr). Boutons à cocher et à décocher, plusieurs tranches d'expérience possibles. Sept réponses obligatoires (postes, contrats, zone, expérience, disponibilité, durée de recherche, candidatures par semaine), le reste est facultatif ; un brouillon est gardé si la page se recharge. Ces réponses règlent aussi la page Recherche |
| **Diagnostic (étape 2, facultative)** | Dépôt d'un ou plusieurs CV (PDF, Word), puis diagnostic : score, positionnement, crédibilité, lecture ATS, plan d'action. L'analyse tourne en arrière-plan : la page affiche l'avancement et se met à jour toute seule, tu peux la quitter ; en cas d'échec, un bouton relance sans redéposer le fichier. Ton profil maître est créé automatiquement. « Passer cette étape » enregistre les réponses sans CV ; le CV se dépose plus tard depuis « Mon CV » |
| **Mon CV** | Redépose une nouvelle version : analyse, progrès depuis la dernière fois, mise à jour du profil en un clic (rien n'est supprimé) |
| **Profil maître** | Tout ton parcours, modifiable sans JSON (expériences, formations, projets, langues…) et enregistré automatiquement. Chaque CV est taillé à partir d'ici, rien n'est inventé |
| **Réglages** | Vérification de l'installation (IA, base, Gmail, tâche du matin), **récap du matin par email** (facultatif, envoyé à toi seul), avec bouton « Tester l'IA », objectif hebdomadaire, favori « Analyser avec JobPilot », apparence clair / sombre, compte (adresse, déconnexion, changement de mot de passe avec l'ancien, **vérification en deux étapes** facultative par application d'authentification), export et suppression de tes données |

### Gagner du temps

- **L'IA te souffle ce que tu sais déjà sans l'avoir écrit** : Profil maître → « Chercher ce que je sais déjà ». Chaque proposition cite l'élément de ton profil qui la justifie (Jira et Planner → Trello ; GitHub → Git ; Master Data Management → qualité des données). Rien n'est ajouté sans ton « Oui, je sais » ; un « Non » n'est plus reproposé. Sur une offre analysée, les mots-clés absents que ton profil rend plausibles te sont aussi proposés.

- **Ctrl+K** (⌘K sur Mac) : recherche partout, et raccourcis vers toutes les actions.
- **Favori « Analyser avec JobPilot »** (Réglages) : sur LinkedIn, Indeed ou n'importe quel site, un clic envoie l'annonce à l'app.
- **Ctrl+V sur « Analyser une offre »** : colle un lien ou le texte d'une annonce n'importe où sur la page, l'analyse démarre.
- **Partager vers JobPilot** : une fois l'app installée sur ton téléphone (« Ajouter à l'écran d'accueil »), le bouton Partager d'une annonce l'envoie directement à l'analyse.
- **Agenda** (page Suivi, bouton « Agenda ») : relances et entretiens dans Google Agenda ou Apple Calendrier, avec rappel la veille.
- **Offre plus disponible** : « Offre plus disponible » fait partie des raisons d'écart (Recommandées, Tri rapide, fiche d'une offre) ; l'app n'en tire aucune règle sur tes goûts et elle ne compte pas dans ton taux d'acceptation. Dans le Suivi, c'est un statut à part (« Je ne postule pas » avec ce motif, bouton dans la fiche, ou menu de statut). **Postulé puis pas retenu** : bouton « Pas retenu » → Refusé : la candidature n'est ni un refus ni « sans nouvelles ». Quand l'app lit la page d'une annonce (analyse, diagnostic, préparation du matin) et que le site répond « page supprimée » ou affiche « n'est plus disponible / expirée / pourvue », l'offre est rangée toute seule dans les Écartées sans dépenser d'IA.
- **Annulation partout** : chaque tri ou changement de statut affiche un bouton « Annuler » pendant quelques secondes ; sur une offre, « Retirer du suivi » et « Annuler l'envoi » reviennent en arrière.

**Chaque matin vers 7 h**, l'app :
1. lit Gmail : accusés de réception, refus, invitations et alertes emploi ;
2. met les statuts du suivi à jour ;
3. relance tes recherches sauvegardées et range les nouvelles offres dans Recommandées ;
4. calcule le vrai score des meilleures offres.

Elle ne génère aucun CV et n'envoie rien sans toi.

### Les 8 modèles de CV

L'analyse de chaque offre identifie le type d'entreprise et conseille un modèle. Sur la page d'un CV, une galerie montre ton vrai CV dans chaque modèle : un clic suffit pour changer.

| Modèle | Pour |
|---|---|
| **Classique** | Banque, finance, assurance, public, grands groupes |
| **Moderne** | Startups, tech, marketing |
| **ESN / Conseil** | Format « dossier de compétences », avec compétences et missions en premier |
| **Compact ATS** | Grosses plateformes RH, candidatures très filtrées |
| **Deux colonnes** | PME, industrie, commerce : compétences et langues dans une colonne latérale |
| **Chronologique** | Parcours long, reconversion : les dates en marge |
| **Élégant** | Luxe, mode, communication, culture : sobre, avec une touche de serif |
| **Bandeau couleur** | Marketing, e-commerce, design : en-tête coloré, compétences en pastilles |

**Toujours une page** : si le CV dépasse, le texte est réduit petit à petit (jusqu'à 86 %). Si cela ne suffit pas, la page le dit et propose de raccourcir ou de passer au modèle Compact. Le fichier PDF s'appelle « CV - Prénom NOM ».

Les modèles Classique, Moderne, ESN, Compact et Chronologique restent lisibles par les logiciels de tri ; les modèles à colonnes ou à bandeau sont plus graphiques, à réserver aux candidatures par email ou à un humain.

### La lettre de motivation

La lettre est écrite en quatre paragraphes courts (accroche propre à l'entreprise, deux preuves tirées de ton profil, clôture), avec « Madame, Monsieur, », formule finale, place pour la signature et ton nom. Elle ne reprend pas les formules de l'annonce, n'invente aucun chiffre et signale dans « À vérifier avant d'envoyer » ce qu'elle n'a pas pu appuyer sur ton profil.

Six modèles, assortis à ceux du CV (le modèle de la lettre est choisi d'après le CV de la même offre, et la galerie montre ta vraie lettre dans chacun) : **Classique**, **Moderne**, **Élégant**, **Bandeau couleur**, **Sobre** (ESN, conseil, plateformes RH) et **Colonne** (coordonnées en marge). Tout se modifie en cliquant sur le texte : « Entrée » ouvre un nouveau paragraphe, un paragraphe vidé disparaît, la date et le destinataire se réécrivent. Une page, comme le CV ; les coordonnées et le lien LinkedIn sont cliquables dans le PDF. Les anciennes lettres (texte libre) sont remises en forme automatiquement.

Si un CV déjà généré couvre au moins 75 % des mots-clés d'une nouvelle offre, l'app propose de le réutiliser. Elle t'avertit alors de relire le titre et le profil. Chaque CV reste stocké et rattaché à son offre et à sa candidature. Le bouton « PDF » ouvre l'impression : choisis « Enregistrer au format PDF ».

---

## Mise en ligne (environ 30 minutes, entièrement gratuit)

### 1. Supabase (base de données et connexion)
1. Crée un projet sur [supabase.com](https://supabase.com), région Europe.
2. Ouvre **SQL Editor → New query**, colle le contenu de `supabase/schema.sql`, puis **Run**.
   - **Désactive la traduction automatique de Chrome sur supabase.com** : elle traduit aussi le code SQL et fait planter le tableau de bord.
   - Supabase affiche un avertissement « destructive operations » : c'est normal, le script contient des `drop … if exists` qui ne suppriment que ce qu'il recrée lui-même. Confirme avec **Run this query**.
   - Résultat attendu : « Success. No rows returned », puis 11 tables visibles dans **Table Editor** (12 avec les diagnostics de CV).
   - **Tu avais déjà installé une version précédente ?** Ne relance pas ce script : ouvre **Réglages → Installation**. Si « Base de données à jour » est en rouge, clique sur **Copier le script**, colle-le dans le SQL Editor et lance-le (une fois, sans risque, il ne supprime rien). Le fichier `supabase/migration-3-upgrade.sql` contient le même script.
3. Dans **Authentication → URL Configuration**, mets ton adresse Vercel **principale** (celle qui se termine par `.vercel.app`, sans adresse de déploiement longue) dans **Site URL**, et ajoute la même avec `/**` à la fin dans **Redirect URLs** (exemple : `https://jobpilot-ashy.vercel.app/**`). Sans cela, le lien du mail de confirmation mène vers une page inaccessible. Pour un outil personnel, tu peux aussi désactiver **Authentication → Providers → Email → Confirm email** : on se connecte tout de suite après l'inscription.
4. Récupère :
   - le **Project URL** dans **Settings → Data API**. Il ressemble à `https://abcd1234.supabase.co`, sans `/rest/v1` à la fin ;
   - les clés dans **Settings → API Keys** : la **Publishable key** et une **Secret key**.
   - Ne colle jamais la Secret key ailleurs que dans Vercel.

### 2. Clé IA (Gemini, gratuite)
1. Va sur [aistudio.google.com](https://aistudio.google.com), connecte-toi avec ton compte Google, puis clique sur **Get API key → Create API key**.
2. Garde-la pour l'étape 4 (`GEMINI_API_KEY`).

Bon à savoir :
- **Quotas** : ils sont visibles dans AI Studio et se remettent à zéro vers 9 h (heure de Paris). Si le modèle principal est épuisé, l'app bascule seule sur le modèle léger.
- **Données** : en France (UE), Google applique au quota gratuit les mêmes règles de données que pour la version payante. Tes CV et emails ne servent pas à entraîner ses modèles. *(À revérifier dans les conditions de Google AI Studio : elles ont changé fin octobre 2026.)*
- **Ouvrir l'app à d'autres** : en UE, les conditions de Google imposent alors la version payante.
- **Pour Claude à la place** : mets `ANTHROPIC_API_KEY` au lieu de `GEMINI_API_KEY`.

#### Facultatif : répartir la charge avec Groq et Mistral (gratuits)
Quand plusieurs personnes utilisent l'app en même temps, une seule IA gratuite sature vite. Avec deux clés de plus, les tâches sont réparties et chaque fournisseur est le secours des autres.
1. **Groq** : [console.groq.com](https://console.groq.com) → API Keys → Create. Variable : `GROQ_API_KEY`.
2. **Mistral** : [console.mistral.ai](https://console.mistral.ai), plan **Experiment** (gratuit, vérification par téléphone) → API Keys. Variable : `MISTRAL_API_KEY`. Sur l'offre gratuite, Mistral peut entraîner ses modèles avec tes requêtes : dans **Admin Console → Privacy**, désactive **Anonymous improvement data**.
3. Ajoute les clés dans Vercel (Settings → Environment Variables), redéploie, puis **Réglages → Tester l'IA** : chaque fournisseur s'affiche avec son temps de réponse.

Répartition par défaut : tri des emails et extractions → Groq, puis Mistral, puis Gemini. Analyse et CV → Gemini, puis Mistral, puis Groq. Sans ces clés, rien ne change. Les limites gratuites restent des limites (Groq : de l'ordre de 200 000 tokens par jour) : ça absorbe plus de monde, pas une affluence illimitée.

### 3. Code sur GitHub
Le code à mettre sur GitHub, c'est **tout le contenu du fichier `jobpilot.zip`**, pas seulement ce README.

1. Dézippe `jobpilot.zip` : tu obtiens un dossier `jobpilot` avec `app`, `components`, `lib`, `supabase`, `public`, `package.json`…
2. Sur [github.com](https://github.com), clique sur **New repository**, donne-lui un nom (ex. `jobpilot`), choisis **Private**, puis **Create repository**.
3. Sur la page du dépôt vide, clique sur le lien **uploading an existing file**.
4. Ouvre le dossier `jobpilot` et **glisse tout ce qu'il contient**, pas le dossier lui-même. `package.json` doit se retrouver à la racine du dépôt. Inclus bien les fichiers `.gitignore` et `.env.example`.
5. Clique sur **Commit changes**.

Pour mettre à jour plus tard : modifie les fichiers directement sur GitHub (sur la page du dépôt, appuie sur la touche `.` pour ouvrir l'éditeur dans le navigateur) ou refais l'opération **Add file → Upload files**. Vercel redéploie tout seul à chaque commit sur `main`.

### 4. Vercel
1. **Add New → Project**, puis importe le dépôt.
2. Dans **Environment Variables**, ajoute les variables de `.env.example` :

| Variable | Valeur |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Étape 1 |
| `SUPABASE_SERVICE_ROLE_KEY` | Étape 1 (secrète) |
| `GEMINI_API_KEY` | Étape 2 |
| `GROQ_API_KEY`, `MISTRAL_API_KEY` | Facultatif : répartition de la charge (étape 2) |
| `NEXT_PUBLIC_APP_URL` | L'URL Vercel, ex. `https://ton-projet.vercel.app` |
| `CRON_SECRET` | N'importe quelle longue chaîne aléatoire |
| `OWNER_EMAILS` | Ton adresse (plusieurs possibles, séparées par des virgules) : seule à voir Réglages → Installation et Sources, sans plafond d'IA |

3. Clique sur **Deploy**.
4. Ouvre l'app et crée ton compte avec l'adresse que tu as mise dans `OWNER_EMAILS`.

### 5. Gmail (lecture seule)
1. Va sur [console.cloud.google.com](https://console.cloud.google.com) et crée un projet.
2. Dans **APIs & Services → Library**, active la **Gmail API**.
3. Configure l'**OAuth consent screen** :
   - type **External**, statut **Testing** ;
   - ajoute ton adresse dans **Test users** ;
   - scope `gmail.readonly` ; ajoute aussi `gmail.send` (Data Access / Accès aux données) si tu veux le **récap du matin** : il n'est demandé à Google que quand tu l'actives dans Réglages.
4. Dans **Credentials → Create credentials → OAuth client ID** :
   - type **Web application** ;
   - Authorized redirect URI : `https://TON-URL.vercel.app/api/gmail/callback`.
5. Mets `GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET` dans Vercel, puis **Redeploy**.
6. Dans l'app, va dans **Réglages → Connecter Gmail**.
7. Facultatif : **Réglages → Gmail → Activer le récap du matin**. Google demande alors la permission d'envoyer des emails. Chaque matin vers 7 h, un seul email part vers ta propre adresse (entretiens des 3 jours, relances à faire, offres à trier, objectif de la semaine) et rien n'est envoyé s'il n'y a rien de neuf. Le bouton « M'envoyer un test maintenant » le montre tout de suite. Le **dernier envoi** (réussi ou raté) s'affiche dans Réglages.

> En mode « Testing », Google déconnecte l'accès au bout de 7 jours : il suffit de recliquer sur « Connecter Gmail » (le récap affichera « Dernier envoi raté » en attendant ; « Réactiver le récap » le remet en route). Pour supprimer cette limite, publie l'app dans la console Google (voir plus bas).

### 6. Récupérer les offres (rien d'obligatoire)
JobPilot récupère les offres de quatre façons, de la plus simple à la plus automatique. Aucune ne demande de carte bancaire.

1. **Le favori « Envoyer à JobPilot »** (Réglages ou page « Analyser une offre ») : tu glisses un bouton dans ta barre de favoris. Sur n'importe quel site d'offres, un clic envoie ce que tu regardes à JobPilot. Une annonce est analysée tout de suite ; une page de résultats est triée, chaque offre est notée et rangée dans Recommandées. Marche même sur LinkedIn et Indeed, puisque c'est ton navigateur qui lit la page. Pour une page de résultats, le favori lit ensuite les annonces **une à une avec ta propre session** (12 au maximum, une toutes les 2 à 3 secondes, uniquement sur le site où tu te trouves), recalcule les scores sur le texte complet, puis fait le diagnostic complet des 3 meilleures. **Jamais sur LinkedIn**, pour ne pas risquer ton compte. Ton favori ne répond qu'à l'onglet JobPilot qu'il a ouvert. Après une mise à jour de JobPilot, supprime l'ancien favori et glisse le nouveau.
2. **Les alertes emploi dans Gmail** (étape 5) : crée des alertes sur LinkedIn, Indeed, APEC, WTTJ… JobPilot les lit, note chaque offre et les range dans Recommandées.
3. **Copier-coller** : un lien ou le texte d'une annonce dans « Analyser une offre ».
4. **Adzuna et Jooble (facultatif, automatique chaque matin)** :
   - Adzuna : crée un compte sur [developer.adzuna.com](https://developer.adzuna.com), la clé arrive tout de suite. Mets `ADZUNA_APP_ID` et `ADZUNA_APP_KEY` dans Vercel.
   - Jooble : demande une clé sur [jooble.org/api/about](https://jooble.org/api/about). Mets `JOOBLE_API_KEY` dans Vercel.
   - Puis **Redeploy**. Réglages → Sources d'offres affiche ce qui est branché.

> France Travail n'est plus branché : son API « Offres d'emploi » est réservée aux organismes qui en font la demande. Ses offres passent par le favori ou le copier-coller.

### 7. Ouvrir le site à d'autres personnes
Avant d'inviter des amis :
1. **Base de données** : Réglages → Installation → « Base de données à jour » doit être au vert (sinon copie le script et lance-le dans Supabase). Il crée le compteur d'actions IA par personne.
2. **Envoi des emails de confirmation** : l'envoi intégré à Supabase est limité à **2 emails par heure** pour tout le projet et ne part qu'aux membres de ton équipe Supabase. Pour inviter d'autres personnes, configure un envoi gratuit : crée un compte [Resend](https://resend.com) (3 000 emails/mois gratuits) ou [Brevo](https://www.brevo.com) (300/jour), puis dans Supabase → **Authentication → Emails → SMTP Settings**, active « Custom SMTP » avec les identifiants du service. Ensuite, dans **Rate limits**, relève la limite d'emails (30 par heure par défaut).
3. **Anti-robots** : Supabase → Authentication → Attack Protection → active la protection CAPTCHA (Cloudflare Turnstile est gratuit).
4. **Gmail** : tant que l'écran de consentement Google est en mode « Testing », seules les adresses ajoutées dans **Test users** (100 maximum) peuvent connecter Gmail, et la connexion expire au bout de 7 jours. Tes amis peuvent utiliser JobPilot sans Gmail (favori, copier-coller).
5. **Pages légales** : ajoute `PUBLISHER_NAME` et `PUBLISHER_EMAIL` dans Vercel (ils s'affichent dans `/mentions-legales` et `/confidentialite`). Ces pages sont des modèles honnêtes, pas un avis juridique.
6. **IA partagée** : la clé Gemini gratuite est partagée entre tous les comptes. Chaque personne a un plafond quotidien d'actions IA (`AI_DAILY_BUDGET`, 60 par défaut). Ton adresse (dans `OWNER_EMAILS`) n'a pas de plafond. Avec l'offre gratuite de Gemini, Google peut utiliser les textes envoyés pour améliorer ses produits : c'est dit clairement dans la politique de confidentialité.

### Variables optionnelles

| Variable | Défaut | Rôle |
|---|---|---|
| `AUTO_DAILY_LIMIT` | 3 | Offres analysées par l'IA chaque matin (contrôle le coût) |
| `AUTO_MIN_QUICK_SCORE` | 55 | Pré-score minimum pour mériter une analyse automatique |
| `AI_DAILY_BUDGET` | 60 | Actions IA par personne et par jour |
| `OWNER_EMAILS` | vide | Adresses sans plafond d'IA, seules à voir l'installation |
| `ADZUNA_APP_ID`, `ADZUNA_APP_KEY`, `JOOBLE_API_KEY` | vides | Sources d'offres automatiques (étape 6) |
| `PUBLISHER_NAME`, `PUBLISHER_EMAIL` | vides | Éditeur et contact affichés dans les pages légales |
| `AUTO_GENERATE_CV` | `false` | Mets `true` si un jour tu veux des CV pré-générés |
| `CLAUDE_MODEL` / `CLAUDE_FAST_MODEL` | Sonnet / Haiku | Modèles utilisés |

`SUPABASE_SERVICE_ROLE_KEY` sert aussi au bouton « Supprimer mon compte » et à l'agenda sur téléphone (lecture du lien secret).

---

## Limites à connaître

- **LinkedIn et Indeed** bloquent la lecture automatique de leurs pages par un serveur. Pour leurs offres :
  - une offre qui n'a pas été lue en entier n'a qu'un **pré-tri** (pastille en pointillés : « Bonne piste », « À regarder » ou « Peu probable ») calculé sur le titre et les mots-clés, sans pourcentage. **Un seul pourcentage existe par offre : celui de l'analyse complète** ;
  - le favori lit les annonces avec ta session (sauf sur LinkedIn) ; sinon, « Voir le diagnostic » analyse l'offre, ou te demande de coller le texte de l'annonce.
- **Détection d'une offre retirée** : elle repose sur ce que le site répond à une lecture automatique. LinkedIn, Indeed et France Travail bloquent ou chargent leurs pages par JavaScript : l'app ne peut alors pas savoir, et ne devine pas. Dans ce cas, choisis toi-même « Offre plus disponible ».
- **Synchronisation et analyse reprenables** : chaque opération a un temps imparti sous la limite de Vercel (60 s pour une analyse, 300 s pour la synchro et la tâche du matin). Si le temps ou l'IA gratuite manque, l'app s'arrête proprement, garde ce qui est fait et reprend là où elle s'était arrêtée à la prochaine synchro (le bouton relance même tout seul, jusqu'à 3 passages). Une réponse de l'IA coupée en route est redemandée avec plus de place.
- **Aucune candidature n'est envoyée par l'app**, volontairement.
- **Inscriptions ouvertes** : la page d'accueil invite n'importe qui à créer un compte. Pour garder l'app pour toi seule, désactive les nouvelles inscriptions dans Supabase (Authentication, réglages d'inscription) une fois ton compte créé.
- **Ouvrir l'app à d'autres** : le code est déjà multi-utilisateur, chacun ne voit que ses données. Deux choses changent :
  - **Gmail** : au-delà de 100 utilisateurs test, Google exige une vérification de l'app. Pour le scope `gmail.readonly`, cela inclut un audit de sécurité payant. Sans Gmail, tout le reste fonctionne.
  - **IA** : en UE, Gemini doit alors passer en version payante, et le coût devient le tien. Il faudra un quota par utilisateur ou un abonnement.
- La durée max d'exécution (5 min) du cron demande **Fluid compute**, activé par défaut sur les nouveaux projets Vercel.

## En cas de problème

- **Vérification en deux étapes** (Réglages > Compte) : il faut que « TOTP » soit activé dans Supabase (Authentication > Sign In / Providers > Multi-Factor). Une fois activée, JobPilot demande le code à 6 chiffres après chaque connexion. Note bien le code secret affiché sous le QR code : il permet de reconfigurer l'application si tu perds ton téléphone. En dernier recours, Supabase permet normalement de retirer le second facteur d'un compte depuis Authentication > Users.

- **Le lien du mail de confirmation mène vers une page inaccessible** : voir l'étape 3 de Supabase (Site URL et Redirect URLs). Les comptes créés se voient dans **Authentication → Users**, pas dans les tables.
- **« Ton CV n'a pas pu être analysé »** : ouvre « Détail technique » sur cette page : le message exact de l'IA y est écrit. Le bouton « Relancer l'analyse » réessaie avec des réglages plus simples ; rien n'est perdu.

- **« 500 MIDDLEWARE_INVOCATION_FAILED »** (anciennes versions) ou **redirection vers /configuration** : une variable manque ou est mal saisie. La page `/configuration` liste ce qui est présent ou absent, sans jamais afficher les valeurs.
- **Après avoir ajouté ou modifié une variable, il faut redéployer** : Deployments, puis ⋯ sur le dernier déploiement, puis Redeploy. Les variables `NEXT_PUBLIC_…` sont figées au moment du build.
- Vérifie que les variables sont cochées pour **Production** (et Preview si tu testes une branche).
- `NEXT_PUBLIC_SUPABASE_URL` doit ressembler à `https://abcd1234.supabase.co`, sans guillemets, sans espace et sans `/rest/v1`.

- **Une page s'affiche vide ou un bouton ne réagit pas après une mise à jour** : ouvre **Réglages → Installation**. Une ligne rouge indique ce qui manque (clé, tâche du matin, mise à jour de la base).
- **« Tester l'IA » échoue** : la clé `GEMINI_API_KEY` est absente, mal copiée, ou le quota du jour est épuisé (il revient vers 9 h, heure de Paris).

## Développement local

```bash
cp .env.example .env.local   # remplis les valeurs
npm install
npm run dev                  # http://localhost:3000
```

Pour Gmail en local, ajoute aussi `http://localhost:3000/api/gmail/callback` comme redirect URI dans Google Cloud.

## Organisation du code

```
app/                   pages (App Router) et routes API
  api/offers/          analyse, génération CV/lettre/prépa, décision
  api/recommendations/ stockage et tri (Je candidate / Pas pour moi)
  api/gmail/           connexion OAuth, synchronisation
  api/cron/daily/      tâche du matin
lib/ai.ts              tous les prompts (analyse, CV, lettre, tri d'emails…)
lib/llm.ts             Gemini ou Claude, sorties JSON structurées, bascule auto en cas de quota, nouvelles tentatives quand l'IA est saturée
lib/cv-job.ts          analyse d'un CV en arrière-plan (diagnostic + profil), résultat ou erreur écrits dans la ligne « diagnostics »
lib/diagnostic-state.ts  état d'une analyse : en cours, terminée ou échouée
lib/onboarding.ts      choix et validation du questionnaire d'accueil, application des réponses au profil
lib/sync.ts            lecture Gmail, alertes, recherches sauvegardées
lib/quick-score.ts     pré-score gratuit + détection de l'expérience demandée
lib/learning.ts        règles apprises des offres acceptées / écartées
lib/empty-profile.ts   profil vide donné à chaque nouveau compte
lib/sources/           sources d'offres automatiques (Adzuna, Jooble)
lib/safe-fetch.ts      lecture sécurisée des liens d'offres (aucune adresse interne)
lib/quota.ts           plafond quotidien d'actions IA par personne
components/cv-templates.tsx  les 8 modèles de CV
components/template-picker.tsx  la galerie de modèles (vignettes du vrai CV)
components/letter-templates.tsx  les 6 modèles de lettre (+ letter-picker.tsx : leur galerie)
lib/letter.ts          parties d'une lettre, modèles assortis au CV, dates
components/fit-page.tsx  fait tenir le CV sur une page
components/skill-suggestions.tsx  compétences probables à confirmer
lib/bookmarklet.ts  le code du favori
components/ui/         notifications avec annulation, cadran de score, titres
lib/client/analyze.ts  analyse d'une offre côté navigateur (utilisée par 3 écrans)
lib/migration-sql.ts   script de mise à jour de la base (généré par scripts/gen-migration.mjs)
scripts/               source du script SQL de mise à jour
supabase/schema.sql    tables + sécurité (Row Level Security)
```
