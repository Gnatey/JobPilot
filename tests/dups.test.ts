// Doublons de candidatures : une offre n'a qu'une ligne « À postuler », une candidature envoyée ou annotée n'est jamais supprimée.
import { pickApplication } from "../lib/app-pick";
import { mergeDuplicateApplications } from "../lib/offer-ops";
import { ok, done } from "./helpers";

ok("pick : liste vide → null", pickApplication([]) === null && pickApplication(null) === null);
ok("pick : envoyée avant à postuler", pickApplication([{ status: "a_postuler", id: 1 }, { status: "postule", id: 2 }, { status: "a_postuler", id: 3 }])?.id === 2);
ok("pick : à postuler avant abandonnée", pickApplication([{ status: "abandonne", id: 1 }, { status: "a_postuler", id: 2 }])?.id === 2);
ok("pick : à égalité, la plus ancienne", pickApplication([{ status: "a_postuler", id: 1 }, { status: "a_postuler", id: 2 }])?.id === 1);

type R = { id: string; offer_id: string | null; status: string; applied_at: string | null; notes: string | null; contact: string | null; salary: string | null; user_id: string };
const mk = (id: string, offer_id: string | null, status: string, extra: Partial<R> = {}): R => ({ id, offer_id, status, applied_at: null, notes: null, contact: null, salary: null, user_id: "u1", ...extra });
let rows: R[] = [
  mk("a1", "o1", "a_postuler"), mk("a2", "o1", "a_postuler"), mk("a3", "o1", "postule", { applied_at: "2026-11-01" }), mk("a4", "o1", "a_postuler"),
  mk("b1", "o2", "a_postuler"), mk("b2", "o2", "a_postuler", { notes: "appelé la RH" }),
  mk("c1", "o3", "a_postuler"),
  mk("d1", null, "a_postuler"), mk("d2", null, "a_postuler"),
  mk("e1", "o4", "postule", { applied_at: "2026-10-30" }), mk("e2", "o4", "postule", { applied_at: "2026-10-31" }),
];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb: any = {
  from: () => ({
    select: () => { const q = { eq: () => q, not: () => q, order: () => q, range: (a: number, b: number) => Promise.resolve({ data: rows.filter((r) => r.offer_id !== null).slice(a, b + 1), error: null }) }; return q; },
    delete: () => { const q = { eq: () => q, in: (_c: string, ids: string[]) => { rows = rows.filter((r) => !ids.includes(r.id)); return Promise.resolve({}); } }; return q; },
  }),
};
const n = await mergeDuplicateApplications(sb, "u1");
const left = rows.map((r) => r.id).sort().join();
ok("fusion : doublons vides retirés, l'envoyée gardée", n === 3 && left === "a3,b1,b2,c1,d1,d2,e1,e2", `${n} retirées, reste : ${left}`);
ok("fusion : la ligne annotée n'est jamais supprimée", rows.some((r) => r.id === "b2"));
ok("fusion : deux candidatures envoyées gardées", rows.some((r) => r.id === "e1") && rows.some((r) => r.id === "e2"));
ok("fusion : lignes sans offre intactes", rows.some((r) => r.id === "d1") && rows.some((r) => r.id === "d2"));
ok("fusion : 2e passage sans effet", (await mergeDuplicateApplications(sb, "u1")) === 0);
done();
