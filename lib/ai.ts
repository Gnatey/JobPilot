import { structured, str, int, arr, obj } from "./llm";
import { letterParts, letterDoc } from "./letter";
import { attachLinks } from "./cv-format";
import { guardCv } from "./cv-guard";
import { guardLetter } from "./letter-guard";
import { enforceFacts } from "./cv-facts";
import { alignHeadline } from "./cv-title";
import { cleanCvText, pinProjects } from "./cv-edit";
import { applyMatches, cvLabels, labelSources, matchInput, mergeExtracted, settledForAi, type AnswerRaw, type MatchGroup, type Proposal } from "./profile-fix";
import { dateLine, today } from "./format";
import type { CvDoc, Diagnostic, LetterDoc, OfferAnalysis, OfferExtract, OnboardingAnswers, PrepDoc, Profile, SkillSuggestion } from "./types";

const S = str();
const list = arr(S);

const HONESTY = `Règles absolues :
- Tu ne t'appuies QUE sur le profil fourni. Tu n'inventes jamais un chiffre, un outil, un employeur, un diplôme ou une responsabilité.
- Tu restes réaliste sur le niveau d'expérience réel du profil (débutant, confirmé ou senior, selon ce qu'il montre). Pas de survente.
- Le profil ne dit pas toujours le genre de la personne : sans indication claire, préfère des formulations neutres plutôt que des accords au féminin ou au masculin.
- Tu écris en français, ton professionnel, sobre et concret.`;

/** Le profil envoyé à l'IA : sans les étiquettes d'origine des CV (inutiles pour rédiger, et elles coûtent des jetons) ni la mémoire des questions réglées (`settled` : le diagnostic et l'audit la reçoivent à part). */
export const forAi = (p: Profile): Profile => ({ ...p, settled: undefined, experiences: p.experiences.map((e) => ({ ...e, achievements: e.achievements.map(({ text, tags }) => ({ text, tags })) })) });

/* ---------- 1. Extraction d'une offre ---------- */

export async function extractOffer(text: string, url?: string): Promise<OfferExtract> {
  return structured<OfferExtract>({
    fast: true,
    system: `Tu extrais les informations d'une offre d'emploi française. Si une info est absente, mets une chaîne vide ou un tableau vide. N'invente rien.
Le texte peut commencer par un bandeau (contrat, salaire, expérience, études, lieu) : lis-le, il prime sur le reste.
- "seniority" : recopie le niveau ou les années d'expérience écrits dans l'annonce. S'ils ne sont écrits nulle part, mets « Non précisé » : ne déduis jamais la séniorité du titre ni du ton de l'annonce.
- "salary" : recopie la rémunération telle qu'écrite (fourchette, k€, €/mois, brut/net). Vide seulement si aucune rémunération n'apparaît nulle part dans le texte.
- "company_context" : si l'annonce est publiée par une agence d'intérim, un cabinet de recrutement ou une ESN pour le compte d'un client, dis-le.`,
    prompt: `URL : ${url ?? "aucune"}\n\nTexte de l'offre :\n"""\n${text.slice(0, 18000)}\n"""`,
    schema: {
      properties: {
        title: S, company: S, location: S,
        contract: str("CDI, CDD, Freelance, Alternance, Stage, Intérim ou vide"),
        remote: str("Présentiel, Hybride, Full remote ou vide"),
        seniority: str("Junior, Confirmé, Senior + années demandées si précisées"),
        salary: S,
        domain: str("Secteur / domaine métier de l'entreprise"),
        company_context: str("2-3 phrases sur l'entreprise et l'équipe, d'après l'offre uniquement"),
        missions: list, must_have: arr(S, "Compétences/exigences indispensables"),
        nice_to_have: list, soft_skills: list,
        keywords: arr(S, "15-25 mots-clés ATS exacts tels qu'écrits dans l'offre"),
        red_flags: arr(S, "Points de vigilance éventuels (exigences irréalistes, flou, etc.)"),
      },
      required: ["title", "company", "location", "contract", "remote", "seniority", "salary", "domain", "company_context", "missions", "must_have", "nice_to_have", "soft_skills", "keywords", "red_flags"],
    },
  });
}

/* ---------- 2. Score de compatibilité ---------- */

const WEIGHTS = { hard_skills: 0.35, experience: 0.25, domain: 0.1, education: 0.1, soft_skills: 0.1, logistics: 0.1 } as const;

