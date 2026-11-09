// Dates de publication : lecture (données et texte de page), libellés « publiée / reçue / ajoutée », clé de tri. Aucun réseau.
import { agoLabel, parsePosted, postedFromText, recoWhen, whenLabel, whenMs, WHEN_HELP } from "../lib/posted";
import { ok, done } from "./helpers";

const NOW = new Date("2026-11-09T19:30:00Z"); // lundi 9 novembre 2026, 20 h 30 à Paris
const iso = (s: string) => new Date(s).toISOString();

// ---------- parsePosted : données de source et JSON-LD ----------
{
  ok("Adzuna (ISO avec Z)", parsePosted("2026-11-05T09:12:33Z", NOW) === iso("2026-11-05T09:12:33Z"));
  ok("Jooble : 7 décimales, sans fuseau", parsePosted("2026-11-05T00:00:00.0000000", NOW) === iso("2026-11-05T00:00:00Z"));
  ok("JSON-LD : date seule = midi UTC (même jour à Paris)", parsePosted("2026-11-05", NOW) === iso("2026-11-05T12:00:00Z"));
  ok("fuseau +01:00 converti", parsePosted("2026-11-05T09:00:00+01:00", NOW) === iso("2026-11-05T08:00:00Z"));
  ok("JJ/MM/AAAA", parsePosted("03/11/2026", NOW) === iso("2026-11-03T12:00:00Z"));
  ok("espace à la place du T", parsePosted("2026-11-05 14:00:00", NOW) === iso("2026-11-05T14:00:00Z"));
  ok("un 31 février n'existe pas", parsePosted("2026-02-31", NOW) === null);
  ok("un mois 13 n'existe pas", parsePosted("2026-13-01", NOW) === null);
  ok("dans le futur (plus d'un jour) : refusée", parsePosted("2026-12-24", NOW) === null);
  ok("aujourd'hui, midi UTC alors qu'il est plus tôt : ramenée à maintenant, jamais dans le futur", (() => { const early = new Date("2026-11-09T08:00:00Z"); return parsePosted("2026-11-09", early) === early.toISOString(); })());
  ok("plus vieille que 3 ans : refusée (erreur de lecture)", parsePosted("2021-01-01", NOW) === null);
  ok("pas une date, ou pas du texte : null", parsePosted("hier", NOW) === null && parsePosted(null, NOW) === null && parsePosted(12345, NOW) === null && parsePosted("", NOW) === null);
  ok("texte très long : refusé", parsePosted("2026-11-05" + " ".repeat(60) + "x", NOW) === null);
}

// ---------- postedFromText : mention dans le début d'une page ----------
{
  const t = (s: string) => postedFromText(s, NOW);
  ok("« Publiée il y a 3 jours »", t("Data Analyst\nParis\nPubliée il y a 3 jours\nMission…") === new Date(NOW.getTime() - 3 * 864e5).toISOString());
  ok("« Mise en ligne il y a 2 semaines »", t("Mise en ligne il y a 2 semaines") === new Date(NOW.getTime() - 14 * 864e5).toISOString());
  ok("« Publié il y a 5 heures »", t("Publié il y a 5 heures") === new Date(NOW.getTime() - 5 * 36e5).toISOString());
  ok("anglais : « Posted 4 days ago »", t("Posted 4 days ago") === new Date(NOW.getTime() - 4 * 864e5).toISOString());
  ok("« Publiée aujourd'hui » et « Publiée hier »", t("Publiée aujourd'hui") === NOW.toISOString() && t("Publiée hier") === new Date(NOW.getTime() - 864e5).toISOString());
  ok("« Publiée le 03/11/2026 »", t("Offre publiée le 03/11/2026 à Paris") === iso("2026-11-03T12:00:00Z"));
  ok("« Publiée le 3 novembre 2026 » et « 1er octobre 2026 »", t("Publiée le 3 novembre 2026") === iso("2026-11-03T12:00:00Z") && t("Publiée le 1er octobre 2026") === iso("2026-10-01T12:00:00Z"));
  ok("LinkedIn : ligne « Il y a 3 jours · Plus de 100 candidatures »", t("Data Analyst\nParis\nIl y a 3 jours · Plus de 100 candidatures\n") === new Date(NOW.getTime() - 3 * 864e5).toISOString());
  ok("LinkedIn : ligne « Il y a 1 semaine »", t("Titre\nIl y a 1 semaine\n") === new Date(NOW.getTime() - 7 * 864e5).toISOString());
  ok("LinkedIn en anglais : « 2 days ago »", t("Title\n2 days ago · 40 applicants") === new Date(NOW.getTime() - 2 * 864e5).toISOString());
  // Ce qui n'est PAS la publication
  ok("« active il y a 2 jours » : pas une publication", t("Employeur actif il y a 2 jours\nActive il y a 2 jours") === null);
  ok("« actualisée il y a 3 jours » : pas une publication", t("Annonce actualisée il y a 3 jours") === null);
  ok("« republié il y a 2 jours » : pas une publication", t("Republié il y a 2 jours\nRepublished 2 days ago") === null);
  ok("« il y a 5 ans d'expérience » dans une phrase : rien", t("Nous cherchons un profil. Il y a 5 jours ouvrés de congés par an.") === null);
  ok("une ligne « il y a 3 jours » au milieu d'une phrase : rien", t("Le poste a été créé il y a 3 jours pour renforcer l'équipe.") === null);
  ok("« il y a 2 ans » : rien (hors des unités reconnues)", t("Il y a 2 ans · Data") === null);
  ok("texte vide ou absent : null", t("") === null && postedFromText(null, NOW) === null && postedFromText(undefined, NOW) === null);
  ok("la mention doit être dans le DÉBUT de la page (pied de page ignoré)", t("x".repeat(1600) + "\nPubliée il y a 3 jours") === null);
  ok("une publication vieille de plus de 3 ans est refusée (erreur de lecture)", t("Publiée il y a 400 jours") !== null && t("Publiée il y a 200 semaines") === null);
}

