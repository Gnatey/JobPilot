# Plan de refonte (5 novembre 2026)

**Demande de Juliana** : une refonte complète du site, parce que JobPilot pourrait un jour être ouvert à plus qu'elle et ses amis. Elle veut que ce soit « 100 % safe » et « compatible » avec plusieurs services pour récupérer et proposer des offres, des CV et des lettres.
**Ses choix** : tout le périmètre (sécurité et comptes, refonte visuelle et parcours, socle technique, page publique et Google), livré **par paquets, dans l'ordre ci-dessous**. Elle avait d'abord voulu valider chaque paquet, puis a dit « non lance tout » (5 novembre) : les paquets s'enchaînent, chacun testé et suivi d'un court bilan. On s'arrête seulement pour ce qui dépend d'elle. L'IA reste 100 % gratuite.

## Ce que je peux promettre, et ce que je ne peux pas
- **« 100 % sûr » n'existe pour aucun site.** Ce qu'on peut tenir : fermer chaque risque connu, le couvrir par un test, garder la base protégée ligne par ligne (RLS), n'avoir aucun secret dans le dépôt, et dire franchement ce qui reste. Avant une vraie ouverture au public, un regard extérieur (un·e développeur·se sécurité, même une heure) vaut mieux qu'une promesse de ma part.
- **« Compatible avec plusieurs services d'offres »** : seulement par les portes officielles et gratuites (API publiques, alertes e-mail, favori, copier-coller). Indeed, LinkedIn et Welcome to the Jungle n'ont pas d'API publique pour cet usage et leurs conditions interdisent de lire leurs pages automatiquement : on ne le fera pas, le favori « Envoyer à JobPilot » et les alertes Gmail restent la voie.
- **Gmail en lecture est une permission « restreinte » chez Google.** D'après les sources consultées, une application de moins de 100 utilisateurs peut rester non vérifiée ; au-delà, la vérification exige un audit de sécurité externe payant (ordres de grandeur très variables selon les sources : à demander à Google). Le cercle d'amis tient dans la limite ; une vraie ouverture au public demande ce budget, ou de renoncer à la lecture de Gmail (le favori et le copier-coller suffisent).
- **L'IA gratuite est partagée.** Gemini, Groq et Mistral ont des plafonds : avec une dizaine de personnes actives, ils seront atteints. Pistes gratuites pour toi (à choisir avant le paquet 5) : plafond par personne (déjà là, 60 actions par jour), clé gratuite personnelle pour chaque ami (stockée chiffrée), file d'attente aux heures chargées.