export async function analyzeOffer(profile: Profile, offer: OfferExtract): Promise<OfferAnalysis> {
  const block = obj({ score: int("0 à 100"), comment: str("1 phrase factuelle") });
  const a = await structured<OfferAnalysis>({
    system: `Tu es un recruteur exigeant et honnête. Tu évalues la compatibilité entre un profil et une offre.
Barème de chaque bloc (0-100) : 90+ = correspond parfaitement, 70 = bonne base avec écarts mineurs, 50 = écarts réels, <30 = hors cible.
"experience" compare le niveau demandé au niveau réel du profil (une alternance ou un stage compte comme de l'expérience de débutant, pas comme plusieurs années). Si l'offre ne précise ni niveau ni années d'expérience, ne le déduis pas du titre : note-le « non précisé » dans le commentaire et ne pénalise pas ce bloc.
Ce que l'annonce ne dit pas (salaire, télétravail, taille de l'entreprise) n'est jamais un point négatif : ne pénalise que ce qui est écrit.
"logistics" = lieu, mobilité, type de contrat, disponibilité.
Choisis recommended_variant parmi les ids de "targets" du profil.
company_type : ESN/Conseil, Banque/Finance/Assurance, Secteur public, Grand groupe, Startup/Scale-up, PME, Cabinet de recrutement.
recommended_template :
- "classique" pour banque, finance, assurance, public, grands groupes traditionnels (sobriété attendue)
- "moderne" pour startups, scale-ups, tech, marketing, médias
- "esn" pour ESN, conseil, cabinets et portage (ils reformatent en dossier de compétences : compétences et missions d'abord)
- "compact" quand l'offre passe par une grosse plateforme de candidature très filtrée ou si rien d'autre ne s'impose
- "colonnes" pour PME, industrie, commerce, logistique, retail (lisible par un humain ; évite si la candidature passe par un gros logiciel de tri)
- "timeline" pour un parcours long, une reconversion, des missions successives ou du freelance
- "elegant" pour le luxe, la mode, la communication, la culture, les cabinets (conseil, RH, juridique)
- "bandeau" pour le marketing, l'e-commerce, le design, les médias et les entreprises créatives
skill_suggestions : parmi les mots-clés ABSENTS du profil, ne garde que ceux que le profil rend très plausibles (outil voisin ou équivalent, prérequis d'un diplôme ou d'un autre outil, pratique qui l'implique presque forcément). 0 à 5 maximum, souvent 0 ou 1.
Exemples : Jira ou Planner utilisés → Trello plausible ; GitHub utilisé → Git ; Python pratiqué → VS Code ou Jupyter probables ; Power BI + SQL → modélisation de données. Contre-exemples : jamais un langage, un diplôme ou une certification sans lien réel avec le profil.
"evidence" recopie l'élément précis du profil qui justifie (ex. « Jira cité dans l'alternance SNCF »). "category" réutilise une catégorie existante de "skills" du profil, sinon « Autres outils ». "confidence" : "forte" seulement si la compétence est quasi équivalente ou prérequise, sinon "moyenne". La personne confirmera : n'affirme rien, propose.
${HONESTY}`,
    prompt: `PROFIL :\n${JSON.stringify(forAi(profile))}\n\nOFFRE :\n${JSON.stringify(offer)}`,
    schema: {
      properties: {
        verdict: str("2 phrases : est-ce une bonne cible et pourquoi"),
        recommended_variant: S,
        company_type: S,
        recommended_template: { type: "string", enum: ["classique", "moderne", "esn", "compact", "colonnes", "timeline", "elegant", "bandeau"] },
        template_reason: str("1 phrase"),
        breakdown: obj({ hard_skills: block, experience: block, domain: block, education: block, soft_skills: block, logistics: block }),
        matched_keywords: arr(S, "mots-clés de l'offre réellement couverts par le profil"),
        missing_keywords: arr(S, "mots-clés de l'offre absents du profil"),
        strengths: arr(S, "3-5 arguments forts à mettre en avant"),
        gaps: arr(obj({ gap: S, how_to_address: str("comment le traiter honnêtement en CV/lettre/entretien") })),
        should_apply: { type: "string", enum: ["oui", "oui_avec_effort", "non"] },
        questions_to_expect: arr(S, "3-5 questions probables en entretien"),
        skill_suggestions: arr(obj({ skill: S, category: S, evidence: S, confidence: { type: "string", enum: ["forte", "moyenne"] } }), "compétences absentes du profil mais très plausibles, à faire confirmer"),
      },
      required: ["verdict", "recommended_variant", "company_type", "recommended_template", "template_reason", "breakdown", "matched_keywords", "missing_keywords", "strengths", "gaps", "should_apply", "questions_to_expect"],
    },
  });
  const b = a.breakdown;
  a.score = Math.round(
    (Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[]).reduce((s, k) => s + (b[k]?.score ?? 0) * WEIGHTS[k], 0)
  );
  return a;
}

/* ---------- 2 bis. Compétences probables à faire confirmer ---------- */

export async function suggestSkills(profile: Profile, dismissed: string[]): Promise<SkillSuggestion[]> {
  const r = await structured<{ suggestions: SkillSuggestion[] }>({
    fast: true,
    maxTokens: 3000,
    system: `Tu relis le profil d'une personne pour repérer ce qu'elle sait probablement faire sans l'avoir écrit, parce que cela découle directement de ce qu'elle a déjà écrit.
Exemples de raisonnement : GitHub utilisé → Git ; Python pratiqué → VS Code ou Jupyter probables ; Jira ou Planner → Trello et Kanban plausibles ; Master Data Management → modélisation de données, qualité des données ; Power BI → DAX et Power Query ; Excel avancé → tableaux croisés dynamiques.
Règles absolues :
- Chaque suggestion cite dans "evidence" l'élément précis du profil qui la justifie. Sans preuve dans le profil, pas de suggestion.
- Jamais d'employeur, de diplôme, de certification, de langue ou de chiffre inventés. Seulement des outils, méthodes et savoir-faire.
- Ne propose rien qui figure déjà dans le profil (même sous un autre nom), ni rien de la liste « déjà refusé ».
- 4 à 8 suggestions au maximum, les plus utiles pour les métiers visés d'abord. "confidence" : "forte" si quasi équivalent ou prérequis, sinon "moyenne".
- "category" réutilise une catégorie existante de "skills", sinon « Autres outils ».
- La personne confirmera chaque suggestion : tu proposes, tu n'affirmes pas.`,
    prompt: `PROFIL :\n${JSON.stringify(forAi(profile))}\n\nDÉJÀ REFUSÉ : ${JSON.stringify(dismissed)}`,
    schema: {
      properties: { suggestions: arr(obj({ skill: S, category: S, evidence: S, confidence: { type: "string", enum: ["forte", "moyenne"] } })) },
      required: ["suggestions"],
    },
  });
  return (r.suggestions ?? []).filter((s) => s.skill && s.evidence).slice(0, 8);
}

/* ---------- 3. CV sur mesure ---------- */

