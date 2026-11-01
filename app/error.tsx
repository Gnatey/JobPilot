"use client";
import { useEffect } from "react";
import Link from "next/link";
import { RotateCw } from "lucide-react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <h1 className="display text-[2.4rem]">Cette page n'a pas pu s'afficher</h1>
      <p className="mt-3 text-muted">Ça arrive, surtout si la connexion a coupé. Tes données n'ont pas bougé.</p>
      <div className="mt-6 flex justify-center gap-2">
        <button className="btn btn-primary" onClick={reset}><RotateCw size={16} /> Réessayer</button>
        <Link href="/" className="btn">Retour à l'accueil</Link>
      </div>
      {error.digest && <p className="mt-6 text-xs text-muted">Code d'erreur : {error.digest}</p>}
    </div>
  );
}
