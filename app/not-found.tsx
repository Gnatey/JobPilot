import Link from "next/link";
import { getT } from "@/lib/i18n/server";

export default async function NotFound() {
  const t = await getT();
  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <p className="display text-[5rem] leading-none text-line">404</p>
      <h1 className="display mt-2 text-[2rem]">{t("Cette page n'existe pas")}</h1>
      <p className="mt-3 text-muted">{t("Le lien est peut-être ancien, ou l'élément a été supprimé.")}</p>
      <div className="mt-6 flex justify-center gap-2">
        <Link href="/" className="btn btn-primary">{t("Retour à l'accueil")}</Link>
        <Link href="/suivi" className="btn">{t("Mon suivi")}</Link>
      </div>
    </div>
  );
}