export async function generateCv(profile: Profile, offer: OfferExtract, analysis: OfferAnalysis | null, variant: string): Promise<CvDoc> {
  const target = profile.targets.find((t) => t.id === variant);
  const cv = await structured<CvDoc>({
    maxTokens: 6000,
    system: `Tu rédiges un CV français d'UNE page, une colonne, optimisé ATS, ciblé sur une offre précise.
Méthode :
- headline : l'intitulé de l'offre, mot pour mot, sans « H/F », sans lieu ni nom d'entreprise. Ne le remplace JAMAIS par le titre d'une cible, même si le métier te semble éloigné du profil. Seule exception : une offre qui demande un niveau senior, expert ou lead, que le profil n'a pas : prends alors le titre de la cible "${target?.title ?? variant}". Un seul métier, pas de "|".
- summary : 3 lignes max, concrètes, avec les mots-clés de l'offre que le profil couvre réellement. Termine par la disponibilité.
- experiences : TOUTES les expériences du profil qui ont au moins une réalisation, même celles qui semblent éloignées de l'offre (un trou entre deux postes se voit), en ordre antichronologique. Pour chacune, choisis et reformule les réalisations les plus pertinentes pour l'offre (3-4 puces pour le poste le plus récent, 2-3 pour les autres ; une seule suffit pour une expérience peu liée à l'offre). Commence chaque puce par un verbe d'action. Garde les chiffres existants tels quels. Une expérience du profil sans aucune réalisation n'est pas listée.
- Chaque puce reformule UNE réalisation du profil sans rien y ajouter : mêmes outils, même public, même périmètre, mêmes chiffres. Reformuler, c'est changer l'ordre des mots et le verbe, jamais les faits.
- N'ajoute JAMAIS un résultat, un effet ou un bénéfice que la réalisation ne dit pas (« réduisant… », « permettant… », « améliorant… », « afin de… », « ce qui a… »). Une réalisation sans résultat dans le profil s'arrête sur ce qui a été fait, pour qui et avec quoi. Le résultat qui manquerait va dans notes_for_candidate, sous forme de question à se poser.
- Garde les destinataires et les mots précis du profil (« Business Unit », « CODIR », noms d'outils, de métiers, de processus). Ne les remplace jamais par une expression générale (« la direction », « les équipes », « les parties prenantes », « le pilotage »).
- Pas de formule creuse (« force de proposition », « environnement dynamique », « forte valeur ajoutée », « pilotage stratégique »).
- education : TOUTES les formations du profil, sans en omettre (même celles qui semblent éloignées de l'offre : un trou entre deux diplômes se voit), avec leurs dates. Elles ne se trient pas. Les intitulés de poste, noms d'entreprise, dates, langues et certifications sont ceux du profil, mot pour mot : tu ne les adaptes pas à l'offre.
- skills : 4-5 lignes thématiques, uniquement ce qui sert l'offre, mots-clés de l'offre en premier.
- projects : 2-3 projets max, les plus pertinents. Un projet du profil marqué "pin": true figure toujours dans la liste (il compte dans les 3).
- certifications : seulement les pertinentes.
- Reprends les dates exactes du profil.
- notes_for_candidate : ce que la personne doit vérifier ou compléter avant d'envoyer (ex : un chiffre manquant qui renforcerait une puce).
${HONESTY}
Règles propres au profil : ${profile.rules.join(" / ")}`,
    prompt: `PROFIL MAÎTRE :\n${JSON.stringify(forAi(profile))}\n\nOFFRE :\n${JSON.stringify(offer)}\n\nANALYSE :\n${JSON.stringify(analysis ?? {})}\n\nCible choisie : ${variant}`,
    schema: {
      properties: {
        headline: S, summary: S,
        experiences: arr(obj({ company: S, role: S, location: S, dates: S, bullets: list })),
        education: arr(obj({ degree: S, school: S, dates: S })),
        skills: arr(obj({ label: S, items: str("liste séparée par des virgules") })),
        projects: arr(obj({ name: S, description: str("1 ligne") })),
        certifications: list,
        languages: str("ex : Français (maternel) · Anglais (B1-B2)"),
        extras: str("centres d'intérêt en 1 ligne, ou vide"),
        ats_keywords_used: list,
        notes_for_candidate: list,
      },
      required: ["headline", "summary", "experiences", "education", "skills", "projects", "certifications", "languages", "ats_keywords_used", "notes_for_candidate"],
    },
  });
  // Le titre du CV est l'intitulé de l'offre (règle du profil « aligné sur l'intitulé de l'offre »), pas un titre choisi par l'IA : la même offre Klesia
  // avait reçu « Administrateur Base de Données », « Data Analyst » puis « Data Engineer » (lib/cv-title.ts). Offre de niveau senior : le titre de l'IA reste, et la note le dit.
  const aligned = alignHeadline(cv.headline, offer.title);
  cv.headline = aligned.headline;
  if (aligned.reason === "senior") cv.notes_for_candidate = [...(cv.notes_for_candidate ?? []), `L'offre demande un niveau senior (« ${aligned.offerTitle} ») : le titre du CV ne reprend pas cet intitulé, ton profil est junior. À toi de voir si tu candidates ainsi.`];
  // Les faits (formations, postes, dates, langues, certifications) sont ceux du profil, pas ceux de l'IA (lib/cv-facts.ts)
  // Puis garde-fou : un résultat ou un chiffre que le profil ne dit pas est retiré ou signalé (lib/cv-guard.ts)
  // Les projets « Toujours sur mes CV » du profil sont remis s'ils manquent (lib/cv-edit.ts) ; les tirets insécables du profil deviennent des tirets simples
  const { cv: checked } = guardCv(pinProjects(enforceFacts(cv, profile).cv, profile), profile);
  // Liens : repris du profil (jamais écrits par l'IA), choisis selon l'offre
  return attachLinks(cleanCvText(checked), profile,[offer.title, ...(offer.keywords ?? []), ...(analysis?.matched_keywords ?? []), ...(analysis?.missing_keywords ?? [])].join(" "));
}

/* ---------- 4. Lettre / message de motivation ---------- */

