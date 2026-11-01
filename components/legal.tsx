import Link from "next/link";
import { Logo } from "@/components/nav";

/** Éditeur du service : renseigné dans Vercel (PUBLISHER_NAME, PUBLISHER_EMAIL). */
export function publisher() {
  const name = process.env.PUBLISHER_NAME?.trim() || "";
  const email = process.env.PUBLISHER_EMAIL?.trim() || "";
  return { name, email, ok: !!(name && email) };
}

export function LegalShell({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-5 py-8 md:py-12">
      <header className="mb-8 flex items-center justify-between gap-4">
        <Logo />
        <nav aria-label="Pages légales" className="flex gap-5 text-sm text-muted">
          <Link href="/mentions-legales" className="link">Mentions légales</Link>
          <Link href="/confidentialite" className="link">Confidentialité</Link>
        </nav>
      </header>
      <h1 className="display text-[2rem] md:text-[2.6rem]">{title}</h1>
      <p className="mt-2 text-sm text-muted">Dernière mise à jour : {updated}</p>
      <div className="legal mt-8 max-w-[68ch] space-y-8 leading-relaxed">{children}</div>
      <p className="mt-12"><Link href="/" className="link text-sm text-muted">Retour à l'accueil</Link></p>
    </div>
  );
}

export const H2 = ({ children }: { children: React.ReactNode }) => <h2 className="heading mb-2 text-xl">{children}</h2>;

export function ContactLine() {
  const p = publisher();
  return p.email ? <a className="link" href={`mailto:${p.email}`}>{p.email}</a> : <span className="rounded bg-marigold/20 px-1.5">adresse de contact non renseignée</span>;
}

/** Liens affichés en pied de page de l'accueil et de la connexion. */
export function LegalLinks({ className = "" }: { className?: string }) {
  return (
    <nav aria-label="Pages légales" className={`flex flex-wrap gap-x-5 gap-y-1 ${className}`}>
      <Link href="/mentions-legales" className="link">Mentions légales</Link>
      <Link href="/confidentialite" className="link">Confidentialité</Link>
    </nav>
  );
}
