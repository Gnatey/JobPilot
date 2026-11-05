# Plan de refonte (5 novembre 2026)

**Demande de Juliana** : une refonte complète du site, parce que JobPilot pourrait un jour être ouvert à plus qu'elle et ses amis. Elle veut que ce soit « 100 % safe » et « compatible » avec plusieurs services pour récupérer et proposer des offres, des CV et des lettres.
**Ses choix** : tout le périmètre (sécurité et comptes, refonte visuelle et parcours, socle technique, page publique et Google), livré **par paquets, dans l'ordre ci-dessous, avec sa validation entre chaque paquet**. L'IA reste 100 % gratuite.

## Ce que je peux promettre, et ce que je ne peux pas
- **« 100 % sûr » n'existe pour aucun site.** Ce qu'on peut tenir : fermer chaque risque connu, le couvrir par un test, garder la base protégée ligne par ligne (RLS), n'avoir aucun secret dans le dépôt, et dire franchement ce qui reste. Avant une vraie ouverture au public, un regard extérieur (un·e développeur·se sécurité, même une heure) vaut mieux qu'une promesse de ma part.
- **« Compatible avec plusieurs services d'offres »** : seulement par les portes officielles et gratuites (API publiques, alertes e-mail, favori, copier-coller). Indeed, LinkedIn et Welcome to the Jungle n'ont pas d'API publique pour cet usage et leurs conditions interdisent de lire leurs pages automatiquement : on ne le fera pas, le favori « Envoyer à JobPilot » et les alertes Gmail restent la voie.
- **L'IA gratuite est partagée.** Gemini, Groq et Mistral ont des plafonds : avec une dizaine de personnes actives, ils seront atteints. Pistes gratuites pour toi (à choisir avant le paquet 5) : plafond par personne (déjà là, 60 actions par jour), clé gratuite personnelle pour chaque ami (stockée chiffrée), file d'attente aux heures chargées.

## État de départ (constaté le 5 novembre)
- Sources d'offres : le code sait interroger **Adzuna** et **Jooble**, mais **aucune de leurs clés n'est dans Vercel** : la recherche automatique est donc éteinte aujourd'hui. Les identifiants **France Travail** sont dans Vercel mais **le code ne les utilise pas encore**.
- Aucune limitation du nombre de requêtes par personne (hors budget d'IA).
- Jeton Gmail en clair en base : **réglé par le paquet 1A**. Suppression de compte sans reconnexion : **réglé par le paquet 1A**.
- `npm audit` : faille dans `postcss` (livré avec Next) ; le correctif demande Next 16.

## Les paquets, dans l'ordre

### Paquet 1 : sécurité et comptes
- **1A, livré le 5 novembre** : jetons Gmail chiffrés ; suppression de compte seulement après une connexion récente ; page confidentialité fidèle.
- **1B** : limitation du nombre de requêtes par personne sur les routes coûteuses ou sensibles (**demande une migration SQL, additive, que tu lances**) ; en-têtes de sécurité (CSP) testés sur toutes les pages ; test automatique « chaque table a sa politique RLS » ; vérification que les messages d'erreur ne révèlent rien aux non-admins.
- **À toi** : adresse e-mail professionnelle pour les pages légales (elle est déjà dans « pas encore fait »).

### Paquet 2 : page publique et Google
Accueil pensé pour être trouvé et compris (titre, description, image de partage), plan du site, pages légales relues, vérification dans Search Console. Petit, et c'est ce qui sert la validation Gmail.

### Paquet 3 : sources d'offres
Brancher **France Travail** (identifiants déjà là, rien à ajouter), faire repartir Adzuna et Jooble si tu en ouvres les clés (gratuites), dédoublonnage entre sources, état de chaque source dans `/admin`.

### Paquet 4 : socle technique
Next 16 et correctif `postcss` (montée de version : testée à part, jamais de nuit), lectures de `applications` paginées, vérification automatique (typecheck, tests, build) à chaque envoi sur GitHub (gratuit), suivi des erreurs.

### Paquet 5 : refonte visuelle et parcours (en trois tranches)
5a accueil, bienvenue (arrivée d'une personne qui n'est pas toi) et navigation ; 5b Offres & CV, Suivi, Recommandées ; 5c CV et lettres. Avec le reste de l'audit (boutons sur téléphone, champs sans étiquette, titres de pages), le mode sombre, un test sur iPhone.
**Garde-fous** : les comportements du fichier `CLAUDE.md` (« à ne pas casser ») restent, chaque tranche passe tous les tests et un rendu sur ordinateur et téléphone avant mise en ligne.

## Décisions à prendre par Juliana
1. **IA partagée** : quelle piste (plafond seul, clé personnelle par ami, file d'attente) avant d'ouvrir à plus de monde ?
2. **Adresse e-mail pro** pour les pages légales (avant le paquet 2).
3. **Titre « Recherche (En cours de développement) »** : à retirer ou garder.
4. **Pages légales dans Google** : elles sont lisibles par Google mais en « noindex ». Les rendre aussi indexables ?
5. **Un regard extérieur sur la sécurité** avant l'ouverture au public ?