export async function generateLetter(profile: Profile, offer: OfferExtract, analysis: OfferAnalysis | null, ctx: { headline?: string } = {}): Promise<LetterDoc> {
  const raw = await structured<{ subject: string; greeting: string; paragraphs: string[]; signoff: string; notes_for_candidate: string[] }>({
    maxTokens: 3000,
    system: `Tu rédiges une lettre de motivation française, prête à envoyer, qui sonne comme une vraie personne et non comme l'annonce reformulée.
Format : 190 à 230 mots au total, QUATRE paragraphes courts (3 à 4 phrases au plus chacun), à la première personne, sans titre ni liste.
Rôle de chaque paragraphe :
1. Accroche : une raison précise de vouloir CE poste dans CETTE organisation, tirée de ce que l'annonce dit de sa mission, de son produit, de ses données ou de son contexte. Pas de compliment général, aucune phrase recopiée de l'annonce.
2. Première preuve : UNE réalisation du profil, la plus proche de la mission principale, racontée comme une petite histoire (le contexte, ce que j'ai fait, puis le résultat SEULEMENT s'il est écrit dans le profil : sinon n'en invente aucun et termine sur ce que j'ai appris ou mis en place). Un chiffre seulement s'il existe dans le profil ou dans l'annonce.
3. Seconde preuve : une autre réalisation (ou un projet) qui répond à une autre exigence de l'annonce, puis ce que j'apporterais concrètement dès les premières semaines.
4. Clôture : une à deux phrases, la disponibilité et la proposition d'un échange. Pas de « n'hésitez pas », pas de « je me permets ».
Style :
- Montre par les faits. Évite les adjectifs de CV (« dynamique », « motivé », « passionné », « rigoureux », « force de proposition ») et les formules creuses (« enjeu majeur », « monde en constante évolution »). Ne reprends pas le vocabulaire de l'annonce tel quel : dis la même chose avec tes mots.
- N'écris la ville, la mobilité, la disponibilité ou la rémunération que si l'annonce les exige.
- Si l'annonce demande quelque chose que le profil ne montre pas, ne le revendique pas : signale-le dans notes_for_candidate.
- Évite les accords de genre (« ravi/ravie », « motivé/motivée ») : tourne la phrase autrement.
- greeting : « Madame, Monsieur, » sauf si l'annonce nomme la personne à qui écrire. signoff : « Cordialement, ». Le nom en signature est ajouté par la mise en page : ne l'écris nulle part.
- subject : « Candidature au poste de <intitulé de l'annonce> », avec la référence de l'offre si l'annonce en donne une.
- notes_for_candidate : ce qu'il faut vérifier ou compléter avant d'envoyer (un chiffre manquant, une exigence non couverte, un nom de contact à ajouter).
${HONESTY}
Règles propres au profil : ${profile.rules.join(" / ")}`,
    prompt: `PROFIL :\n${JSON.stringify(forAi(profile))}\n\nOFFRE :\n${JSON.stringify(offer)}\n\nANALYSE :\n${JSON.stringify(analysis ?? {})}`,
    schema: {
      properties: { subject: S, greeting: S, paragraphs: arr(S, "les 4 paragraphes, sans salutation ni formule finale"), signoff: S, notes_for_candidate: list },
      required: ["subject", "greeting", "paragraphs", "signoff", "notes_for_candidate"],
    },
  });
  // Mise en forme défensive : si le modèle a glissé la salutation ou la formule dans un paragraphe, elles sont remises à leur place
  const text = [raw.greeting, ...(raw.paragraphs ?? []), raw.signoff].filter(Boolean).join("\n\n");
  const parts = letterParts({ subject: raw.subject, body: text, notes_for_candidate: [] },
    { company: offer.company, date: today(), name: profile.identity.name, headline: ctx.headline });
  // Garde-fou : un chiffre que ni le profil ni l'annonce ne contiennent est signalé (la lettre part sous la signature de la personne)
  const have = raw.notes_for_candidate ?? [];
  const guard = guardLetter(raw.paragraphs ?? [], profile, offer, have);
  return letterDoc(parts, { subject: raw.subject, body: "", notes_for_candidate: [...have, ...guard.notes] });
}

/* ---------- 5. Préparation d'entretien ---------- */

export async function generatePrep(profile: Profile, offer: OfferExtract, analysis: OfferAnalysis | null): Promise<PrepDoc> {
  return structured<PrepDoc>({
    system: `Tu prépares une personne à un entretien, avec un niveau d'exigence adapté à son expérience réelle. Les angles de réponse s'appuient sur des situations réelles du profil (méthode STAR). ${HONESTY}`,
    prompt: `PROFIL :\n${JSON.stringify(forAi(profile))}\n\nOFFRE :\n${JSON.stringify(offer)}\n\nANALYSE :\n${JSON.stringify(analysis ?? {})}`,
    schema: {
      properties: {
        pitch_60s: str("présentation orale de 60 secondes, à la première personne"),
        likely_questions: arr(obj({ question: S, angle: str("quelle expérience réelle utiliser et comment") })),
        questions_to_ask: arr(S, "4-5 questions pertinentes à poser au recruteur"),
        company_research_todo: arr(S, "ce qu'il faut vérifier sur l'entreprise avant l'entretien"),
      },
      required: ["pitch_60s", "likely_questions", "questions_to_ask", "company_research_todo"],
    },
  });
}

/* ---------- 6. Classification des emails ---------- */

export type EmailInput = { id: string; from: string; subject: string; snippet: string };
export type EmailClass = { id: string; category: string; company: string; job_title?: string; is_job_related: boolean };

export async function classifyEmails(emails: EmailInput[], companies: string[]): Promise<EmailClass[]> {
  if (!emails.length) return [];
  const r = await structured<{ items: EmailClass[] }>({
    fast: true,
    noTraining: true, // contenu Gmail : jamais chez un fournisseur qui entraîne ses modèles avec l'offre gratuite
    maxTokens: 8000,
    system: `Tu tries des emails de recherche d'emploi.
Catégories : accuse_reception, refus, entretien (invitation ou planification), test (cas pratique, test technique), offre (proposition d'embauche), relance_recruteur (un recruteur/cabinet qui la contacte), alerte_offres (newsletters, alertes d'offres), autre.
refus : uniquement un message d'une entreprise ou d'un recruteur qui écarte sa candidature. Un message écrit par la personne elle-même (même si elle décline une mission) n'est jamais un refus.
company : l'entreprise qui recrute (jamais la plateforme d'envoi) ; si elle correspond à une entreprise de la liste fournie, utilise exactement ce nom. Si le mail ne la nomme pas, laisse vide : ne la devine pas.
job_title : l'intitulé exact du poste si le mail le mentionne, sinon vide.
is_job_related : false pour tout ce qui n'a rien à voir avec une candidature.`,
    prompt: `Entreprises suivies : ${JSON.stringify(companies)}\n\nEmails :\n${JSON.stringify(emails)}`,
    schema: {
      properties: {
        items: arr(obj({
          id: S,
          category: { type: "string", enum: ["accuse_reception", "refus", "entretien", "test", "offre", "relance_recruteur", "alerte_offres", "autre"] },
          company: S,
          job_title: S,
          is_job_related: { type: "boolean" },
        })),
      },
      required: ["items"],
    },
  });
  return r.items;
}

/* ---------- 7. Auto-amélioration ---------- */

export type Insights = {
  diagnosis: string;
  what_works: string[];
  what_doesnt: string[];
  actions: { action: string; why: string; priority: "haute" | "moyenne" | "basse" }[];
  weekly_goal: string;
};

