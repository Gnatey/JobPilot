"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Plus, Trash2, Wand2, Loader2, CircleCheck } from "lucide-react";
import { supabaseBrowser, myId } from "@/lib/supabase/client";
import { PageTitle, Section, Skeleton } from "@/components/ui/page-title";
import { useFeedback } from "@/components/ui/feedback";
import { EMPTY_PROFILE } from "@/lib/empty-profile";
import { SkillSuggestions } from "@/components/skill-suggestions";
import { ProfileAudit } from "@/components/profile-audit";
import { TodoAnswer } from "@/components/todo-answer";
import { addSkills, dismissSkills } from "@/lib/skills";
import type { Education, Experience, Profile, Project } from "@/lib/types";

const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
const csv = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

/** Zone « une ligne par élément » : garde ce que tu tapes tel quel, enregistre la version propre. */
function LinesField({ value, onChange, rows = 4, label, hint, mono }: { value: string; onChange: (lines: string[]) => void; rows?: number; label: string; hint?: string; mono?: boolean }) {
  const [text, setText] = useState(value);
  return (
    <label className="block">
      <span className="label">{label}</span>
      <textarea rows={rows} className={`field mt-1 text-sm ${mono ? "font-mono" : ""}`} value={text} onChange={(e) => { setText(e.target.value); onChange(lines(e.target.value)); }} />
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

function Remove({ onClick, label }: { onClick: () => void; label: string }) {
  return <button type="button" className="btn btn-ghost btn-icon text-bad" aria-label={label} onClick={onClick}><Trash2 size={16} /></button>;
}

export default function ProfilPage() {
  const sb = useMemo(() => supabaseBrowser(), []);
  const { toast, confirm } = useFeedback();
  const [p, setP] = useState<Profile | null>(null);
  const [state, setState] = useState<"idle" | "dirty" | "saving" | "saved" | "error">("idle");
  const [json, setJson] = useState("");
  const [jsonErr, setJsonErr] = useState<string | null>(null);
  const [rev, setRev] = useState(0); // remonte les champs « une ligne par élément » après un import
  const latest = useRef<Profile | null>(null);
  const edited = useRef(false);

  useEffect(() => {
    sb.from("profiles").select("data").maybeSingle().then(({ data }) => {
      const raw = (data?.data && Object.keys(data.data).length ? data.data : EMPTY_PROFILE) as Profile;
      // un profil ancien ou incomplet ne doit jamais faire planter la page
      const prof: Profile = { ...EMPTY_PROFILE, ...raw, identity: { ...EMPTY_PROFILE.identity, ...raw.identity, links: raw.identity?.links ?? [] }, preferences: { ...EMPTY_PROFILE.preferences, ...raw.preferences } };
      setP(prof);
      latest.current = prof;
      setJson(JSON.stringify(prof, null, 2));
    });
  }, [sb]);

  const persist = useCallback(async (next: Profile) => {
    setState("saving");
    const id = await myId(sb);
    if (!id) { setState("error"); return toast("Session expirée : reconnecte-toi.", { tone: "err" }); }
    const { error } = await sb.from("profiles").upsert({ user_id: id, data: next, updated_at: new Date().toISOString() });
    if (error) { setState("error"); return toast("Le profil n'a pas pu être enregistré.", { tone: "err" }); }
    setJson(JSON.stringify(next, null, 2));
    setState(latest.current === next ? "saved" : "dirty");
  }, [sb, toast]);

  // Enregistrement automatique 1 seconde après la dernière frappe
  useEffect(() => {
    if (!edited.current || !p) return;
    setState("dirty");
    const t = setTimeout(() => persist(p), 1000);
    return () => clearTimeout(t);
  }, [p, persist]);
  useEffect(() => {
    const flush = () => { if (document.visibilityState === "hidden" && edited.current && latest.current) persist(latest.current); };
    document.addEventListener("visibilitychange", flush);
    return () => document.removeEventListener("visibilitychange", flush);
  }, [persist]);

  const change = (next: Profile) => { edited.current = true; latest.current = next; setP(next); };

  if (!p) return <div className="space-y-4"><Skeleton className="h-12 w-64" /><Skeleton className="h-40" /><Skeleton className="h-64" /></div>;
  const upd = (patch: Partial<Profile>) => change({ ...p, ...patch });
  const updExp = (i: number, patch: Partial<Experience>) => upd({ experiences: p.experiences.map((e, j) => (j === i ? { ...e, ...patch } : e)) });
  const updEdu = (i: number, patch: Partial<Education>) => upd({ education: p.education.map((e, j) => (j === i ? { ...e, ...patch } : e)) });
  const updPro = (i: number, patch: Partial<Project>) => upd({ projects: p.projects.map((e, j) => (j === i ? { ...e, ...patch } : e)) });

  return (
    <>
      <PageTitle title="Profil maître" sub="Tout ton parcours, même ce qui ne tient pas sur une page. Chaque CV est taillé à partir d'ici, rien n'est inventé.">
        <p className="flex items-center gap-1.5 text-sm text-muted" role="status">
          {state === "saving" ? <><Loader2 size={14} className="animate-spin" /> Enregistrement…</>
            : state === "error" ? <span className="text-bad">Non enregistré</span>
            : state === "dirty" ? "Modifications en cours…"
            : <><CircleCheck size={14} className="text-good" /> Enregistré automatiquement</>}
        </p>
      </PageTitle>

      <ProfileAudit getProfile={() => latest.current ?? p} onChange={(next) => { change(next); setRev((r) => r + 1); }} />

      <SkillSuggestions
        onAccept={(s) => { change(addSkills(latest.current ?? p, [{ category: s.category, skill: s.skill }])); setRev((r) => r + 1); }}
        onDismiss={(s) => change(dismissSkills(latest.current ?? p, [s.skill]))} />

      <div key={rev}>
        <TodoAnswer getProfile={() => latest.current ?? p} onChange={(next) => { change(next); setRev((r) => r + 1); }} />

        <Section title="Identité">
          <div className="grid gap-3 sm:grid-cols-2">
            {(["name", "email", "phone", "city", "mobility", "availability"] as const).map((k) => (
              <label key={k}>
                <span className="label">{{ name: "Nom", email: "Email", phone: "Téléphone", city: "Ville", mobility: "Mobilité", availability: "Disponibilité" }[k]}</span>
                <input className="field mt-1" value={p.identity[k] ?? ""} onChange={(e) => upd({ identity: { ...p.identity, [k]: e.target.value } })} />
              </label>
            ))}
            <div className="sm:col-span-2">
              <LinesField label="Liens (un par ligne : Libellé | URL)" rows={3} mono
                value={p.identity.links.map((l) => `${l.label} | ${l.url}`).join("\n")}
                onChange={(ls) => upd({ identity: { ...p.identity, links: ls.map((l) => { const [label, url] = l.split("|").map((x) => x.trim()); return { label, url: url ?? label }; }) } })} />
            </div>
          </div>
        </Section>

        <Section title="Métiers visés" aside={<button className="btn btn-sm btn-ghost" onClick={() => upd({ targets: [...p.targets, { id: `cible_${p.targets.length + 1}`, title: "", pitch: "" }] })}><Plus size={15} /> Ajouter</button>}>
          <p className="mb-3 text-sm text-muted">Un CV distinct par métier. L'analyse de chaque offre choisit le plus adapté.</p>
          <div className="space-y-4">
            {p.targets.map((t, i) => (
              <div key={i} className="card grid gap-2 p-3 sm:grid-cols-[1fr_auto]">
                <input className="field" aria-label="Intitulé" placeholder="Intitulé" value={t.title} onChange={(e) => upd({ targets: p.targets.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} />
                <Remove label="Supprimer ce métier" onClick={() => upd({ targets: p.targets.filter((_, j) => j !== i) })} />
                <textarea rows={2} className="field sm:col-span-2" placeholder="Positionnement en une phrase" value={t.pitch} onChange={(e) => upd({ targets: p.targets.map((x, j) => (j === i ? { ...x, pitch: e.target.value } : x)) })} />
              </div>
            ))}
          </div>
        </Section>

        <Section title="Expériences" aside={<button className="btn btn-sm btn-ghost" onClick={() => upd({ experiences: [{ id: crypto.randomUUID(), company: "", role: "", start: "", end: "", achievements: [] }, ...p.experiences] })}><Plus size={15} /> Ajouter</button>}>
          <div className="space-y-5">
            {p.experiences.map((e, i) => (
              <div key={e.id} className="card p-4">
                <div className="grid gap-2 sm:grid-cols-2">
                  <input className="field font-semibold" aria-label="Poste" placeholder="Poste" value={e.role} onChange={(ev) => updExp(i, { role: ev.target.value })} />
                  <input className="field" aria-label="Entreprise" placeholder="Entreprise" value={e.company} onChange={(ev) => updExp(i, { company: ev.target.value })} />
                  <input className="field" aria-label="Type" placeholder="Type (Alternance, CDI…)" value={e.type ?? ""} onChange={(ev) => updExp(i, { type: ev.target.value })} />
                  <input className="field" aria-label="Lieu" placeholder="Lieu" value={e.location ?? ""} onChange={(ev) => updExp(i, { location: ev.target.value })} />
                  <input className="field" aria-label="Début" placeholder="Début (ex : sept. 2023)" value={e.start} onChange={(ev) => updExp(i, { start: ev.target.value })} />
                  <input className="field" aria-label="Fin" placeholder="Fin (ex : en cours)" value={e.end} onChange={(ev) => updExp(i, { end: ev.target.value })} />
                </div>
                <div className="mt-3">
                  <LinesField label="Réalisations, une par ligne. Ajoute des chiffres quand tu les as." rows={Math.max(3, e.achievements.length + 1)}
                    value={e.achievements.map((a) => a.text).join("\n")}
                    onChange={(ls) => updExp(i, { achievements: ls.map((text, k) => e.achievements.find((a) => a.text === text) ?? (ls.length === e.achievements.length && e.achievements[k] ? { ...e.achievements[k], text } : { text, tags: [] })) })} />
                  {(() => { const from = [...new Set(e.achievements.flatMap((a) => a.sources ?? []))]; return from.length ? <p className="mt-1 text-xs text-muted">Réalisations tirées de : {from.join(", ")}</p> : null; })()}
                </div>
                <button className="btn btn-sm btn-ghost mt-2 text-bad" onClick={() => upd({ experiences: p.experiences.filter((_, j) => j !== i) })}><Trash2 size={14} /> Retirer cette expérience</button>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Compétences">
          <LinesField label="Une catégorie par ligne : Catégorie : outil, outil, outil" rows={7}
            value={Object.entries(p.skills).map(([k, v]) => `${k} : ${v.join(", ")}`).join("\n")}
            onChange={(ls) => upd({ skills: Object.fromEntries(ls.map((l) => { const [k, ...rest] = l.split(":"); return [k.trim(), csv(rest.join(":"))]; })) })} />
        </Section>

        <Section title="Formations" aside={<button className="btn btn-sm btn-ghost" onClick={() => upd({ education: [...p.education, { degree: "", school: "" }] })}><Plus size={15} /> Ajouter</button>}>
          <div className="space-y-3">
            {p.education.map((e, i) => (
              <div key={i} className="card grid gap-2 p-3 sm:grid-cols-[1fr_1fr_6rem_6rem_auto]">
                <input className="field" aria-label="Diplôme" placeholder="Diplôme" value={e.degree} onChange={(ev) => updEdu(i, { degree: ev.target.value })} />
                <input className="field" aria-label="École" placeholder="École" value={e.school} onChange={(ev) => updEdu(i, { school: ev.target.value })} />
                <input className="field" aria-label="Début" placeholder="Début" value={e.start ?? ""} onChange={(ev) => updEdu(i, { start: ev.target.value })} />
                <input className="field" aria-label="Fin" placeholder="Fin" value={e.end ?? ""} onChange={(ev) => updEdu(i, { end: ev.target.value })} />
                <Remove label="Supprimer cette formation" onClick={() => upd({ education: p.education.filter((_, j) => j !== i) })} />
              </div>
            ))}
            {!p.education.length && <p className="text-sm text-muted">Aucune formation renseignée.</p>}
          </div>
        </Section>

        <Section title="Projets" aside={<button className="btn btn-sm btn-ghost" onClick={() => upd({ projects: [...p.projects, { name: "", description: "", tags: [] }] })}><Plus size={15} /> Ajouter</button>}>
          <div className="space-y-3">
            {p.projects.map((e, i) => (
              <div key={i} className="card grid gap-2 p-3 sm:grid-cols-[1fr_6rem_auto]">
                <input className="field font-semibold" aria-label="Nom du projet" placeholder="Nom du projet" value={e.name} onChange={(ev) => updPro(i, { name: ev.target.value })} />
                <input className="field" aria-label="Année" placeholder="Année" value={e.year ?? ""} onChange={(ev) => updPro(i, { year: ev.target.value })} />
                <Remove label="Supprimer ce projet" onClick={() => upd({ projects: p.projects.filter((_, j) => j !== i) })} />
                <textarea rows={2} className="field sm:col-span-3" aria-label="Description" placeholder="Ce que tu as fait, avec quel résultat" value={e.description} onChange={(ev) => updPro(i, { description: ev.target.value })} />
                <input className="field sm:col-span-2" aria-label="Outils" placeholder="Outils, séparés par des virgules" defaultValue={e.tags.join(", ")} onBlur={(ev) => updPro(i, { tags: csv(ev.target.value) })} />
                <input className="field" aria-label="Lien" placeholder="Lien (facultatif)" value={e.link ?? ""} onChange={(ev) => updPro(i, { link: ev.target.value })} />
                <label className="flex items-center gap-2 text-sm sm:col-span-3">
                  <input type="checkbox" className="h-4 w-4 accent-[var(--color-marigold)]" checked={!!e.pin} onChange={(ev) => updPro(i, { pin: ev.target.checked })} />
                  Toujours sur mes CV <span className="text-muted">(même si l'offre ne le cite pas ; 3 projets au plus par CV)</span>
                </label>
              </div>
            ))}
            {!p.projects.length && <p className="text-sm text-muted">Aucun projet renseigné.</p>}
          </div>
        </Section>

        <div className="grid gap-x-10 md:grid-cols-3">
          <Section title="Certifications">
            <LinesField label="Une par ligne" rows={5} value={p.certifications.join("\n")} onChange={(ls) => upd({ certifications: ls })} />
          </Section>
          <Section title="Langues">
            <LinesField label="Langue : niveau" rows={5} value={p.languages.map((l) => `${l.name} : ${l.level}`).join("\n")}
              onChange={(ls) => upd({ languages: ls.map((l) => { const [name, ...rest] = l.split(":"); return { name: name.trim(), level: rest.join(":").trim() }; }) })} />
          </Section>
          <Section title="Centres d'intérêt">
            <LinesField label="Un par ligne" rows={5} value={p.interests.join("\n")} onChange={(ls) => upd({ interests: ls })} />
          </Section>
        </div>

        <Section title="Règles pour l'IA">
          <LinesField label="Ce que le générateur doit toujours respecter, une règle par ligne" rows={5} value={p.rules.join("\n")} onChange={(ls) => upd({ rules: ls })} />
        </Section>
      </div>

      <Section title="Mettre à jour depuis un CV">
        <p className="mb-3 max-w-[60ch] text-sm text-muted">Dépose ton CV dans « Mon CV » : l'app l'analyse, te dit quoi corriger et ajoute au profil ce qui est nouveau, sans rien supprimer.</p>
        <Link href="/mon-cv" className="btn"><Wand2 size={16} /> Aller dans Mon CV</Link>
      </Section>

      <details className="mb-10 rounded-2xl border border-line bg-surface p-4">
        <summary className="cursor-pointer font-semibold">Mode expert : profil complet en JSON</summary>
        <p className="mb-2 mt-2 text-sm text-muted">Pour les cas rares. Une erreur de syntaxe est refusée avant d'écraser quoi que ce soit.</p>
        <textarea rows={16} className="field font-mono text-xs" value={json} onChange={(e) => { setJson(e.target.value); setJsonErr(null); }} spellCheck={false} />
        {jsonErr && <p className="mt-1 text-sm text-bad">{jsonErr}</p>}
        <button className="btn mt-2" onClick={() => {
          try {
            const next = JSON.parse(json) as Profile;
            edited.current = false; latest.current = next; setP(next); persist(next).then(() => setRev((x) => x + 1));
          } catch (e) { setJsonErr(`JSON invalide : ${(e as Error).message}`); }
        }}>Appliquer le JSON</button>
      </details>
    </>
  );
}
