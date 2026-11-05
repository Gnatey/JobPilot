import type { Metadata } from "next";
import { LegalShell, H2, ContactLine } from "@/components/legal";
import { activeProviders, PROVIDER_NAMES, type ProviderId } from "@/lib/llm";

export const metadata: Metadata = { title: "Confidentialité" };
export const dynamic = "force-dynamic";

/** Ce que chaque fournisseur d'IA indique faire des contenus envoyés (offres gratuites). À relire si leurs conditions changent. */
const RULES: Record<ProviderId, string> = {
  gemini: "selon ses conditions, quand l'application est exploitée depuis l'Espace économique européen, la Suisse ou le Royaume-Uni, les règles des services payants s'appliquent aussi au quota gratuit (les contenus ne servent pas à améliorer ses produits). Ailleurs, l'offre gratuite permet à Google de les utiliser et de les faire relire. Google déconseille d'y envoyer des données sensibles.",
  groq: "ne conserve pas les contenus des requêtes par défaut ; des journaux temporaires (30 jours au plus) peuvent exister pour dépanner ou repérer des abus.",
  mistral: "avec l'offre gratuite, Mistral indique que les requêtes peuvent servir à entraîner ses modèles, sauf si le titulaire du compte l'a refusé dans sa console (réglage Confidentialité de l'API).",
  anthropic: "API payante, soumise aux conditions commerciales d'Anthropic.",
};

export default function Confidentialite() {
  const active = activeProviders();
  const providers: ProviderId[] = active.length ? active : ["gemini"];
  return (
    <LegalShell title="Confidentialité et données personnelles" updated="novembre 2026">
      <section>
        <H2>En deux phrases</H2>
        <p>Tes données servent uniquement à faire marcher JobPilot pour toi. Elles ne sont ni vendues ni utilisées pour de la publicité. Un point demande ton attention : les textes envoyés à l'intelligence artificielle (voir plus bas).</p>
      </section>

      <section>
        <H2>Ce qui est enregistré</H2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Ton adresse email et ton mot de passe (stocké chiffré par Supabase, jamais lisible).</li>
          <li>Ton profil : ce que tu saisis ou ce que contiennent les CV que tu déposes (parcours, compétences, coordonnées).</li>
          <li>Les offres que tu analyses, tes candidatures, les documents générés (CV, lettres) et tes réglages.</li>
          <li>Si tu connectes Gmail : l'expéditeur, l'objet et un extrait des emails liés à ta recherche d'emploi, pour classer les réponses et lire les alertes. Gmail est connecté en lecture seule ; la permission d'envoi n'est demandée que si tu actives le récap du matin, et il part vers ta propre adresse.</li>
          <li>Un compteur d'actions d'IA par jour (pour partager équitablement la ressource gratuite).</li>
        </ul>
      </section>

      <section>
        <H2>L'intelligence artificielle</H2>
        <p>Pour analyser une offre, rédiger un CV ou lire un email d'alerte, JobPilot envoie le texte concerné (offre, extrait de ton profil, extrait d'email) à l'API {providers.length > 1 ? "de l'un des fournisseurs d'IA suivants, selon la tâche et leur disponibilité" : `de ${PROVIDER_NAMES[providers[0]]}`}.</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {providers.map((id) => <li key={id}><strong>{PROVIDER_NAMES[id]}</strong> : {RULES[id]}</li>)}
        </ul>
        <p className="mt-2"><strong>N'envoie donc rien que tu ne voudrais pas partager</strong> : évite les numéros d'identité, de sécurité sociale, les informations de santé ou celles d'autres personnes dans ton profil et les textes que tu colles.</p>
      </section>

      <section>
        <H2>Pages que tu envoies avec le favori</H2>
        <p>Quand tu cliques sur le favori « Envoyer à JobPilot », ton navigateur transmet à JobPilot le texte et les liens de la page que tu regardes à cet instant. Rien n'est lu sans ton clic. JobPilot ne se connecte jamais à ta place à un autre site.</p>
      </section>

      <section>
        <H2>Qui peut voir tes données</H2>
        <p>Toi, dans ton compte. Chaque personne ne voit que ses propres lignes (règle appliquée par la base de données elle-même). L'éditeur administre l'installation et pourrait techniquement accéder à la base ; il s'engage à ne le faire que pour réparer un problème que tu lui signales. Son espace d'administration affiche la liste des comptes de façon anonyme (un code court, sans adresse, avec les dates de création et de dernière connexion), le nombre d'actions IA utilisées et le nombre de candidatures par compte ; il n'affiche jamais le contenu de tes offres, de tes CV, de tes emails ni de tes candidatures.</p>
        <p className="mt-2">Prestataires techniques : Vercel (hébergement de l'application), Supabase (base de données et comptes), {providers.map((id) => PROVIDER_NAMES[id]).join(", ")} pour l'IA, et Google pour Gmail si tu le connectes. Certains sont situés hors de l'Union européenne, avec les garanties prévues par leurs conditions.</p>
      </section>

      <section>
        <H2>Cookies</H2>
        <p>Un cookie de session te garde connecté (au plus 90 jours, puis tu te reconnectes). Si tu actives la vérification en deux étapes et coches « Ne plus demander le code sur cet appareil », un second cookie de sécurité, signé et illisible par les scripts, retient pour la même durée que le code a déjà été saisi ici. Ton navigateur retient aussi ton thème clair ou sombre. Ces cookies servent uniquement au fonctionnement et à la sécurité du site : il n'y a ni traceur publicitaire ni mesure d'audience, donc pas de bandeau à valider.</p>
      </section>

      <section>
        <H2>Tes droits</H2>
        <p>Tu peux à tout moment, depuis <strong>Réglages</strong> : télécharger toutes tes données (export) et supprimer ton compte, ce qui efface définitivement ton profil, tes offres, tes candidatures et tes documents. Pour toute autre demande (accès, rectification, opposition) : <ContactLine />. Tu peux aussi saisir la CNIL (cnil.fr).</p>
        <p className="mt-2">Les données sont conservées tant que ton compte existe. Si tu retires l'accès de JobPilot depuis ton compte Google, les emails ne sont plus lus.</p>
        <p className="mt-2">L'accès à ton Gmail (le « jeton » remis par Google) est stocké chiffré dans la base, avec une clé qui n'existe que chez l'hébergeur. Supprimer ton compte exige de t'être connecté·e dans les 10 dernières minutes.</p>
      </section>
    </LegalShell>
  );
}
