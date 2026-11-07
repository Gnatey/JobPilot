// Bilan de « Tout analyser » : toutes les lignes en échec sont listées avec un lien, une corbeille, et une suppression en lot des annonces disparues.
import { readFileSync } from "node:fs";
import {
  GONE_REASON, SKIP_WHY, bulkMessage, firstOf, groupSkips, linkOf, removeSkips, selectedSkips, skipKind, type Skip,
} from "../lib/analyze-skips";
import { deletionReason } from "../lib/offer-delete";
import { rejectRecosOfApplication } from "../lib/offer-ops";
import { NEUTRAL_REASONS, REJECT_REASONS } from "../lib/types";
import { ok, done } from "./helpers";

const read = (f: string) => readFileSync(f, "utf8");
const sk = (id: string, kind: Skip["kind"], url: string | null = `https://exemple.fr/${id}`): Skip => ({ appId: id, title: `Poste ${id}`, url, kind });

// ---------- La cause d'après le code de l'analyse ----------
ok("410 : annonce retirée", skipKind(410) === "gone");
ok("400 et 422 : annonce illisible", skipKind(400) === "unreadable" && skipKind(422) === "unreadable");
ok("autre code, ou pas de réponse (0) : échec passager, à relancer", skipKind(500) === "failed" && skipKind(0) === "failed" && skipKind(502) === "failed");
ok("429, 503 et 401 n'arrivent jamais ici (arrêt de la file avant) : ils ne sont pas rangés comme « retirée »", skipKind(429) !== "gone" && skipKind(503) !== "gone" && skipKind(401) !== "gone");
ok("les trois causes ont leur phrase", Object.keys(SKIP_WHY).sort().join() === "failed,gone,unreadable" && SKIP_WHY.gone === "annonce plus disponible");

// ---------- La raison notée à la suppression d'une annonce disparue ----------
ok("« expiree » est une raison connue de la suppression (= « Offre plus disponible »)", deletionReason(GONE_REASON) === "expiree" && REJECT_REASONS.some((r) => r.id === GONE_REASON && r.label === "Offre plus disponible"));
ok("et elle est neutre : le tri n'en tire aucune règle sur les goûts", NEUTRAL_REASONS.includes(GONE_REASON));
{
  const calls: { patch?: Record<string, unknown>; in?: unknown[] }[] = [];
  const q: Record<string, unknown> = {};
  const sb = { from: () => { const c: (typeof calls)[number] = {}; calls.push(c); Object.assign(q, { update: (p: Record<string, unknown>) => { c.patch = p; return q; }, in: (_: string, v: unknown[]) => { c.in = v; return q; }, eq: () => q, then: (r: (v: unknown) => void) => r({}) }); return q; } };
  await rejectRecosOfApplication(sb as never, { url: "https://exemple.fr/a", title: "T", company: "C" }, GONE_REASON);
  ok("la recommandation d'où vient la ligne passe en écartée « expiree » (comptée dans Stats comme offre disparue)", calls[0].patch?.status === "rejected" && calls[0].patch?.reject_reason === "expiree" && (calls[0].in ?? []).includes("accepted"));
}

// ---------- Le lien : seulement http(s) ----------
ok("http et https : ouverts", linkOf("https://exemple.fr/offre?id=1") === "https://exemple.fr/offre?id=1" && linkOf("  http://exemple.fr/x ") === "http://exemple.fr/x");
ok("javascript:, data:, texte, vide, absent : jamais ouverts", [linkOf("javascript:alert(1)"), linkOf("data:text/html,<b>x</b>"), linkOf("pas une adresse"), linkOf(""), linkOf(null), linkOf(undefined)].every((x) => x === null));

// ---------- Rangement, retrait, sélection ----------
const all = [sk("a", "gone"), sk("b", "unreadable"), sk("c", "gone"), sk("d", "failed"), sk("e", "gone", null)];
const g = groupSkips(all);
ok("rangées par cause, dans l'ordre reçu", g.gone.map((s) => s.appId).join() === "a,c,e" && g.unreadable.map((s) => s.appId).join() === "b" && g.failed.map((s) => s.appId).join() === "d");
ok("rien n'est perdu au rangement", g.gone.length + g.unreadable.length + g.failed.length === all.length);
ok("une ligne supprimée sort de la liste, les autres restent", removeSkips(all, ["c", "d"]).map((s) => s.appId).join() === "a,b,e" && removeSkips(all, []).length === 5 && removeSkips(all, ["zzz"]).length === 5);
ok("la sélection en lot = toutes les annonces disparues sauf celles décochées", selectedSkips(g.gone, new Set()).length === 3 && selectedSkips(g.gone, new Set(["c"])).map((s) => s.appId).join() === "a,e" && selectedSkips(g.gone, new Set(["a", "c", "e"])).length === 0);
ok("la sélection ne contient jamais une ligne d'une autre cause", selectedSkips(g.gone, new Set()).every((s) => s.kind === "gone"));