export async function generateInsights(stats: unknown, profile: Profile): Promise<Insights> {
  return structured<Insights>({
    system: `Tu es une coach emploi franche et pragmatique. À partir des statistiques réelles de candidature, tu identifies où ça bloque dans l'entonnoir (pas de réponse = ciblage/CV ; entretiens sans offre = entretien) et tu proposes des actions concrètes et mesurables.
Si les données sont trop peu nombreuses (moins de ~15 candidatures), dis-le clairement au lieu de surinterpréter.
Tu t'appuies uniquement sur les chiffres fournis. Français, tutoiement.`,
    prompt: `STATISTIQUES :\n${JSON.stringify(stats)}\n\nCIBLES DU PROFIL : ${JSON.stringify(profile.targets)}`,
    schema: {
      properties: {
        diagnosis: str("3-4 phrases"),
        what_works: list,
        what_doesnt: list,
        actions: arr(obj({ action: S, why: S, priority: { type: "string", enum: ["haute", "moyenne", "basse"] } })),
        weekly_goal: str("un objectif chiffré pour la semaine"),
      },
      required: ["diagnosis", "what_works", "what_doesnt", "actions", "weekly_goal"],
    },
  });
}

/* ---------- 8. Import d'un CV texte → profil (pour les autres utilisateurs) ---------- */

export async function profileFromCvText(text: string): Promise<Profile> {
  const ach = obj({ text: S, tags: list, sources: list }, ["text", "tags"]);
  const profile = await structured<Profile>({
    maxTokens: 8000,
    thinking: 0, // simple recopie structurée : pas besoin de réfléchir longtemps
    patient: true,
    system: `Tu convertis un ou plusieurs CV (texte brut) en profil structuré. Fusionne les doublons, garde toutes les réalisations, conserve les dates telles qu'écrites. Propose 1 à 3 "targets" (métiers visés) cohérents avec le parcours. Mets dans "todo" les incohérences repérées (dates, niveaux de langue) et les chiffres manquants. N'invente rien.
- Une même réalisation écrite avec d'autres mots dans deux CV compte pour UNE réalisation (garde la version la plus précise, celle qui a les chiffres).
- Quand plusieurs CV sont fournis (en-têtes « === CV : nom === »), indique pour chaque réalisation, dans "sources", le nom du CV d'où elle vient (plusieurs noms si elle figure dans plusieurs CV).
- Un projet personnel (jeu, site, application, outil construit pour soi) va dans "projects", avec son lien dans "link" : jamais comme réalisation d'une expérience professionnelle. Les missions faites pour un client ou un employeur restent dans l'expérience.
- Les liens de la personne (LinkedIn, portfolio, GitHub, démonstrations) vont tous dans identity.links, chacun avec un libellé court.`,
    prompt: text.slice(0, 40000),
    schema: {
      properties: {
        identity: obj({ name: S, email: S, phone: S, city: S, mobility: S, availability: S, links: arr(obj({ label: S, url: S })) }, ["name", "email", "links"]),
        targets: arr(obj({ id: str("slug court, ex: chef_de_projet"), title: S, pitch: S })),
        experiences: arr(obj({ id: S, company: S, sector: S, role: S, type: S, location: S, start: S, end: S, achievements: arr(ach) }, ["id", "company", "role", "start", "end", "achievements"])),
        education: arr(obj({ degree: S, school: S, start: S, end: S, details: list }, ["degree", "school"])),
        projects: arr(obj({ name: S, year: S, description: S, tags: list, link: S }, ["name", "description", "tags"])),
        skills: { type: "object", additionalProperties: list, description: "catégorie -> liste d'outils" },
        certifications: list,
        languages: arr(obj({ name: S, level: S })),
        interests: list,
        preferences: obj({ contracts: list, remote: S, salary: S, sectors: list }, ["contracts"]),
        rules: list,
        todo: list,
      },
      required: ["identity", "targets", "experiences", "education", "projects", "skills", "certifications", "languages", "interests", "preferences", "rules", "todo"],
    },
  });
  // Chaque réalisation garde le nom du CV d'où elle vient
  return labelSources(profile, cvLabels(text));
}

/* ---------- 9. Extraction des offres contenues dans une alerte emploi ---------- */

export type AlertOffer = { title: string; company: string; location: string; url: string; snippet: string };

export async function extractAlertOffers(from: string, subject: string, body: string): Promise<AlertOffer[]> {
  const r = await structured<{ offers: AlertOffer[] }>({
    fast: true,
    noTraining: true, // contenu Gmail : jamais chez un fournisseur qui entraîne ses modèles avec l'offre gratuite
    maxTokens: 4000,
    system: `Tu lis un email d'alerte emploi (LinkedIn, Indeed, APEC, Welcome to the Jungle, HelloWork, France Travail, cabinets...) et tu listes chaque offre qu'il contient.
url : le lien qui mène à l'offre (parmi les liens fournis entre [crochets]), sinon vide. Ignore les liens de désinscription, profil, paramètres.
N'invente aucune offre. Si l'email ne contient pas d'offres précises, renvoie une liste vide.`,
    prompt: `De : ${from}\nObjet : ${subject}\n\n${body.slice(0, 15000)}`,
    schema: { properties: { offers: arr(obj({ title: S, company: S, location: S, url: S, snippet: str("1 phrase max") })) }, required: ["offers"] },
  });
  return r.offers.filter((o) => o.title);
}

/** Offres d'une page de résultats (LinkedIn, Indeed, Welcome to the Jungle…) vue par la personne dans son navigateur. */
export async function extractPageOffers(pageUrl: string, title: string, text: string, links: { t: string; h: string }[]): Promise<AlertOffer[]> {
  const linkLines = links.map((l, i) => `[${i}] ${l.t} -> ${l.h}`).join("\n");
  const r = await structured<{ offers: AlertOffer[] }>({
    fast: true,
    maxTokens: 6000,
    system: `Tu lis une page de résultats d'offres d'emploi (copiée depuis le navigateur d'une personne) et tu listes chaque offre qu'elle contient.
url : le lien exact de l'offre, recopié tel quel parmi les liens numérotés fournis ; sinon vide. N'écris jamais un lien qui n'est pas dans la liste.
snippet : une phrase tirée de la page (contrat, salaire, mission) si elle existe, sinon vide.
Ignore les menus, filtres, publicités, offres « sponsorisées » sans intitulé clair et les doublons. N'invente aucune offre : si la page ne contient pas d'offres précises, renvoie une liste vide.`,
    prompt: `Page : ${title}\nAdresse : ${pageUrl}\n\nTexte de la page :\n${text.slice(0, 20000)}\n\nLiens :\n${linkLines.slice(0, 14000)}`,
    schema: { properties: { offers: arr(obj({ title: S, company: S, location: S, url: S, snippet: str("1 phrase max") })) }, required: ["offers"] },
  });
  return r.offers.filter((o) => o.title).slice(0, 60);
}

