import { fetchAll } from "./paged";
import type { SupabaseClient } from "@supabase/supabase-js";
import { STATUSES, variantLabel, isNeverSent, reasonKey, canonicalStatus, type Application } from "./types";

const RESPONSE = new Set(["entretien", "test", "offre", "refuse"]);
const INTERVIEW = new Set(["entretien", "test", "offre"]);

type Group = { key: string; sent: number; responses: number; interviews: number; response_rate: number; interview_rate: number };

function group(apps: Application[], reached: Map<string, Set<string>>, by: (a: Application) => string): Group[] {
  const m = new Map<string, Group>();
  for (const a of apps) {
    const k = by(a) || "Non renseigné";
    const g = m.get(k) ?? { key: k, sent: 0, responses: 0, interviews: 0, response_rate: 0, interview_rate: 0 };
    const r = reached.get(a.id) ?? new Set();
    g.sent++;
    if ([...r].some((s) => RESPONSE.has(s))) g.responses++;
    if ([...r].some((s) => INTERVIEW.has(s))) g.interviews++;
    m.set(k, g);
  }
  return [...m.values()]
    .map((g) => ({ ...g, response_rate: Math.round((g.responses / g.sent) * 100), interview_rate: Math.round((g.interviews / g.sent) * 100) }))
    .sort((a, b) => b.sent - a.sent);
}