// ---------- Listes longues ----------
const many = Array.from({ length: 25 }, (_, i) => i);
ok("liste courte : tout est montré", firstOf([1, 2, 3], false).hidden === 0 && firstOf([1, 2, 3], false).shown.length === 3);
ok("liste longue : 10 premières puis « Voir les 15 autres »", firstOf(many, false).shown.length === 10 && firstOf(many, false).hidden === 15);
ok("« Voir les autres » montre tout", firstOf(many, true).shown.length === 25 && firstOf(many, true).hidden === 0);

// ---------- Message après la suppression en lot ----------
ok("tout supprimé", bulkMessage(1, 0) === "1 ligne supprimée." && bulkMessage(19, 0) === "19 lignes supprimées.");
ok("une partie seulement : on dit combien ont échoué", /^3 lignes supprimées, 1 n'a pas pu l'être/.test(bulkMessage(3, 1)) && /2 n'ont pas pu l'être/.test(bulkMessage(5, 2)));
ok("rien supprimé : on le dit", /^Aucune ligne supprimée \(2 échecs\)/.test(bulkMessage(0, 2)));

// ---------- Branchement de l'écran ----------
{
  const all = read("components/analyze-all.tsx");
  const ui = read("components/analyze-skips.tsx");
  const row = read("components/offer-row-delete.tsx");
  ok("le bilan n'est plus coupé à 8 lignes (« … et 11 autres » : impossible de vérifier)", !/slice\(0, 8\)/.test(all) && !/et \{run\.skipped\.length - 8\}/.test(all));
  ok("chaque échec garde son identifiant, son titre et son adresse, avec la cause d'après le code reçu", /skipKind\(status\)/.test(all) && /appId: it\.app_id/.test(all) && /url: it\.url/.test(all));
  ok("le bilan passe par SkipReport et retire de sa liste les lignes supprimées", /<SkipReport skips=\{run\.skipped\}/.test(all) && /removeSkips\(r\.skipped, ids\)/.test(all));
  ok("les arrêts de la file (429, 503, 401) restent inchangés", /status === 429 \|\| status === 503/.test(all) && /status === 401/.test(all));
  ok("le lien s'ouvre dans un autre onglet, sans donner la main à l'annonce (noopener)", /target="_blank" rel="noopener noreferrer"/.test(ui));
  ok("le lien passe par linkOf (jamais javascript:)", /linkOf\(s\.url\)/.test(ui));
  ok("la liste des annonces disparues n'est jamais coupée : le lot s'applique à toutes, toutes sont visibles", /g\.gone\.map\(/.test(ui) && !/firstOf\(g\.gone/.test(ui));
  ok("la suppression en lot passe par la route de suppression d'une ligne, avec la raison « Offre plus disponible »", /\/api\/applications\/\$\{list\[i\]\.appId\}/.test(ui) && /method: "DELETE"/.test(ui) && /reason: GONE_REASON/.test(ui));
  ok("une confirmation précède la suppression en lot, et elle rappelle de vérifier les liens", /<dialog/.test(ui) && /As-tu ouvert les liens/.test(ui) && /définitive/.test(ui));
  ok("une session expirée arrête le lot", /res\?\.status === 401/.test(ui));
  ok("chaque ligne a sa corbeille ; pour une annonce disparue la fenêtre ne redemande pas de raison", /<OfferRowDelete kind="app"/.test(ui) && /fixedReason=\{s\.kind === "gone" \? GONE_REASON : undefined\}/.test(ui) && /\{!fixedReason && \(/.test(row));
  ok("la corbeille prévient le bilan après une suppression réussie", /onDeleted\?\.\(\)/.test(row));
  ok("les lignes déjà envoyées restent protégées côté serveur", /isUnsentApp\(app\)/.test(read("app/api/applications/[id]/route.ts")));
}
done();
