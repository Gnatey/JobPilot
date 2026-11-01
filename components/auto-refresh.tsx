"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Recharge les données de la page toutes les quelques secondes tant qu'une analyse tourne en arrière-plan. */
export function AutoRefresh({ active, every = 3000 }: { active: boolean; every?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => { if (!document.hidden) router.refresh(); }, every);
    return () => clearInterval(t);
  }, [active, every, router]);
  return null;
}