/* ---------- 10. Relance ---------- */

/** Relance APRÈS un entretien ou une épreuve (jamais pour une candidature sans entretien : voir lib/followup.ts). */
export async function generateFollowup(profile: Profile, app: { company: string; title: string; applied_at: string | null; interview_at?: string | null; contact: string | null; status: string }): Promise<{ subject: string; body: string }> {
  const test = app.status === "test";
  return structured<{ subject: string; body: string }>({
    fast: true,
    system: `Tu rédiges un email de relance en français, envoyé APRÈS ${test ? "une épreuve (test ou cas pratique)" : "un entretien"} pour ce poste : 80-110 mots, poli, direct, sans insistance ni formule creuse.
Remercie pour l'échange, rappelle le poste et ton intérêt, ajoute UNE valeur concrète tirée du profil, et demande où en est le processus et les prochaines étapes. Signe avec le nom et le téléphone du profil.
Tu ne sais pas ce qui s'est dit pendant ${test ? "l'épreuve" : "l'entretien"} : n'invente aucun sujet abordé, aucun nom d'interlocuteur, aucune remarque de l'entreprise. ${HONESTY}`,
    prompt: `Profil : ${JSON.stringify({ identity: profile.identity, targets: profile.targets, experiences: profile.experiences.map((e) => ({ company: e.company, role: e.role })) })}\nCandidature : ${JSON.stringify({ company: app.company, title: app.title, contact: app.contact, interview_at: app.interview_at ?? null, kind: test ? "test" : "entretien" })}`,
    schema: { properties: { subject: S, body: S }, required: ["subject", "body"] },
  });
}

/* ---------- 11. Diagnostic de CV (accueil et CV redéposé) ---------- */


export async function diagnoseCv(cvText: string, answers: OnboardingAnswers | null, previous: Profile | null): Promise<Diagnostic> {
  const sev = { type: "string", enum: ["bloquant", "important", "mineur"] };
  return structured<Diagnostic>({
    maxTokens: 6000,
    thinking: 2048,
    patient: true,
    system: `Tu es une recruteuse senior française, franche et concrète. Tu fais le diagnostic d'un ou plusieurs CV d'une personne en recherche d'emploi.
Tu juges le CV par rapport aux métiers visés et au marché français actuel :
- positionnement : un titre clair ou un CV "fourre-tout" ? Les cibles visées sont-elles cohérentes avec l'expérience réelle et récente ? Propose 1 à 3 cibles réalistes.
- crédibilité : survente (expert, senior, pilotage d'équipes pour un profil débutant), formulations vagues, absence de résultats chiffrés.
- cohérence entre plusieurs versions (dates, niveaux de langue, intitulés) quand plusieurs CV sont fournis.
- dates : ${dateLine()} Toute période qui se termine avant aujourd'hui est PASSÉE : tu ne la juges jamais « future » ni « futuriste », et un projet daté de l'année en cours n'est pas « spéculatif ». Une alternance qui chevauche un diplôme est normale quand le CV la nomme alternance : ne la présente pas comme une confusion entre étudiant et professionnel.
- lisibilité ATS : colonnes, sections standard, mots-clés métier.
- search_strategy : à partir du questionnaire (durée de recherche, volume, réponses obtenues), dis où l'entonnoir bloque (pas de réponse = CV/ciblage ; entretiens sans offre = entretien) et ce qu'il faut changer.
${previous ? "- changes_since_last : compare avec le profil actuel fourni et liste ce qui a changé ou progressé." : ""}
${previous?.settled?.length ? "- déjà tranché : la personne a déjà répondu aux questions listées sous « DÉJÀ TRANCHÉ PAR LA PERSONNE ». Ne les reposes pas, même reformulées, ni dans \"inconsistencies\" ni dans \"missing_metrics\" ; ne les rouvre que si le CV contredit clairement sa réponse." : ""}
- exemples : dans toute reformulation que tu proposes (\"fix\", \"actions\"), n'écris jamais un chiffre, un pourcentage ou un volume de ton invention : mets [chiffre] à la place. Tu ne connais pas les vrais.
Tu tutoies, tu restes bienveillante mais tu ne flattes pas. Tu t'appuies uniquement sur ce qui est écrit. overall_score : 85+ = prêt à envoyer, 60-84 = correct à retravailler, <60 = à refaire.`,
    prompt: `QUESTIONNAIRE :\n${JSON.stringify(answers ?? {})}\n\n${previous ? `PROFIL ACTUEL :\n${JSON.stringify(forAi(previous))}\n\n` : ""}${previous?.settled?.length ? `DÉJÀ TRANCHÉ PAR LA PERSONNE :\n${JSON.stringify(settledForAi(previous.settled))}\n\n` : ""}CV :\n"""\n${cvText.slice(0, 40000)}\n"""`,
    schema: {
      properties: {
        overall_score: int("0-100"),
        verdict: str("3-4 phrases franches"),
        positioning: obj({ recommended_targets: arr(obj({ title: S, why: S })), comment: S }),
        strengths: list,
        issues: arr(obj({ issue: S, severity: sev, fix: str("correction concrète, avec un exemple de reformulation si utile (chiffres remplacés par [chiffre])") })),
        inconsistencies: list,
        missing_metrics: arr(S, "réalisations où un chiffre changerait tout, avec la question à se poser"),
        ats: obj({ ok: list, problems: list }),
        search_strategy: str("3-5 phrases"),
        actions: arr(obj({ action: S, why: S, priority: { type: "string", enum: ["haute", "moyenne", "basse"] } })),
        ...(previous ? { changes_since_last: list } : {}),
      },
      required: ["overall_score", "verdict", "positioning", "strengths", "issues", "inconsistencies", "missing_metrics", "ats", "search_strategy", "actions"],
    },
  });
}

/**
 * Fusionne un CV redéposé avec le profil actuel, sans rien perdre et sans doublon :
 * le tri exact se fait en code, puis l'IA dit quelles nouvelles réalisations répètent une réalisation connue avec d'autres mots.
 */
