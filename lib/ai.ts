import { structured, str, int, arr, obj } from "./llm";
import { letterParts, letterDoc } from "./letter";
import { today } from "./format";
import type { CvDoc, Diagnostic, LetterDoc, OfferAnalysis, OfferExtract, OnboardingAnswers, PrepDoc, Profile, SkillSuggestion } from "./types";

const S = str();
const list = arr(S);

const HONESTY = `Règles absolues :
- Tu ne t'appuies QUE sur le profil fourni. Tu n'inventes jamais un chiffre, un outil, un employeur, un diplôme ou une responsabilité.
- Tu restes réaliste sur le niveau d'expérience réel du profil (débutant, confirmé ou senior, selon ce qu'il montre). Pas de survente.
- Le profil ne dit pas toujours le genre de la personne : sans indication claire, préfère des formulations neutres plutôt que des accords au féminin ou au masculin.
- Tu écris en français, ton professionnel, sobre et concret.`;

/* ---------- 1. Extraction d'une offre ---------- */

export async function extractOffer(text: string, url?: string): Promise<OfferExtract> {
  return structured<OfferExtract>({
    fast: true,
    system: "Tu extrais les informations d'une offre d'emploi française. Si une info est absente, mets une chaîne vide ou un tableau vide. N'invente rien.",
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
"experience" compare le niveau demandé au niveau réel du profil (une alternance ou un stage compte comme de l'expérience de débutant, pas comme plusieurs années).
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
    prompt: `PROFIL :\n${JSON.stringify(profile)}\n\nOFFRE :\n${JSON.stringify(offer)}`,
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
    prompt: `PROFIL :\n${JSON.stringify(profile)}\n\nDÉJÀ REFUSÉ : ${JSON.stringify(dismissed)}`,
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
  return structured<CvDoc>({
    maxTokens: 6000,
    system: `Tu rédiges un CV français d'UNE page, une colonne, optimisé ATS, ciblé sur une offre précise.
Méthode :
- headline : reprends l'intitulé de l'offre s'il correspond au profil (sinon le titre de la cible "${target?.title ?? variant}"). Un seul métier, pas de "|".
- summary : 3 lignes max, concrètes, avec les mots-clés de l'offre que le profil couvre réellement. Termine par la disponibilité.
- experiences : ordre antichronologique. Choisis et reformule les réalisations du profil les plus pertinentes pour l'offre (3-4 puces pour les postes principaux). Commence chaque puce par un verbe d'action. Garde les chiffres existants tels quels. N'inclus PAS une expérience sans réalisation.
- skills : 4-5 lignes thématiques, uniquement ce qui sert l'offre, mots-clés de l'offre en premier.
- projects : 2-3 projets max, les plus pertinents.
- certifications : seulement les pertinentes.
- Reprends les dates exactes du profil.
- notes_for_candidate : ce que la personne doit vérifier ou compléter avant d'envoyer (ex : un chiffre manquant qui renforcerait une puce).
${HONESTY}
Règles propres au profil : ${profile.rules.join(" / ")}`,
    prompt: `PROFIL MAÎTRE :\n${JSON.stringify(profile)}\n\nOFFRE :\n${JSON.stringify(offer)}\n\nANALYSE :\n${JSON.stringify(analysis ?? {})}\n\nCible choisie : ${variant}`,
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
}

/* ---------- 4. Lettre / message de motivation ---------- */

export async function generateLetter(profile: Profile, offer: OfferExtract, analysis: OfferAnalysis | null, ctx: { headline?: string } = {}): Promise<LetterDoc> {
  const raw = await structured<{ subject: string; greeting: string; paragraphs: string[]; signoff: string; notes_for_candidate: string[] }>({
    maxTokens: 3000,
    system: `Tu rédiges une lettre de motivation française, prête à envoyer, qui sonne comme une vraie personne et non comme l'annonce reformulée.
Format : 190 à 230 mots au total, QUATRE paragraphes courts (3 à 4 phrases au plus chacun), à la première personne, sans titre ni liste.
Rôle de chaque paragraphe :
1. Accroche : une raison précise de vouloir CE poste dans CETTE organisation, tirée de ce que l'annonce dit de sa mission, de son produit, de ses données ou de son contexte. Pas de compliment général, aucune phrase recopiée de l'annonce.
2. Première preuve : UNE réalisation du profil, la plus proche de la mission principale, racontée comme une petite histoire (le contexte, ce que j'ai fait, le résultat). Un chiffre seulement s'il existe dans le profil.
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
    prompt: `PROFIL :\n${JSON.stringify(profile)}\n\nOFFRE :\n${JSON.stringify(offer)}\n\nANALYSE :\n${JSON.stringify(analysis ?? {})}`,
    schema: {
      properties: { subject: S, greeting: S, paragraphs: arr(S, "les 4 paragraphes, sans salutation ni formule finale"), signoff: S, notes_for_candidate: list },
      required: ["subject", "greeting", "paragraphs", "signoff", "notes_for_candidate"],
    },
  });
  // Mise en forme défensive : si le modèle a glissé la salutation ou la formule dans un paragraphe, elles sont remises à leur place
  const text = [raw.greeting, ...(raw.paragraphs ?? []), raw.signoff].filter(Boolean).join("\n\n");
  const parts = letterParts({ subject: raw.subject, body: text, notes_for_candidate: [] },
    { company: offer.company, date: today(), name: profile.identity.name, headline: ctx.headline });
  return letterDoc(parts, { subject: raw.subject, body: "", notes_for_candidate: raw.notes_for_candidate ?? [] });
}

/* ---------- 5. Préparation d'entretien ---------- */

export async function generatePrep(profile: Profile, offer: OfferExtract, analysis: OfferAnalysis | null): Promise<PrepDoc> {
  return structured<PrepDoc>({
    system: `Tu prépares une personne à un entretien, avec un niveau d'exigence adapté à son expérience réelle. Les angles de réponse s'appuient sur des situations réelles du profil (méthode STAR). ${HONESTY}`,
    prompt: `PROFIL :\n${JSON.stringify(profile)}\n\nOFFRE :\n${JSON.stringify(offer)}\n\nANALYSE :\n${JSON.stringify(analysis ?? {})}`,
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
export type EmailClass = { id: string; category: string; company: string; is_job_related: boolean };

export async function classifyEmails(emails: EmailInput[], companies: string[]): Promise<EmailClass[]> {
  if (!emails.length) return [];
  const r = await structured<{ items: EmailClass[] }>({
    fast: true,
    maxTokens: 8000,
    system: `Tu tries des emails de recherche d'emploi.
Catégories : accuse_reception, refus, entretien (invitation ou planification), test (cas pratique, test technique), offre (proposition d'embauche), relance_recruteur (un recruteur/cabinet qui la contacte), alerte_offres (newsletters, alertes d'offres), autre.
company : nom de l'entreprise concernée ; si elle correspond à une entreprise de la liste fournie, utilise exactement ce nom.
is_job_related : false pour tout ce qui n'a rien à voir avec une candidature.`,
    prompt: `Entreprises suivies : ${JSON.stringify(companies)}\n\nEmails :\n${JSON.stringify(emails)}`,
    schema: {
      properties: {
        items: arr(obj({
          id: S,
          category: { type: "string", enum: ["accuse_reception", "refus", "entretien", "test", "offre", "relance_recruteur", "alerte_offres", "autre"] },
          company: S,
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
  const ach = obj({ text: S, tags: list });
  return structured<Profile>({
    maxTokens: 8000,
    thinking: 0, // simple recopie structurée : pas besoin de réfléchir longtemps
    patient: true,
    system: `Tu convertis un ou plusieurs CV (texte brut) en profil structuré. Fusionne les doublons, garde toutes les réalisations, conserve les dates telles qu'écrites. Propose 1 à 3 "targets" (métiers visés) cohérents avec le parcours. Mets dans "todo" les incohérences repérées (dates, niveaux de langue) et les chiffres manquants. N'invente rien.`,
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
}

/* ---------- 9. Extraction des offres contenues dans une alerte emploi ---------- */

export type AlertOffer = { title: string; company: string; location: string; url: string; snippet: string };

export async function extractAlertOffers(from: string, subject: string, body: string): Promise<AlertOffer[]> {
  const r = await structured<{ offers: AlertOffer[] }>({
    fast: true,
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

export async function generateFollowup(profile: Profile, app: { company: string; title: string; applied_at: string | null; contact: string | null; status: string }): Promise<{ subject: string; body: string }> {
  return structured<{ subject: string; body: string }>({
    fast: true,
    system: `Tu rédiges un email de relance de candidature en français : 80-110 mots, poli, direct, sans insistance ni formule creuse. Rappelle le poste, une valeur ajoutée concrète tirée du profil, et propose un échange. Signe avec le nom et le téléphone du profil. ${HONESTY}`,
    prompt: `Profil : ${JSON.stringify({ identity: profile.identity, targets: profile.targets, experiences: profile.experiences.map((e) => ({ company: e.company, role: e.role })) })}\nCandidature : ${JSON.stringify(app)}`,
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
- lisibilité ATS : colonnes, sections standard, mots-clés métier.
- search_strategy : à partir du questionnaire (durée de recherche, volume, réponses obtenues), dis où l'entonnoir bloque (pas de réponse = CV/ciblage ; entretiens sans offre = entretien) et ce qu'il faut changer.
${previous ? "- changes_since_last : compare avec le profil actuel fourni et liste ce qui a changé ou progressé." : ""}
Tu tutoies, tu restes bienveillante mais tu ne flattes pas. Tu t'appuies uniquement sur ce qui est écrit. overall_score : 85+ = prêt à envoyer, 60-84 = correct à retravailler, <60 = à refaire.`,
    prompt: `QUESTIONNAIRE :\n${JSON.stringify(answers ?? {})}\n\n${previous ? `PROFIL ACTUEL :\n${JSON.stringify(previous)}\n\n` : ""}CV :\n"""\n${cvText.slice(0, 40000)}\n"""`,
    schema: {
      properties: {
        overall_score: int("0-100"),
        verdict: str("3-4 phrases franches"),
        positioning: obj({ recommended_targets: arr(obj({ title: S, why: S })), comment: S }),
        strengths: list,
        issues: arr(obj({ issue: S, severity: sev, fix: str("correction concrète, avec un exemple de reformulation si utile") })),
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

/** Fusionne un CV redéposé avec le profil actuel, sans rien perdre. */
export async function mergeProfileWithCv(current: Profile, cvText: string): Promise<Profile> {
  const extracted = await profileFromCvText(cvText);
  // Fusion déterministe : on garde tout l'existant et on ajoute ce qui est nouveau
  const key = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
  const exps = [...current.experiences];
  for (const e of extracted.experiences) {
    const same = exps.find((x) => key(x.company) === key(e.company) && key(x.role).slice(0, 12) === key(e.role).slice(0, 12));
    if (!same) exps.push(e);
    else {
      const known = new Set(same.achievements.map((a) => key(a.text)));
      same.achievements.push(...e.achievements.filter((a) => !known.has(key(a.text))));
    }
  }
  const mergeList = (a: string[], b: string[]) => [...a, ...b.filter((x) => !a.some((y) => key(y) === key(x)))];
  const skills = { ...current.skills };
  for (const [cat, items] of Object.entries(extracted.skills ?? {})) skills[cat] = mergeList(skills[cat] ?? [], items);
  return {
    ...current,
    identity: { ...extracted.identity, ...Object.fromEntries(Object.entries(current.identity).filter(([, v]) => (Array.isArray(v) ? v.length : v))) } as Profile["identity"],
    targets: current.targets.length ? current.targets : extracted.targets,
    experiences: exps,
    education: [...current.education, ...extracted.education.filter((e) => !current.education.some((x) => key(x.degree) === key(e.degree)))],
    projects: [...current.projects, ...extracted.projects.filter((p) => !current.projects.some((x) => key(x.name) === key(p.name)))],
    skills,
    certifications: mergeList(current.certifications, extracted.certifications),
    languages: current.languages.length ? current.languages : extracted.languages,
    interests: mergeList(current.interests, extracted.interests),
    todo: mergeList(current.todo, extracted.todo),
  };
}
