/** Familles de métiers, à la manière des sites d'emploi (Indeed, Glassdoor, Welcome to the Jungle). */
export type Family = { label: string; options: string[] };

export const JOB_FAMILIES: Family[] = [
  { label: "Data et BI", options: [
    "Data Analyst", "Business Analyst", "BI Analyst", "Consultant BI", "Développeur Power BI", "Reporting Analyst", "Analytics Engineer",
    "Data Engineer", "Data Scientist", "Data Steward", "Data Manager", "Data Product Owner", "Chef de projet Data", "Responsable Data",
  ] },
  { label: "Informatique et développement", options: [
    "Développeur Full Stack", "Développeur Front-end", "Développeur Back-end", "Développeur Java", "Développeur Python", "Développeur Mobile",
    "Ingénieur DevOps", "Ingénieur Cloud", "Architecte logiciel", "Testeur QA", "Administrateur systèmes et réseaux", "Technicien support informatique",
    "Consultant SAP", "Ingénieur Cybersécurité", "Analyste SOC",
  ] },
  { label: "Produit et gestion de projet", options: [
    "Product Owner", "Product Manager", "Chef de projet", "Chef de projet IT", "Scrum Master", "AMOA", "Consultant fonctionnel",
    "PMO", "Responsable de programme", "Business Developer",
  ] },
  { label: "Conseil et stratégie", options: [
    "Consultant", "Consultant en stratégie", "Consultant en organisation", "Consultant SI", "Chargé d'études", "Chargé de mission",
    "Analyste stratégie", "Auditeur",
  ] },
  { label: "Finance, comptabilité et gestion", options: [
    "Contrôleur de gestion", "Financial Controller", "Analyste financier", "Comptable", "Assistant comptable", "Responsable administratif et financier",
    "Trésorier", "Chargé de recouvrement", "Gestionnaire de paie", "FP&A Analyst", "Auditeur financier",
  ] },
  { label: "Banque et assurance", options: [
    "Conseiller clientèle bancaire", "Chargé d'affaires", "Gestionnaire de sinistres", "Souscripteur", "Actuaire", "Analyste risques",
    "Compliance Officer", "Gestionnaire middle office", "Gestionnaire back office", "Conseiller en gestion de patrimoine",
  ] },
  { label: "Marketing et communication", options: [
    "Chef de projet marketing", "Responsable marketing digital", "Community Manager", "Content Manager", "SEO Manager", "Traffic Manager",
    "Growth Marketer", "CRM Manager", "Marketing automation", "Chargé de communication", "Responsable communication", "Brand Manager",
    "Chargé d'études marketing", "Chef de produit",
  ] },
  { label: "Commercial et vente", options: [
    "Business Developer", "Ingénieur d'affaires", "Technico-commercial", "Account Executive", "Account Manager", "Key Account Manager",
    "SDR / BDR", "Chargé de clientèle", "Responsable de secteur", "Conseiller commercial", "Assistant commercial",
  ] },
  { label: "Relation client et support", options: [
    "Conseiller clientèle", "Customer Success Manager", "Chargé de support client", "Téléconseiller", "Responsable service client", "Chargé de relation client",
  ] },
  { label: "Ressources humaines et recrutement", options: [
    "Chargé de recrutement", "Chargé RH", "Responsable RH", "HR Business Partner", "Responsable formation", "Gestionnaire RH", "Chargé de mission RH",
  ] },
  { label: "Juridique et conformité", options: [
    "Juriste", "Juriste d'entreprise", "Juriste contrats", "Paralegal", "DPO", "Responsable conformité",
  ] },
  { label: "Achats, logistique et supply chain", options: [
    "Acheteur", "Approvisionneur", "Supply Chain Planner", "Responsable logistique", "Gestionnaire de stocks", "Responsable transport",
    "Responsable entrepôt", "Déclarant en douane", "Gestionnaire de flux",
  ] },
  { label: "Industrie et production", options: [
    "Technicien de production", "Responsable de production", "Ingénieur qualité", "Technicien maintenance", "Ingénieur méthodes", "Ingénieur process",
    "Conducteur de ligne", "Responsable HSE", "Technicien qualité",
  ] },
  { label: "Ingénierie et BTP", options: [
    "Ingénieur d'études", "Ingénieur bureau d'études", "Conducteur de travaux", "Chef de chantier", "Dessinateur projeteur", "Économiste de la construction",
    "Chargé d'affaires BTP", "Géomètre",
  ] },
  { label: "Énergie et environnement", options: [
    "Ingénieur énergie", "Chargé d'affaires énergie", "Analyste énergie", "Responsable RSE", "Chargé de mission environnement",
    "Technicien énergies renouvelables", "Energy Trader",
  ] },
  { label: "Santé et social", options: [
    "Infirmier", "Aide-soignant", "Pharmacien", "Technicien de laboratoire", "Assistant social", "Éducateur spécialisé", "Psychologue",
    "Kinésithérapeute", "Aide à domicile", "Chargé de mission santé publique",
  ] },
  { label: "Recherche et sciences", options: [
    "Ingénieur R&D", "Chercheur", "Biostatisticien", "Attaché de recherche clinique", "Data Manager clinique", "Chargé d'études cliniques",
  ] },
  { label: "Enseignement et formation", options: [
    "Enseignant", "Formateur", "Responsable pédagogique", "Conseiller d'orientation", "Chargé d'insertion", "Coordinateur de formation",
  ] },
  { label: "Administratif et secrétariat", options: [
    "Assistant administratif", "Assistant de direction", "Secrétaire", "Gestionnaire administratif", "Office Manager", "Chargé d'accueil", "Gestionnaire de dossiers",
  ] },
  { label: "Design et création", options: [
    "UX Designer", "UI Designer", "Designer produit", "Graphiste", "Motion Designer", "Directeur artistique", "Webdesigner",
    "Rédacteur / Copywriter", "Monteur vidéo", "Photographe",
  ] },
  { label: "Immobilier", options: [
    "Agent immobilier", "Négociateur immobilier", "Gestionnaire locatif", "Property Manager", "Gestionnaire de copropriété", "Assistant immobilier",
  ] },
  { label: "Commerce et distribution", options: [
    "Responsable de magasin", "Responsable de rayon", "Conseiller de vente", "Employé commercial", "Category Manager", "Merchandiser", "Caissier",
  ] },
  { label: "Hôtellerie, restauration et tourisme", options: [
    "Réceptionniste", "Serveur", "Cuisinier", "Responsable de restaurant", "Guide / animateur", "Agent de voyages", "Gouvernante",
  ] },
  { label: "Transport et livraison", options: [
    "Chauffeur", "Conducteur routier", "Conducteur de bus", "Agent d'exploitation", "Cariste", "Coursier / livreur",
  ] },
  { label: "Secteur public et associatif", options: [
    "Agent administratif", "Chargé de projet associatif", "Chargé de collecte de fonds", "Coordinateur", "Animateur", "Médiateur",
  ] },
  { label: "Métiers techniques et services", options: [
    "Électricien", "Plombier", "Mécanicien", "Technicien de maintenance", "Agent de sécurité", "Agent d'entretien",
  ] },
];

