// Écarts de l'analyse : ce que l'annonce demande et que le profil n'a pas, jamais un reproche fait à l'annonce (lib/analysis-gaps.ts) ; sans réseau ni IA.
import { readFileSync } from "node:fs";
import { ok, done } from "./helpers";
import { isVagueOfferGap, dropVagueOfferGaps } from "../lib/analysis-gaps";

const read = (p: string) => readFileSync(p, "utf8"); // les tests tournent depuis la racine du dépôt

/* ---------- Ce qui est retiré : le manque de détail de l'ANNONCE ---------- */
const VAGUE = [
  "Offre non détaillée (absence de missions et compétences requises précises)", // le cas SPIE du 17 novembre
  "Offre peu détaillée",
  "L'offre manque de précision",
  "Annonce vague",
  "Description floue",
  "Annonce incomplète sur les missions",
  "Fiche de poste succincte",
  "Offre imprécise sur les outils",
  "Absence de détails dans l'annonce",
  "Description du poste pas assez précise",
  "Annonce trop sommaire",
];
for (const g of VAGUE) ok(`retiré : « ${g} »`, isVagueOfferGap({ gap: g }));

/* ---------- Ce qui reste : un vrai écart du profil ---------- */
const REAL = [
  "Pas d'expérience en Kubernetes demandée dans l'offre",
  "Certification AWS exigée",
  "Expérience de 5 ans en management d'équipe",
  "SAP BW non cité dans le profil",
  "Connaissance de Snowflake (l'offre la place en indispensable)",
  "Aucune expérience du secteur bancaire, que l'annonce met en avant",
  "Maîtrise du néerlandais",
  "Anglais courant demandé dans l'annonce",
  "Description des flux ETL : le profil ne la détaille pas",
  "Précision attendue sur la volumétrie traitée",
  "Expérience du cloud non renseignée dans le profil, alors que l'offre la demande",
  "Gestion de projet peu détaillée dans le profil : l'annonce en fait une mission centrale",
  "Outils de supervision non documentés côté profil, l'offre cite Zabbix",
];
for (const g of REAL) ok(`gardé : « ${g} »`, !isVagueOfferGap({ gap: g }));

/* ---------- Le filtre ---------- */
const gaps = [
  { gap: "Offre non détaillée (absence de missions et compétences requises précises)", how_to_address: "Mettre en avant l'adaptabilité et la polyvalence" },
  { gap: "Certification ITIL demandée", how_to_address: "Citer la formation suivie" },
  { gap: "Annonce vague" },
];
const kept = dropVagueOfferGaps(gaps);
ok("filtre : ne garde que le vrai écart", kept.length === 1 && kept[0].gap === "Certification ITIL demandée");
ok("filtre : l'écart gardé garde son conseil", kept[0].how_to_address === "Citer la formation suivie");
ok("filtre : le tableau d'origine n'est pas modifié", gaps.length === 3);
ok("filtre : rien à retirer, tout est rendu", dropVagueOfferGaps([{ gap: "Power BI" }, { gap: "SQL avancé" }]).length === 2);
ok("filtre : une liste vide reste vide", dropVagueOfferGaps([]).length === 0);
ok("filtre : n'importe quoi donne une liste vide", dropVagueOfferGaps(undefined).length === 0 && dropVagueOfferGaps(null).length === 0 && dropVagueOfferGaps("x" as never).length === 0 && dropVagueOfferGaps({} as never).length === 0);
ok("filtre : une entrée sans texte d'écart est écartée au lieu de planter", dropVagueOfferGaps([null, { gap: 4 }, { gap: "SQL" }] as never).length === 1);
ok("écart sans texte : jamais jugé vague", !isVagueOfferGap({} as never) && !isVagueOfferGap({ gap: undefined } as never));

/* ---------- Câblage ---------- */
const ai = read("lib/ai.ts");
ok("analyse : le filtre est appliqué avant le score", /a\.gaps = dropVagueOfferGaps\(a\.gaps\)/.test(ai) && ai.indexOf("dropVagueOfferGaps(a.gaps)") < ai.indexOf("a.gaps = dropVagueOfferGaps") + 200);
ok("analyse : la consigne interdit le reproche fait à l'annonce", /Jamais un reproche fait à l'annonce/.test(ai) && /Une annonce courte donne peu d'écarts/.test(ai));

done();