// ---------- Libellés ----------
{
  const at = (d: number) => new Date(NOW.getTime() - d * 864e5).toISOString();
  ok("agoLabel : aujourd'hui, hier, il y a N j, semaines, mois", agoLabel(NOW.toISOString(), NOW) === "aujourd'hui" && agoLabel(at(1), NOW) === "hier" && agoLabel(at(3), NOW) === "il y a 3 j" && agoLabel(at(21), NOW) === "il y a 3 sem." && agoLabel(at(90), NOW) === "il y a 3 mois");
  ok("agoLabel : date illisible = vide", agoLabel("n'importe quoi", NOW) === "");
  ok("les jours se comptent à Paris : minuit passé à Paris = « hier » le matin", agoLabel("2026-11-08T22:30:00Z", new Date("2026-11-09T07:00:00Z")) === "hier"); // 23 h 30 le 8 à Paris, et il est 8 h le 9 : hier
  ok("whenLabel : publiée / reçue / ajoutée", whenLabel({ at: at(3), kind: "posted" }, NOW) === "publiée il y a 3 j" && whenLabel({ at: at(1), kind: "received" }, NOW) === "reçue hier" && whenLabel({ at: NOW.toISOString(), kind: "added" }, NOW) === "ajoutée aujourd'hui");
  ok("whenLabel : sans date = vide", whenLabel({ at: null, kind: "received" }, NOW) === "");
  ok("chaque sorte de date a son explication", (["posted", "received", "added"] as const).every((k) => WHEN_HELP[k].length > 20));
}

// ---------- recoWhen : quelle date, de quelle sorte ----------
{
  const r = (o: Record<string, unknown>) => recoWhen({ received_at: null, ...o } as Parameters<typeof recoWhen>[0]);
  ok("date de publication lue : « publiée », elle passe avant la date d'arrivée", (() => { const w = r({ posted_at: "2026-11-01T12:00:00Z", received_at: "2026-11-08T08:00:00Z", origin: "email" }); return w.kind === "posted" && w.at === "2026-11-01T12:00:00Z"; })());
  ok("source de recherche (Adzuna, Jooble) : la date de la source est une publication", (() => { const w = r({ received_at: "2026-11-05T08:00:00Z", origin: "search" }); return w.kind === "posted" && w.at === "2026-11-05T08:00:00Z"; })());
  ok("alerte e-mail : « reçue »", r({ received_at: "2026-11-05T08:00:00Z", origin: "email" }).kind === "received");
  ok("offre prise depuis une page : « ajoutée »", r({ received_at: "2026-11-05T08:00:00Z", origin: "page" }).kind === "added");
  ok("origine inconnue : « reçue »", r({ received_at: "2026-11-05T08:00:00Z" }).kind === "received");
  ok("aucune date valable : at = null", r({ received_at: "n'importe quoi", posted_at: "pas une date" }).at === null && r({}).at === null);
  ok("whenMs : instant, ou -Infinity sans date", whenMs({ at: "2026-11-05T00:00:00Z", kind: "posted" }) === Date.parse("2026-11-05T00:00:00Z") && whenMs({ at: null, kind: "posted" }) === -Infinity && whenMs({ at: "x", kind: "posted" }) === -Infinity);
}

done();