export const SECTOR_FAMILIES: Family[] = [
  { label: "Finance", options: ["Banque", "Assurance", "Finance et investissement", "Fintech", "Comptabilité et audit"] },
  { label: "Numérique", options: ["Tech et logiciel (SaaS)", "ESN et conseil IT", "Télécoms", "Jeux vidéo", "Cybersécurité", "Données et IA"] },
  { label: "Industrie et énergie", options: ["Énergie et utilities", "Industrie", "Aéronautique et défense", "Automobile", "Environnement et RSE", "BTP et construction", "Agroalimentaire", "Chimie et matériaux"] },
  { label: "Services et commerce", options: ["Conseil", "Commerce et distribution", "E-commerce", "Luxe, mode et cosmétique", "Immobilier", "Transport et logistique", "Tourisme, hôtellerie et restauration", "Médias et édition", "Publicité et communication", "RH et recrutement", "Sport et loisirs"] },
  { label: "Public, santé et social", options: ["Santé et pharma", "Biotech et recherche", "Secteur public et collectivités", "Éducation et formation", "Associations et ESS"] },
];

/** Aplatit les familles en options groupées (liste déroulante), sans doublon d'intitulé. */
export function flattenFamilies(families: Family[]): { id: string; label: string; group: string }[] {
  const seen = new Set<string>();
  const out: { id: string; label: string; group: string }[] = [];
  for (const f of families) for (const label of f.options) if (!seen.has(label)) { seen.add(label); out.push({ id: label, label, group: f.label }); }
  return out;
}
export const JOB_OPTIONS = flattenFamilies(JOB_FAMILIES);
export const SECTOR_OPTIONS = flattenFamilies(SECTOR_FAMILIES);

/** Postes saisis dans une recherche : séparés par des virgules, 3 au maximum. */
export const MAX_ROLES = 3;
export const splitRoles = (keywords: string): string[] =>
  [...new Set(keywords.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean))].slice(0, MAX_ROLES);
