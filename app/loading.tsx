import { Skeleton } from "@/components/ui/page-title";

/** Affiché pendant le chargement d'une page : la structure apparaît tout de suite. */
export default function Loading() {
  return (
    <div className="space-y-6" role="status" aria-label="Chargement">
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
