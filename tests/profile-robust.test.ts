// Profil toujours complet (lib/profile.ts) : un réglage écrit AVANT que le profil existe ne doit pas créer un profil « partiel » (sans expériences, sans identité…),
// que toutes les pages liraient ensuite comme un vrai profil. Audit du 16 novembre 2026. Sans réseau.
import { ok, done } from "./helpers";
import { fakeSupabase } from "./fake-supabase";
import { getProfile, patchPreferences, completeProfile } from "../lib/profile";

(async () => {
  // 1. Réglage de langue d'une personne dont le profil n'a pas encore été créé
  const a = fakeSupabase({});
  await patchPreferences(a.sb, "u1", { lang: "tr" });
  const p = await getProfile(a.sb, { id: "u1", email: "a@b.fr" });
  ok("réglage avant le profil : le profil lu est complet (listes présentes)", Array.isArray(p.experiences) && Array.isArray(p.education) && Array.isArray(p.projects) && Array.isArray(p.todo) && Array.isArray(p.rules) && !!p.identity && Array.isArray(p.identity.links));
  ok("réglage avant le profil : le réglage est gardé", p.preferences.lang === "tr" && Array.isArray(p.preferences.contracts));

  // 2. Un profil déjà écrit de façon partielle (avant ce correctif) est complété à la lecture, sans rien perdre
  const b = fakeSupabase({ profiles: [{ user_id: "u2", data: { preferences: { lang: "en", daily_quota: 7 } } }] });
  const q = await getProfile(b.sb, { id: "u2", email: "c@d.fr" });
  ok("profil partiel déjà en base : complété à la lecture", Array.isArray(q.experiences) && Array.isArray(q.skills ? [1] : []) && typeof q.skills === "object" && Array.isArray(q.certifications) && Array.isArray(q.languages) && Array.isArray(q.interests));
  ok("profil partiel : ce qui existait est gardé", q.preferences.lang === "en" && q.preferences.daily_quota === 7);
  ok("profil partiel : l'adresse du compte complète l'identité", q.identity.email === "c@d.fr");

  // 3. Un profil complet n'est pas modifié (même contenu)
  const full = { identity: { name: "J", email: "j@x.fr", links: [] }, targets: [], experiences: [{ id: "e", company: "X", role: "Y", start: "", end: "", achievements: [] }], education: [], projects: [], skills: { a: ["b"] }, certifications: [], languages: [], interests: [], preferences: { contracts: ["CDI"] }, rules: ["r"], todo: [] };
  const c = fakeSupabase({ profiles: [{ user_id: "u3", data: full }] });
  const r = await getProfile(c.sb, { id: "u3", email: "z@z.fr" });
  ok("profil complet : rien n'est changé", JSON.stringify(r) === JSON.stringify(full));
  ok("completeProfile ne casse pas sur n'importe quoi", completeProfile(null, undefined).experiences.length === 0 && completeProfile("x", "a@b.fr").todo.length === 0 && completeProfile([], null).rules.length > 0);

  // 4. patchPreferences sur un profil existant garde tout le reste
  await patchPreferences(c.sb, "u3", { daily_quota: 9 });
  const r2 = await getProfile(c.sb, { id: "u3" });
  ok("patchPreferences : le reste du profil est intact", r2.experiences.length === 1 && r2.preferences.daily_quota === 9 && r2.preferences.contracts[0] === "CDI" && r2.rules[0] === "r");
  done();
})();