export async function computeStats(supabase: SupabaseClient) {
  // Lecture page après page : une seule requête serait coupée à 1 000 lignes (les recommandations les dépassent vite)
  const [{ data: appsRaw }, { data: hist }, { data: emails }, { data: recosAll }] = await Promise.all([
    fetchAll((a, b) => supabase.from("applications").select("*").order("id").range(a, b)),
    fetchAll<{ application_id: string; to_status: string; changed_at: string }>((a, b) => supabase.from("status_history").select("application_id, to_status, changed_at").order("changed_at").order("id").range(a, b)),
    fetchAll<{ category: string; received_at: string; application_id: string | null }>((a, b) => supabase.from("emails").select("category, received_at, application_id").order("id").range(a, b)),
    fetchAll<{ status: string; reject_reason: string | null; source: string | null; quick_score: number | null; senior: boolean | null }>((a, b) => supabase.from("recommendations").select("status, reject_reason, source, quick_score, senior").order("id").range(a, b)),
  ]);
  // Les offres masquées par le filtre « adapté à mon profil » n'ont jamais été proposées : elles ne comptent pas dans le tri
  const recos = (recosAll ?? []).filter((r) => r.status !== "filtered");
  // Les offres que tu n'as pas voulu postuler (Abandonné, Offre plus disponible, sans date d'envoi) ne sont pas des candidatures
  // l'ancienne étape « Relancé » se lit « Postulé » : sans cela ces lignes sortiraient de la répartition par statut
  const all = ((appsRaw ?? []) as Application[]).filter((a) => !isNeverSent(a)).map((a) => ({ ...a, status: canonicalStatus(a.status) as Application["status"] }));
  const sent = all.filter((a) => a.status !== "a_postuler");

  // Statuts atteints par candidature (historique + statut courant)
  const reached = new Map<string, Set<string>>();
  const firstResponse = new Map<string, string>();
  for (const h of hist ?? []) {
    if (!reached.has(h.application_id)) reached.set(h.application_id, new Set());
    reached.get(h.application_id)!.add(h.to_status);
    if (RESPONSE.has(h.to_status) && !firstResponse.has(h.application_id)) firstResponse.set(h.application_id, h.changed_at);
  }
  for (const a of all) {
    if (!reached.has(a.id)) reached.set(a.id, new Set());
    reached.get(a.id)!.add(a.status);
  }

  const count = (pred: (s: Set<string>) => boolean) => sent.filter((a) => pred(reached.get(a.id)!)).length;
  const responses = count((s) => [...s].some((x) => RESPONSE.has(x)));
  const interviews = count((s) => [...s].some((x) => INTERVIEW.has(x)));
  const offers = count((s) => s.has("offre"));
  const refusals = count((s) => s.has("refuse"));

  const delays: number[] = [];
  for (const a of sent) {
    const fr = firstResponse.get(a.id);
    if (fr && a.applied_at) {
      const d = (new Date(fr).getTime() - new Date(a.applied_at).getTime()) / 864e5;
      if (d >= 0 && d < 180) delays.push(d);
    }
  }

  const today = new Date();
  const ghosted = sent.filter(
    (a) => (a.status === "postule" || a.status === "relance") && a.applied_at && (today.getTime() - new Date(a.applied_at).getTime()) / 864e5 > 21
  ).length;

  // Volume hebdomadaire sur 12 semaines
  const weeks: { week: string; sent: number; responses: number }[] = [];
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  for (let i = 11; i >= 0; i--) {
    const start = new Date(monday.getTime() - i * 7 * 864e5);
    const end = new Date(start.getTime() + 7 * 864e5);
    const inWeek = sent.filter((a) => a.applied_at && new Date(a.applied_at) >= start && new Date(a.applied_at) < end);
    weeks.push({
      week: start.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }),
      sent: inWeek.length,
      responses: inWeek.filter((a) => [...reached.get(a.id)!].some((x) => RESPONSE.has(x))).length,
    });
  }

  const bucket = (a: Application) => (a.score == null ? "Sans score" : a.score >= 70 ? "70+ (forte)" : a.score >= 50 ? "50-69 (moyenne)" : "< 50 (faible)");
  // « texte » : offre collée sans lien, la source n'est pas connue
  const channelLabel = (c: string | null) => (!c ? "" : c === "texte" ? "Annonce collée (sans lien)" : c);

  const emailCats: Record<string, number> = {};
  for (const e of emails ?? []) emailCats[e.category ?? "autre"] = (emailCats[e.category ?? "autre"] ?? 0) + 1;

  // Tri des offres proposées (Recommandées)
  const reasons: Record<string, number> = {};
  const triageBySource = new Map<string, { source: string; accepted: number; rejected: number; pending: number }>();
  for (const r of recos ?? []) {
    const k = r.source ?? "Autre";
    const g = triageBySource.get(k) ?? { source: k, accepted: 0, rejected: 0, pending: 0 };
    if (r.status === "accepted") g.accepted++;
    else if (r.status === "rejected") {
      g.rejected++;
      const why = reasonKey(r.reject_reason) ?? "autre"; // « autre: texte » compte comme « autre »
      reasons[why] = (reasons[why] ?? 0) + 1;
    } else g.pending++;
    triageBySource.set(k, g);
  }
  const acc = (recos ?? []).filter((r) => r.status === "accepted").length;
  const rej = (recos ?? []).filter((r) => r.status === "rejected").length;
  // Une annonce retirée n'est pas un « non » : elle ne compte pas dans le taux d'acceptation
  const gone = (recos ?? []).filter((r) => r.status === "rejected" && r.reject_reason === "expiree").length;

  return {
    triage: {
      received: recos?.length ?? 0,
      accepted: acc,
      rejected: rej,
      pending: (recos?.length ?? 0) - acc - rej,
      acceptance_rate: acc + rej - gone > 0 ? Math.round((acc / (acc + rej - gone)) * 100) : null,
      reject_reasons: reasons,
      by_source: [...triageBySource.values()].sort((a, b) => b.accepted + b.rejected + b.pending - (a.accepted + a.rejected + a.pending)),
    },
    totals: {
      tracked: all.length,
      sent: sent.length,
      responses,
      interviews,
      offers,
      refusals,
      ghosted,
      response_rate: sent.length ? Math.round((responses / sent.length) * 100) : 0,
      interview_rate: sent.length ? Math.round((interviews / sent.length) * 100) : 0,
      avg_days_to_response: delays.length ? Math.round(delays.reduce((a, b) => a + b, 0) / delays.length) : null,
      avg_score_sent: sent.filter((a) => a.score != null).length
        ? Math.round(sent.filter((a) => a.score != null).reduce((s, a) => s + (a.score ?? 0), 0) / sent.filter((a) => a.score != null).length)
        : null,
    },
    funnel: [
      { stage: "Envoyées", value: sent.length },
      { stage: "Réponses", value: responses },
      { stage: "Entretiens", value: interviews },
      { stage: "Offres", value: offers },
    ],
    by_status: STATUSES.map((st) => ({ id: st.id, label: st.label, value: all.filter((a) => a.status === st.id).length })),
    by_channel: group(sent, reached, (a) => channelLabel(a.channel)),
    by_variant: group(sent, reached, (a) => variantLabel(a.cv_variant)),
    by_score: group(sent, reached, bucket),
    by_contract: group(sent, reached, (a) => a.contract ?? ""),
    weeks,
    email_categories: emailCats,
  };
}

export type Stats = Awaited<ReturnType<typeof computeStats>>;
