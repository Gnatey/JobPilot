import type { SupabaseClient } from "@supabase/supabase-js";
import { HttpError } from "./supabase/server";
import { getProfileById } from "./profile";
import { diagnoseCv, mergeProfileWithCv, profileFromCvText } from "./ai";
import { applyAnswers, slug } from "./onboarding";
import { dropSettled } from "./profile-fix";
import type { OnboardingAnswers, Profile } from "./types";

type Job = { userId: string; rowId: string; text: string; answers: OnboardingAnswers | null; startedAt: string };

/**
 * Analyse d'un CV : lit le profil, appelle l'IA (diagnostic + extraction en parallèle) puis range le résultat dans la ligne
 * « diagnostics » créée au dépôt. Ne lève jamais d'erreur : un échec est écrit dans la ligne pour que la page l'affiche.
 */
export async function runCvAnalysis(db: SupabaseClient, job: Job) {
  const { userId, rowId, text, answers, startedAt } = job;
  try {
    const current = await getProfileById(db, userId);
    const empty = current.experiences.length === 0;

    const [diagnostic, extracted] = await Promise.all([
      diagnoseCv(text, answers, empty ? null : current),
      empty ? profileFromCvText(text) : mergeProfileWithCv(current, text),
    ]);

    // Les postes choisis dans le questionnaire deviennent les cibles du profil ; le diagnostic fournit leur positionnement
    const hints = [...extracted.targets, ...diagnostic.positioning.recommended_targets.map((t) => ({ title: t.title, pitch: t.why }))];
    // Sans nouvelles réponses, on garde ce qui a été réglé avant (cas : questionnaire fait, diagnostic passé, CV déposé ensuite)
    const keepSettings = (p: Profile): Profile => ({
      ...p,
      targets: current.targets.length ? current.targets : p.targets,
      preferences: { ...p.preferences, ...current.preferences, contracts: current.preferences.contracts?.length ? current.preferences.contracts : p.preferences.contracts },
      identity: { ...p.identity, mobility: current.identity.mobility || p.identity.mobility, availability: current.identity.availability || p.identity.availability },
    });
    let proposed = answers ? applyAnswers(extracted, answers, hints) : current.preferences.onboarded ? keepSettings(extracted) : extracted;
    if (!proposed.targets.length && diagnostic.positioning.recommended_targets.length) {
      proposed = {
        ...proposed,
        targets: diagnostic.positioning.recommended_targets.slice(0, 3).map((t) => ({ id: slug(t.title) || "cible", title: t.title, pitch: t.why })),
      };
    }
    // Les points à corriger du diagnostic alimentent la liste "à compléter" du profil
    // Ce que la personne a déjà réglé reste réglé (la mémoire passe dans le profil proposé), et ne revient pas dans la liste, même repris tel quel par l'IA
    if (current.settled?.length) proposed.settled = current.settled;
    proposed.todo = dropSettled([...new Set([...(proposed.todo ?? []), ...diagnostic.missing_metrics.slice(0, 4), ...diagnostic.inconsistencies.slice(0, 3)])], proposed.settled);

    // Premier passage avec un profil vide : on applique directement
    const now = new Date().toISOString();
    if (empty) await db.from("profiles").upsert({ user_id: userId, data: proposed, updated_at: now });
    // Profil déjà rempli : ses réponses au questionnaire (zone, contrats, postes…) s'appliquent tout de suite, le reste attend ton accord
    else if (answers) await db.from("profiles").upsert({ user_id: userId, data: applyAnswers(current, answers, hints), updated_at: now });

    const { error } = await db.from("diagnostics").update({ content: diagnostic, proposed_profile: proposed, applied: empty }).eq("id", rowId);
    if (error) throw error;
  } catch (e) {
    console.error("Analyse de CV échouée", e);
    const message = e instanceof HttpError ? e.message : "L'analyse n'a pas abouti. Ton CV n'a rien perdu : réessaie dans un instant.";
    // Détail technique gardé pour comprendre la cause (affiché dans « Détail technique », sans donnée personnelle)
    const detail = (e instanceof Error ? e.message : String(e)).slice(0, 400);
    await db.from("diagnostics").update({ content: { status: "error", error: message, detail, started_at: startedAt, text } }).eq("id", rowId);
  }
}
