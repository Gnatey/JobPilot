// « Garder pour plus tard » : enregistrer une offre, ou le texte de son annonce, sans IA. Contrôles de la logique pure (lib/offer-keep.ts), de la clé de
// doublon de la synchro des e-mails (lib/dedupe-key.ts) et du rapprochement ligne ↔ recommandation dans la file d'analyse.
import { MIN_TEXT, UNTITLED, cleanAdText, keepMessage, planKeep, titleFromUrl } from "../lib/offer-keep";
import { dedupeKey, normKey } from "../lib/dedupe-key";
import { normalizeJobUrl } from "../lib/fetch-offer";
import { buildQueue, type QueueApp, type QueueReco } from "../lib/analyze-queue";
import { ok, done } from "./helpers";

const longText = "Nous cherchons un data analyst pour construire des tableaux de bord et fiabiliser les données. ".repeat(3); // > 150 caractères

// ---------- Titre deviné d'après l'adresse ----------
ok("un titre lisible se tire de la fin de l'adresse", titleFromUrl("https://www.welcometothejungle.com/fr/companies/hublo/jobs/junior-data-engineer_paris") === "Junior data engineer paris");
ok("une adresse LinkedIn avec des mots", titleFromUrl("https://www.linkedin.com/jobs/view/data-analyst-at-acme-3812345678") === "Data analyst at acme");
ok("un numéro seul ne dit rien", titleFromUrl("https://www.hellowork.com/fr-fr/emplois/82945204.html") === "");
ok("un identifiant opaque ne dit rien", titleFromUrl("https://www.indeed.fr/viewjob?jk=ab12cd34ef56") === "");
ok("un seul mot ne suffit pas", titleFromUrl("https://exemple.fr/emplois/analyste") === "");
ok("pas d'adresse : vide, sans erreur", titleFromUrl(null) === "" && titleFromUrl("pas une adresse") === "");
ok("les caractères encodés sont lus", titleFromUrl("https://exemple.fr/offres/charg%C3%A9-d-%C3%A9tudes-statistiques") === "Chargé d études statistiques");

// ---------- planKeep ----------
const withUrl = planKeep({ url: "https://www.hellowork.com/fr-fr/emplois/82945204.html?utm_source=x" });
ok("un lien suffit", withUrl.ok && withUrl.plan.url === "https://www.hellowork.com/fr-fr/emplois/82945204.html" && withUrl.plan.site === "HelloWork");
ok("sans poste deviné, le poste est « Annonce à analyser »", withUrl.ok && withUrl.plan.title === UNTITLED && !withUrl.plan.titleGuessed);
const slug = planKeep({ url: "https://www.welcometothejungle.com/fr/companies/hublo/jobs/junior-data-engineer_paris" });
ok("le titre deviné est marqué comme tel", slug.ok && slug.plan.titleGuessed && slug.plan.title.startsWith("Junior data engineer"));
const typed = planKeep({ url: "https://exemple.fr/o/1", title: "  Data   analyst  ", company: "Acme" });
ok("le poste saisi l'emporte, espaces nettoyés", typed.ok && typed.plan.title === "Data analyst" && typed.plan.company === "Acme" && !typed.plan.titleGuessed);
const bad = planKeep({ url: "javascript:alert(1)" });
ok("un lien qui n'est pas http(s) est refusé", !bad.ok);
ok("rien du tout : refusé avec un message clair", (() => { const r = planKeep({}); return !r.ok && /lien/.test(r.error); })());
ok("texte trop court sans lien : refusé, avec le nombre de caractères", (() => { const r = planKeep({ text: "Trop court", title: "X" }); return !r.ok && r.error.includes(String(MIN_TEXT)); })());
ok("texte sans lien ni poste : refusé (le poste est la seule façon de retrouver la ligne)", (() => { const r = planKeep({ text: longText }); return !r.ok && /poste/i.test(r.error); })());
const txt = planKeep({ text: longText, title: "Data analyst", company: "Acme" });
ok("texte + poste sans lien : accepté", txt.ok && txt.plan.url === null && txt.plan.text.length >= MIN_TEXT && txt.plan.site === "texte");
ok("le texte est nettoyé et plafonné", (() => { const r = planKeep({ url: "https://exemple.fr/o/1", text: "a\u0000b ".repeat(20000) }); return r.ok && !r.plan.text.includes("\u0000") && r.plan.text.length <= 20000; })());
ok("champs non textuels ignorés sans erreur", (() => { const r = planKeep({ url: "https://exemple.fr/o/1", title: 42, company: { x: 1 }, text: null }); return r.ok && r.plan.title === UNTITLED && r.plan.company === ""; })());

