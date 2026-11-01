import { getUser, supabaseServer } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import { OnboardingForm } from "@/components/onboarding-form";
import { AVAILABILITY, CONTRACT_OPTIONS, REMOTE_OPTIONS, YEAR_BANDS } from "@/lib/onboarding";
import type { OnboardingAnswers } from "@/lib/types";

export const metadata = { title: "Bienvenue" };
export const dynamic = "force-dynamic";

/** Pour « Refaire le questionnaire » : les réponses déjà enregistrées reviennent pré-remplies. */
export default async function Bienvenue() {
  const user = await getUser();
  let initial: Partial<OnboardingAnswers> | undefined;
  if (user) {
    const profile = await getProfile(await supabaseServer(), user);
    const p = profile.preferences;
    if (p.onboarded || profile.experiences.length) {
      const maxYears = p.max_years;
      initial = {
        target_roles: profile.targets.map((t) => t.title).filter(Boolean).slice(0, 4),
        contracts: (p.contracts ?? []).filter((c) => CONTRACT_OPTIONS.includes(c)),
        remote: (p.remote ?? "").split(",").map((x) => x.trim()).filter((x) => REMOTE_OPTIONS.includes(x)),
        sectors: p.sectors ?? [],
        salary: p.salary ?? "",
        zone: p.search_zone ?? null,
        availability: AVAILABILITY.includes(profile.identity.availability ?? "") ? profile.identity.availability! : "",
        experience_years: maxYears == null ? [] : YEAR_BANDS.filter((b) => b.max === maxYears).map((b) => b.label),
      };
    }
  }
  return <OnboardingForm initial={initial} />;
}
