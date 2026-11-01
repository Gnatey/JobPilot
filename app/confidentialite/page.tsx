import type { Metadata } from "next";
import { LegalShell, H2, ContactLine } from "@/components/legal";

export const metadata: Metadata = { title: "Confidentialité" };
export const dynamic = "force-dynamic";

export default function Confidentialite() {
  return (
    <LegalShell title="Confidentialité et données personnelles" updated="octobre 2026">
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
        <p>Pour analyser une offre, rédiger un CV ou lire un email d'alerte, JobPilot envoie le texte concerné (offre, extrait de ton profil, extrait d'email) à l'API Gemini de Google. Avec l'offre gratuite de Gemini, Google indique pouvoir utiliser ces contenus pour améliorer ses produits, et des personnes peuvent les relire. <strong>N'envoie donc rien que tu ne voudrais pas partager</strong> : évite les numéros d'identité, de sécurité sociale, les informations de santé ou celles d'autres personnes dans ton profil et les textes que tu colles.</p>
      </section>

      <section>
        <H2>Pages que tu envoies avec le favori</H2>
        <p>Quand tu cliques sur le favori « Envoyer à JobPilot », ton navigateur transmet à JobPilot le texte et les liens de la page que tu regardes à cet instant. Rien n'est lu sans ton clic. JobPilot ne se connecte jamais à ta place à un autre site.</p>
      </section>

      <section>
        <H2>Qui peut voir tes données</H2>
        <p>Toi, dans ton compte. Chaque personne ne voit que ses propres lignes (règle appliquée par la base de données elle-même). L'éditeur administre l'installation et pourrait techniquement accéder à la base ; il s'engage à ne le faire que pour réparer un problème que tu lui signales.</p>
        <p className="mt-2">Prestataires techniques : Vercel (hébergement de l'application), Supabase (base de données et comptes), Google (Gemini pour l'IA ; Gmail si tu le connectes). Certains sont situés hors de l'Union européenne, avec les garanties prévues par leurs conditions.</p>
      </section>

      <section>
        <H2>Cookies</H2>
        <p>Un cookie de session te garde connecté, et ton navigateur retient ton thème clair ou sombre. Il n'y a ni traceur publicitaire ni mesure d'audience, donc pas de bandeau à valider.</p>
      </section>

      <section>
        <H2>Tes droits</H2>
        <p>Tu peux à tout moment, depuis <strong>Réglages</strong> : télécharger toutes tes données (export) et supprimer ton compte, ce qui efface définitivement ton profil, tes offres, tes candidatures et tes documents. Pour toute autre demande (accès, rectification, opposition) : <ContactLine />. Tu peux aussi saisir la CNIL (cnil.fr).</p>
        <p className="mt-2">Les données sont conservées tant que ton compte existe. Si tu retires l'accès de JobPilot depuis ton compte Google, les emails ne sont plus lus.</p>
      </section>
    </LegalShell>
  );
}