// ---------- Clé de doublon (partagée avec lib/sync.ts) ----------
ok("normKey enlève accents, majuscules, « groupe/SA » et la ponctuation", normKey("Société Générale SA") === "societegenerale" && normKey("École du Groupe-Acme") === "ecoleduacme");
ok("sans lien : poste + entreprise normalisés", dedupeKey("", "Data Analyst", "Acme SAS") === "dataanalyst|acme");
ok("avec lien : l'adresse normalisée en minuscules", dedupeKey("https://WWW.hellowork.com/fr-fr/emplois/1.html?utm_source=x", "a", "b") === normalizeJobUrl("https://WWW.hellowork.com/fr-fr/emplois/1.html?utm_source=x").toLowerCase());

// ---------- Messages ----------
ok("chaque issue a sa phrase", (["kept", "exists", "tracked", "analyzed", "missing"] as const).every((o) => keepMessage(o, "Poste").length > 10));
ok("le texte gardé ou remplacé est dit ; sans texte, la phrase dit comment en ajouter un ; trop court, elle le dit",
  /gardé sur cette ligne/.test(keepMessage("exists", "Poste", "added")) && /remplacé/.test(keepMessage("exists", "Poste", "replaced")) && /déjà gardé/.test(keepMessage("exists", "Poste", "same"))
  && /colle-le/.test(keepMessage("exists", "Poste", "none")) && /trop court/.test(keepMessage("exists", "Poste", "short")) && /trop court/.test(keepMessage("kept", "Poste", "short"))
  && /son texte est gardé/i.test(keepMessage("kept", "Poste", "added")));
ok("le texte collé pour une ligne ouverte est nettoyé et plafonné ; autre chose qu'un texte = vide", (() => { const t = cleanAdText("a\u0000b ".repeat(20000)); return !t.includes("\u0000") && t.length <= 20000 && cleanAdText(42) === "" && cleanAdText(undefined) === ""; })());
// ---------- La file d'analyse rapproche une ligne gardée de SON texte ----------
const reco = (id: string, over: Partial<QueueReco>): QueueReco => ({ id, title: UNTITLED, company: "", url: null, quick_score: 40, source: "page", origin: "page", snippet: longText.repeat(2) + id, ...over });
const app = (id: string, over: Partial<QueueApp>): QueueApp => ({ id, title: UNTITLED, company: "Entreprise ?", url: null, created_at: "2026-11-07", ...over });
{
  const q = buildQueue(
    [app("a1", { url: "https://exemple.fr/o/1" }), app("a2", { url: "https://exemple.fr/o/2" })],
    [reco("r1", { url: "https://exemple.fr/o/1" }), reco("r2", { url: "https://exemple.fr/o/2" })]
  );
  ok("deux lignes « Annonce à analyser » trouvent chacune leur recommandation par l'adresse", q.items.find((i) => i.app_id === "a1")?.reco_id === "r1" && q.items.find((i) => i.app_id === "a2")?.reco_id === "r2");
}
{
  const q = buildQueue([app("a3", { url: null })], [reco("r3", { url: null })]);
  ok("une ligne sans adresse et sans titre n'est JAMAIS rapprochée d'une autre par le titre « Annonce à analyser »", q.items.length === 0 && q.skipped.length === 1);
}
{
  const q = buildQueue([app("a4", { title: "Data analyst", company: "Entreprise ?" })], [reco("r4", { title: "Data analyst", company: "" })]);
  ok("« Entreprise ? » (inconnue) se rapproche d'une recommandation sans entreprise (texte collé avec un poste)", q.items[0]?.reco_id === "r4" && q.items[0].full);
}
{
  const q = buildQueue([app("a5", { title: "Data analyst", company: "Entreprise ?" })], [reco("r5", { title: "Data analyst", company: "Acme" })]);
  ok("mais pas d'une recommandation d'une entreprise connue (autre annonce)", q.items.length === 0);
}

done();
