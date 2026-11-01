import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <p className="display text-[5rem] leading-none text-line">404</p>
      <h1 className="display mt-2 text-[2rem]">Cette page n'existe pas</h1>
      <p className="mt-3 text-muted">Le lien est peut-être ancien, ou l'élément a été supprimé.</p>
      <div className="mt-6 flex justify-center gap-2">
        <Link href="/" className="btn btn-primary">Retour à l'accueil</Link>
        <Link href="/suivi" className="btn">Mon suivi</Link>
      </div>
    </div>
  );
}