## État de départ (constaté le 5 novembre)
- Sources d'offres : le code sait interroger **Adzuna** et **Jooble**, mais **aucune de leurs clés n'est dans Vercel** : la recherche automatique est donc éteinte aujourd'hui. Les identifiants **France Travail** sont dans Vercel mais **le code ne les utilise pas encore**.
- Aucune limitation du nombre de requêtes par personne (hors budget d'IA).
- Jeton Gmail en clair en base : **réglé par le paquet 1A**. Suppression de compte sans reconnexion : **réglé par le paquet 1A**.
- `npm audit` : faille dans `postcss` (livré avec Next) ; le correctif demande Next 16.

## Les paquets, dans l'ordre

### Paquet 1 : sécurité et comptes
- **1A, livré le 5 novembre** : jetons Gmail chiffrés ; suppression de compte seulement après une connexion récente ; page confidentialité fidèle.
- **1B, livré le 5 novembre** : limitation du nombre de requêtes par personne (mot de passe, export, suppression ; **demande la mise à jour de la base, additive, que tu lances** depuis Administration › Installation) ; en-têtes de sécurité (CSP) testés sur 26 pages ; test automatique sur une vraie base PostgreSQL locale « chaque table n'est accessible qu'à sa propriétaire ». Limite assumée : la CSP garde `'unsafe-inline'` pour les scripts (Next.js), la version à jeton viendra avec la montée de Next (paquet 4).
- **À toi** : adresse e-mail professionnelle pour les pages légales (elle est déjà dans « pas encore fait »).

### Paquet 2 : page publique et Google, livré le 5 novembre
Plan du site, `robots.txt` qui laisse Google charger les styles et scripts, adresse canonique, image et aperçus de partage, données structurées, section « Données reçues de Google (Gmail) » avec l'usage limité, et les e-mails ne partent plus jamais chez Mistral (son offre gratuite peut entraîner ses modèles). **Reste à toi** : `PUBLISHER_NAME` et `PUBLISHER_EMAIL` dans Vercel, soumettre le plan du site dans Search Console, relancer la validation de la marque.

### Paquet 3 : sources d'offres, livré le 5 novembre
**France Travail n'est pas branché, volontairement** : son API « Offres d'emploi » est réservée aux organismes qui en font la demande (fiche officielle sur data.gouv.fr : accès restreint, non exposé pour l'instant) et le dépôt n'en garde aucune trace de code qui marchait. Écrire un branchement à l'aveugle, sans pouvoir le tester ni avec les identifiants (qui sont dans Vercel, hors de portée), serait de la fausse sécurité. Ses offres passent par le favori, les alertes Gmail et le copier-coller. Les variables `FRANCE_TRAVAIL_CLIENT_ID` / `FRANCE_TRAVAIL_CLIENT_SECRET` dans Vercel ne servent à rien : à retirer si tu veux (moins de secrets stockés).
**Fait** : tests de la recherche multi-sources (offre vue par deux sources comptée une fois, une source en panne n'arrête pas l'autre, aucune clé dans les messages d'erreur, filtres communs), bouton administrateur « Tester les sources » (une vraie requête par source, plafonné), message d'erreur qui renvoie à Administration (et non plus à Réglages). **Reste à toi** : créer les clés gratuites Adzuna et/ou Jooble et les mettre dans Vercel (jamais dans un chat) pour que la recherche automatique reparte.

### Paquet 4 : socle technique, livré le 5 novembre (Next 16 : prêt, pas mis en ligne)
**Fait** : faille `postcss` réglée sans changer de version majeure (`overrides` dans `package.json` : `npm audit` passe de 2 failles à 0, le CSS produit est identique octet pour octet) ; lectures complètes de `applications` et de la file « Tout analyser » passées par `fetchAll` (un `limit(3000)` était coupé à 1 000 en silence : au-delà, les doublons de Suivi n'étaient jamais retrouvés) avec un test qui interdit tout `limit(N)` au-dessus de 1 000 ; vérification automatique à chaque envoi sur GitHub (`.github/workflows/verifications.yml` : types, tests, construction, failles).
**Next 16 : essai fait dans une copie, rien changé en ligne.** Avec Next 16.4.5 : types, 17 fichiers de tests, construction, parcours dans Chromium (26 pages, CSP), rig Googlebot et rig de reconnexion espacée passent tous. Seul avertissement : le fichier `middleware.ts` s'appelle désormais `proxy.ts` (l'ancien nom marche encore). **Décision à toi** : mettre en ligne la montée de version ou attendre (voir « Décisions »).
**Pas fait, dépend de toi** : suivi des erreurs (Sentry ou équivalent : demande un compte et une clé, une ligne dans la politique de sécurité du navigateur et dans la page Confidentialité).

### Paquet 5 : refonte visuelle et parcours (en trois tranches)
**5a livré le 5 novembre (accessibilité et finitions).** Constat : pas besoin de tout repeindre, l'identité est solide ; ce qui était faux se mesurait. axe-core sur 83 vues : 37 violations → 0 (contraste des pastilles en mode sombre) ; petites cibles tactiles sur téléphone 523 → 103 ; onglets de Recommandées sur une grille de quatre colonnes ; titre propre à chaque page ; deux nouveaux tests (`contrast`, `titles`). Un changement de style (couleurs, typographie) reste ton choix si tu en veux un autre. **À venir** : 5b, 5c ci-dessous.
5a accueil, bienvenue (arrivée d'une personne qui n'est pas toi) et navigation (contrôlés : aucune repeinte nécessaire, seulement les finitions listées plus haut) ; 5b Offres & CV, Suivi, Recommandées ; 5c CV et lettres. Avec le reste de l'audit (boutons sur téléphone, champs sans étiquette, titres de pages), le mode sombre, un test sur iPhone.
**Garde-fous** : les comportements du fichier `CLAUDE.md` (« à ne pas casser ») restent, chaque tranche passe tous les tests et un rendu sur ordinateur et téléphone avant mise en ligne.

## Décisions à prendre par Juliana
0. **Next 16** : mise en ligne de la montée de version (essai concluant, annulable en un clic dans Vercel › Deployments › Promote l'ancienne version) : oui / après la refonte visuelle / non.
1. **IA partagée** : quelle piste (plafond seul, clé personnelle par ami, file d'attente) avant d'ouvrir à plus de monde ?
2. **Adresse e-mail pro** pour les pages légales (avant le paquet 2).
3. ~~Titre « Recherche (En cours de développement) »~~ : **retiré** (Juliana, 5 novembre).
4. ~~Pages légales dans Google~~ : **rendues indexables** (Juliana, 5 novembre : la validation de la marque ne passait pas).
5. ~~Regard extérieur sur la sécurité~~ : **non** pour l'instant, Juliana testera avec ses différents comptes (5 novembre). Reste vrai : ce n'est pas un audit indépendant.