export async function mergeProfileWithCv(current: Profile, cvText: string): Promise<Profile> {
  const extracted = await profileFromCvText(cvText);
  const { profile, groups } = mergeExtracted(current, extracted);
  if (!groups.length) return profile;
  let matches: { exp_id: string; j: number; same_as: number }[] = [];
  try {
    matches = await matchAchievements(groups);
  } catch (e) {
    // Si la comparaison échoue, on garde tout : un doublon se règle plus tard, une perte non.
    console.error("Comparaison des réalisations échouée", e);
  }
  const done = applyMatches(profile, groups, matches);
  return done.todo.length ? { ...done.profile, todo: [...done.profile.todo, ...done.todo.filter((t) => !done.profile.todo.includes(t))] } : done.profile;
}

/** Quelles réalisations nouvelles disent la même chose qu'une réalisation déjà connue de la même expérience ? */
export async function matchAchievements(groups: MatchGroup[]): Promise<{ exp_id: string; j: number; same_as: number }[]> {
  const r = await structured<{ matches: { exp_id: string; j: number; same_as: number }[] }>({
    fast: true,
    maxTokens: 3000,
    thinking: 0,
    patient: true,
    system: `Tu compares des réalisations d'un CV. Pour chaque expérience, tu reçois les réalisations "connues" et les "nouvelles" (issues d'un autre CV de la même personne).
Pour chaque nouvelle réalisation qui décrit LE MÊME FAIT qu'une réalisation connue (même action, même livrable, même contexte, même si les mots, l'ordre ou le niveau de détail diffèrent), donne l'indice "i" de la connue dans "same_as". Si elle apporte un fait différent, "same_as" = -1.
Deux réalisations proches mais distinctes (deux tableaux de bord différents, deux outils différents) ne sont PAS le même fait. En cas de doute, -1.
Tu ne réécris rien et tu n'inventes rien : tu ne renvoies que des indices.`,
    prompt: JSON.stringify(matchInput(groups)),
    schema: {
      properties: { matches: arr(obj({ exp_id: S, j: int("indice de la nouvelle réalisation"), same_as: int("indice de la réalisation connue, ou -1") })) },
      required: ["matches"],
    },
  });
  return Array.isArray(r.matches) ? r.matches : [];
}

/* ---------- 12. Audit du profil maître (« Faire le point ») ---------- */

export type AuditResult = { proposals: Proposal[]; questions: string[]; notes: string[] };

/** Le profil réduit à ce que l'audit doit voir : identifiants d'expérience et textes exacts des réalisations. */
const auditView = (p: Profile) => ({
  cibles: p.targets.map((t) => t.title),
  experiences: p.experiences.map((e) => ({ exp_id: e.id, entreprise: e.company, poste: e.role, type: e.type ?? "", debut: e.start, fin: e.end, realisations: e.achievements.map((a) => a.text) })),
  projets: p.projects.map((x) => ({ nom: x.name, description: x.description, lien: x.link ?? "" })),
  liens: p.identity.links,
});

export async function auditProfile(profile: Profile): Promise<AuditResult> {
  const r = await structured<{
    proposals: { kind: string; exp_id: string; keep?: string; drop?: string[]; merged?: string; lossless?: boolean; text?: string; project?: { name: string; description: string; year?: string; tags?: string[] }; project_name?: string; why: string }[];
    questions: string[];
    notes: string[];
  }>({
    maxTokens: 6000,
    thinking: 2048,
    system: `Tu relis le profil maître d'une personne en recherche d'emploi pour le nettoyer, sans jamais rien inventer. Tu ne proposes QUE ces trois types de changements :
1. "merge" : deux réalisations ou plus d'UNE MÊME expérience qui disent le même fait avec d'autres mots. "keep" = le texte EXACT (copié tel quel) de celle à garder, la plus complète ; "drop" = les textes exacts des autres. "lossless" = true seulement si la phrase gardée contient déjà tout ce que contiennent les autres (chiffres, outils, résultats). Sinon, renseigne "merged" : une seule phrase qui reprend tous les faits des textes, sans rien ajouter.
2. "to_project" : une réalisation qui décrit un projet personnel (jeu, site, application, outil construit pour soi, démonstration) et non une mission pour un client ou un employeur. "text" = le texte exact de la réalisation ; project.name = le nom du projet ; project.description = 1 à 2 phrases qui reprennent uniquement ce que dit le texte, sans le lien.
3. "duplicate" : une réalisation d'expérience qui répète un projet déjà présent dans "projets". "text" = le texte exact ; "project_name" = le nom exact du projet.
Chaque proposition a un "exp_id" copié de l'expérience concernée, et "why" : une phrase simple pour la personne (« Ces deux lignes disent la même chose »).
"questions" : 4 au plus, courtes, concrètes, chacune nommant l'expérience ou le projet (un chiffre manquant, une date qui ne colle pas, un rôle flou). Pas de question dont la réponse est déjà dans le profil.
"notes" : 3 au plus, franches et courtes, sur la cohérence du positionnement (un profil qui mélange des métiers sans lien, une expérience qui ne soutient pas la cible).
"deja_tranche" (s'il est présent) : les questions auxquelles la personne a déjà répondu, avec sa réponse. Ne les reposes pas, même reformulées.
Ne propose jamais de supprimer une vraie mission professionnelle. Si tout est propre, renvoie des listes vides.`,
    prompt: JSON.stringify(profile.settled?.length ? { ...auditView(profile), deja_tranche: settledForAi(profile.settled) } : auditView(profile)),
    schema: {
      properties: {
        proposals: arr(obj({
          kind: { type: "string", enum: ["merge", "to_project", "duplicate"] },
          exp_id: S, keep: S, drop: list, merged: S, lossless: { type: "boolean" }, text: S, project_name: S, why: S,
          project: obj({ name: S, description: S, year: S, tags: list }, ["name", "description"]),
        }, ["kind", "exp_id", "why"])),
        questions: list,
        notes: list,
      },
      required: ["proposals", "questions", "notes"],
    },
  });
  const proposals: Proposal[] = [];
  (r.proposals ?? []).forEach((x, i) => {
    const id = `a${i + 1}`;
    if (x.kind === "merge" && x.keep && x.drop?.length) proposals.push({ id, kind: "merge", exp_id: x.exp_id, keep: x.keep, drop: x.drop, merged: x.merged?.trim() || undefined, lossless: x.lossless === true, why: x.why });
    else if (x.kind === "to_project" && x.text && x.project) proposals.push({ id, kind: "to_project", exp_id: x.exp_id, text: x.text, project: { name: x.project.name, description: x.project.description, year: x.project.year || undefined, tags: x.project.tags ?? [] }, why: x.why });
    else if (x.kind === "duplicate" && x.text && x.project_name) proposals.push({ id, kind: "duplicate", exp_id: x.exp_id, text: x.text, project_name: x.project_name, why: x.why });
  });
  return { proposals, questions: (r.questions ?? []).filter((q) => q?.trim()).slice(0, 4), notes: (r.notes ?? []).filter((q) => q?.trim()).slice(0, 3) };
}

