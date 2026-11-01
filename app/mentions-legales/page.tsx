import type { Metadata } from "next";
import { LegalShell, H2, ContactLine, publisher } from "@/components/legal";

export const metadata: Metadata = { title: "Mentions légales" };
export const dynamic = "force-dynamic";

export default function MentionsLegales() {
  const p = publisher();
  return (
    <LegalShell title="Mentions légales" updated="octobre 2026">
      <section>
        <H2>Éditeur du site</H2>
        <p>
          {p.name ? <strong>{p.name}</strong> : <span className="rounded bg-marigold/20 px-1.5">nom de l'éditeur non renseigné</span>}, personne physique, éditeur non professionnel de ce service gratuit.
          Contact : <ContactLine />.
        </p>
        <p className="mt-2 text-muted">Conformément à la loi pour la confiance dans l'économie numérique (article 6-III-2), l'éditeur non professionnel peut ne communiquer que le nom de son hébergeur, à condition de l'avoir communiqué à celui-ci.</p>
      </section>
      <section>
        <H2>Hébergement</H2>
        <p>Application : Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, États-Unis. Base de données et comptes : Supabase, hébergés dans la région choisie par l'éditeur (Europe).</p>
      </section>
      <section>
        <H2>Nature du service</H2>
        <p>JobPilot aide à suivre ses candidatures, analyser des offres et préparer des CV et lettres. Il ne postule jamais à ta place : c'est toujours toi qui envoies ta candidature. Les scores et textes générés par une intelligence artificielle sont des aides à la décision, qui peuvent contenir des erreurs : relis-les avant de les utiliser.</p>
        <p className="mt-2">Le service est proposé gratuitement, tel quel, sans garantie de disponibilité. Il peut être modifié ou arrêté à tout moment.</p>
      </section>
      <section>
        <H2>Propriété et contenus</H2>
        <p>Tes données (profil, CV, offres, candidatures) restent à toi. Les noms de sites cités (LinkedIn, Indeed, France Travail, Welcome to the Jungle, etc.) appartiennent à leurs propriétaires ; JobPilot n'est affilié à aucun d'eux.</p>
      </section>
      <section>
        <H2>Signaler un problème</H2>
        <p>Pour toute question, demande de suppression ou signalement : <ContactLine />.</p>
      </section>
    </LegalShell>
  );
}
