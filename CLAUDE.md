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
- `lib/bookmarklet.ts`, `app/importer/page.tsx`, `lib/offer-header.ts` : favori « Envoyer à JobPilot ».
- `components/reason-chips.tsx`, `lib/types.ts` : raisons d'écart, « Autre » avec pourquoi libre.

## Comportements voulus à ne pas casser
- Offres & CV ne montre que ce qu'il reste à traiter. Postulé, abandonné ou refusé : c'est dans Suivi.
- Suivi : « En cours » cache Refusé / Abandonné / Offre plus disponible ; « Tout » les affiche.
- Un seul pourcentage par offre : celui de l'analyse complète. Pour une offre analysée d'après un simple extrait (Indeed…), il est marqué « estimé » (`analysis.estimated`) jusqu'à la lecture de l'annonce entière via le favori.
- Ce que l'annonce ne dit pas n'est jamais un point négatif. La séniorité non écrite est « Non précisé ».
- Sur l'accueil, pas d'étiquette « Peu probable » : une étoile seulement sur les offres vraiment proches du profil.

## Pas encore fait (à ne pas faire sans demande)
- Photo sur le CV (cadre photo dans le profil maître).
- Partie admin séparée, adresse email professionnelle pour les pages légales.
- Renforts quand Supabase ou Gemini atteignent leurs limites.
- Où ranger une offre analysée mais pas encore décidée (Recommandées › À trier, ou section « À décider » dans Offres & CV) : question posée à Juliana, pas de réponse.

## Rondes de contrôle
Une ronde = audit + tests + corrections sûres. Elle lit `docs/journal-des-rondes.md` avant de commencer et y ajoute son entrée à la fin.