/* ---------- 13. Réponse à une question « À compléter » ---------- */

export async function answerQuestion(profile: Profile, question: string, answer: string, retry = false): Promise<AnswerRaw> {
  // Modèle principal (pas le léger) : c'est de la rédaction, et le résultat finit sur un CV
  const r = await structured<AnswerRaw>({
    maxTokens: 2500,
    thinking: 512, // une phrase à réécrire : inutile de laisser le modèle réfléchir longtemps (la personne attend devant l'écran)
    system: `Une question a été posée à la personne à propos de son profil, et elle a répondu. Tu fais deux choses.
1. Tu RÉPONDS à la préoccupation derrière la question (« reply »). 1 à 3 phrases, tutoiement, franches : est-ce un vrai défaut du CV ? Si sa réponse montre que ce n'est pas un problème (alternance pendant un diplôme, dates déjà passées, niveau de langue cohérent), dis-le clairement : rien à corriger. Si c'est un vrai défaut, dis ce que la réécriture proposée règle, ou ce qui manque encore. ${dateLine()} Une période qui se termine avant aujourd'hui est passée, jamais « future ». Tu ne cites aucun chiffre absent de la réponse, du profil ou de la date du jour. Tu ne flattes pas. « settled » = true quand la préoccupation est réglée (ce n'était pas un défaut, ou la réécriture proposée le règle), false s'il manque encore une information.
2. Tu proposes les modifications du profil qui intègrent sa réponse, SEULEMENT si elle apporte un fait à écrire. Une réponse qui lève un doute (« c'était une alternance », « c'est bien ce niveau ») ne se réécrit pas en ligne de CV : « ops » vide, ta réponse suffit. Opérations possibles :
- "replace" : réécrire UNE réalisation. exp_id de l'expérience, old_text = le texte EXACT de la réalisation actuelle, new_text = la nouvelle version.
- "add" : ajouter une réalisation à une expérience (exp_id, text) quand la réponse apporte un fait nouveau.
- "project" : réécrire la description d'un projet existant (name = nom exact, description).
Règles absolues :
- Tu t'appuies uniquement sur les faits de la réponse et du profil. Tout chiffre écrit doit figurer tel quel dans la réponse ou dans le texte réécrit : jamais d'estimation de ta part.
- Un ordre de grandeur que la personne donne elle-même (« environ 50 », « plus de 1 000 », « entre 100 et 1 000 ») s'écrit tel quel, avec ses mots (« environ », « plus de », « entre … et … ») : jamais arrondi, jamais transformé en chiffre exact. Un simple exemple (« par exemple 50 ») n'est pas un résultat : ne l'écris pas.
- Un chiffre sans unité ne s'écrit pas. Si la réponse donne un nombre ou une tranche sans dire ce qui est compté (lignes, fichiers, utilisateurs, Mo, dossiers…), n'écris rien : dans « reply », demande ce qui est compté, « settled » = false, « ops » vide.
- Dans « reply », ne dis JAMAIS que le contexte ou la réponse est « pris en compte », « retenu » ou « noté » : seules les modifications de « ops », une fois appliquées par la personne, entrent dans son profil. Si « ops » est vide alors qu'elle a donné un fait, dis ce qui manque pour pouvoir l'écrire.
- « Je ne sais pas » suivi d'explications n'est pas une réponse vide : qui utilisait le travail, avec quelles équipes, quel périmètre, quels outils, tout cela est exploitable. Réécris la réalisation la plus concernée par la question avec ce contexte.
- Écris une vraie ligne de CV : une phrase qui commence par un verbe d'action au participe passé (Conçu, Développé, Piloté, Automatisé…), sans « je », sans « en tant que », sans nom de poste. Réécris la phrase en entier : ne colle JAMAIS la réponse à la fin de l'ancienne phrase. Un rôle se dit par le verbe et un adverbe (« seule », « en autonomie », « avec 3 développeurs »), pas par une apposition.
  Mauvais : « Création d'un outil de reporting en tant que responsable seule ». Bon : « Conçu et développé seule un outil de reporting ». Le sens de la phrase d'origine reste, seul le rôle ou le contexte apporté par la réponse s'y ajoute.
- Une ligne de CV fait 25 mots au plus. Si la réponse énumère plusieurs profils, outils ou équipes, résume-les (« en interface avec les équipes métier (médecins, infirmiers…), l'AMOA et les développeurs ») au lieu de tout recopier.
- « ops » est vide quand la réponse n'apporte aucun fait à écrire : juste « je ne sais pas », « aucune idée », ou une explication qui lève un doute sur les dates, le statut ou le niveau.`,
    prompt: `PROFIL :\n${JSON.stringify(auditView(profile))}\n\nQUESTION : ${question}\n\nRÉPONSE : ${answer}${retry ? "\n\nATTENTION : une première lecture n'a rien donné d'utilisable alors que la réponse contient du contexte. Propose au moins une modification sans chiffre inventé, sur la réalisation de l'expérience la plus concernée." : ""}`,
    schema: {
      properties: {
        reply: str("réponse à la préoccupation, 1 à 3 phrases, sans chiffre inventé"),
        settled: { type: "boolean" },
        ops: arr(obj({ op: { type: "string", enum: ["replace", "add", "project"] }, exp_id: S, old_text: S, new_text: S, text: S, name: S, description: S }, ["op"])),
      },
      required: ["reply", "settled", "ops"],
    },
  });
  return { ops: Array.isArray(r.ops) ? r.ops : [], reply: typeof r.reply === "string" ? r.reply : "", settled: r.settled === true };
}
