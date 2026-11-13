import { Skeleton } from "@/components/ui/page-title";
import { getT } from "@/lib/i18n/server";

/** Affiché pendant le chargement d'une page : la structure apparaît tout de suite. */
export default async function Loading() {
  const t = await getT();
  return (
    <div className="space-y-6" role="status" aria-label={t("Chargement")}>
      <div className="space-y-3">
        <Skeleton className="h-10 w-64 max-w-full" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-16" /><Skeleton className="h-16" /><Skeleton className="h-16" /><Skeleton className="h-16" />
      </div>
    </div>
  );
}
