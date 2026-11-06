import { enforceFacts, languagesText } from "./cv-facts";
import { guardCv } from "./cv-guard";
import type { CvDoc, Profile } from "./types";

/**
 * Contrôle d'un CV DÉJÀ enregistré (peut-être déjà envoyé) : on le compare au profil maître, avec les mêmes règles que celles
 * qui corrigent un nouveau CV (lib/cv-facts.ts et lib/cv-guard.ts). Sans IA, sans réseau, en lecture seule : rien n'est modifié.
 *
 * - « fix » : un fait qui ne colle pas au profil (formation absente, poste ou dates différents, langue, certification inconnue, réserve écrite dans le CV).
 * - « read » : à relire (un chiffre ou un résultat que le profil ne dit pas : souvent écrit à la main par la personne, donc à garder si c'est vrai).
 *
 * Ce contrôle ne lit pas les fautes de frappe.
 */
export type CvIssue = { level: "fix" | "read"; text: string };

const q = (s: string) => `« ${s} »`;

/** Un document vide ou d'un autre format (ancien CV, contenu abîmé) n'est pas un CV qu'on sait contrôler : il n'est jamais déclaré conforme. */
export const isCv = (content: unknown): content is CvDoc => {
  if (!content || typeof content !== "object") return false;
  const cv = content as CvDoc;
  return !!cv.headline || !!cv.experiences?.length;
};

export function checkCv(content: unknown, profile: Profile): CvIssue[] {
  if (!isCv(content)) return [];
  const cv = content;

  const facts = enforceFacts(cv, profile).report;
  const guard = guardCv(cv, profile).report;
  const out: CvIssue[] = [];
  const fix = (text: string) => out.push({ level: "fix", text });
  const read = (text: string) => out.push({ level: "read", text });

  for (const d of facts.restored) fix(`Formation absente du CV : ${q(d)}`);
  for (const d of facts.inventedEducation) fix(`Formation qui ne figure pas dans ton profil : ${q(d)}`);
  for (const r of facts.roles) fix(`${r.company} : poste écrit ${q(r.from)}, ton profil dit ${q(r.to)}`);
  for (const d of facts.dates) fix(`${d.company} : dates ${q(d.from)}, ton profil dit ${q(d.to)}`);
  for (const c of facts.unknownCompanies) fix(`Entreprise ${q(c)} : aucune expérience de ton profil ne porte ce nom`);
  if (facts.languages) fix(`Langues : ${q((cv.languages ?? "").trim() || "aucune")} sur le CV, ${q(languagesText(profile.languages) || "aucune")} dans ton profil`);
  for (const c of facts.inventedCerts) fix(`Certification qui ne figure pas dans ton profil : ${q(c)}`);
  for (const p of guard.placeholders) fix(`${p.where} : la réserve ${q(p.removed)} est écrite dans le CV`);

  for (const c of guard.cut) read(`${c.company} : ${q(c.removed)}, un effet ou un but que ton profil ne dit pas`);
  for (const f of guard.flagged) read(`${f.company} : ${q(f.effect)}, un effet ou un but que ton profil ne dit pas`);
  for (const n of guard.numbers) {
    const list = n.numbers.map(q).join(", ");
    read(`${n.company} : ${n.numbers.length > 1 ? "chiffres" : "chiffre"} ${list} absent${n.numbers.length > 1 ? "s" : ""} de ton profil`);
  }
  return out;
}

export const fixCount = (issues: CvIssue[]) => issues.filter((i) => i.level === "fix").length;
