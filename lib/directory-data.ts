/**
 * Annuaire d'entreprises : les données (paquet 13, 8 novembre 2026). Un fichier du dépôt, pas une table : rien à migrer, rien à lire sur le réseau.
 * Chaque entrée est UN lien vers la page recrutement de l'employeur (ou la page d'accueil d'un site d'emploi) : JobPilot ne lit rien dessus.
 * Règles (tests/directory.test.ts) : https, adresse propre (ni paramètre de suivi ni jeton), noms et adresses uniques, familles et secteurs = libellés
 * de `lib/job-families.ts`, chaque famille de métiers couverte par 3 employeurs au moins.
 * Les adresses ont été retrouvées par recherche sur les sites officiels le 8 novembre 2026 (pas ouvertes une à une : le serveur n'a pas de réseau libre).
 * Un lien peut vieillir : le corriger ici, `npm test` rappelle les règles. Ne pas y mettre « ils recrutent » : c'est un annuaire, pas une liste d'offres.
 */
import { FAMILY_LABELS, type DirType, type Entry } from "./directory";

// Familles de métiers (libellés exacts de JOB_FAMILIES)
const DATA = "Data et BI";
const DEV = "Informatique et développement";
const PROD = "Produit et gestion de projet";
const CONSEIL = "Conseil et stratégie";
const FIN = "Finance, comptabilité et gestion";
const BANK = "Banque et assurance";
const MKT = "Marketing et communication";
const SALES = "Commercial et vente";
const CUST = "Relation client et support";
const RH = "Ressources humaines et recrutement";
const LEGAL = "Juridique et conformité";
const SUPPLY = "Achats, logistique et supply chain";
const INDUS = "Industrie et production";
const ENG = "Ingénierie et BTP";
const ENERGY = "Énergie et environnement";
const HEALTH = "Santé et social";
const RESEARCH = "Recherche et sciences";
const EDU = "Enseignement et formation";
const ADMIN = "Administratif et secrétariat";
const DESIGN = "Design et création";
const REAL = "Immobilier";
const RETAIL = "Commerce et distribution";
const HOTEL = "Hôtellerie, restauration et tourisme";
const TRANSP = "Transport et livraison";
const PUBLIC = "Secteur public et associatif";
const TECHNICAL = "Métiers techniques et services";

// Ensembles de familles fréquents
const TECH = [DATA, DEV, PROD];
const ESN_FAMS = [DATA, DEV, PROD, CONSEIL, SALES, RH];
const BIG4 = [CONSEIL, FIN, LEGAL, DATA, DEV, PROD, RH];
const STRATEGY = [CONSEIL, DATA, FIN, PROD];
const BANKING = [BANK, FIN, DATA, DEV, LEGAL, PROD, RH, SALES, CUST];
const INSURANCE = [BANK, FIN, DATA, DEV, LEGAL, PROD, RH, CUST, SALES];
const SAAS = [DEV, DATA, PROD, DESIGN, SALES, MKT, CUST];
const ENERGY_FAMS = [ENERGY, ENG, INDUS, FIN, DATA, DEV, SUPPLY, RH, LEGAL, RESEARCH];
const INDUSTRY = [INDUS, ENG, SUPPLY, RESEARCH, DATA, DEV, FIN, RH, SALES, TECHNICAL];
const BUILD = [ENG, TECHNICAL, FIN, RH, LEGAL, DATA, DEV, SUPPLY, REAL, PROD];
const RETAIL_FAMS = [RETAIL, SALES, SUPPLY, CUST, MKT, DATA, DEV, FIN, RH, ADMIN];
const LUXURY = [RETAIL, SALES, MKT, DESIGN, SUPPLY, DATA, DEV, FIN, RH, INDUS];
const TRANSPORT = [TRANSP, SUPPLY, TECHNICAL, DATA, DEV, FIN, RH, SALES, CUST, ADMIN];
const HOSPITALITY = [HOTEL, SALES, CUST, MKT, RH, FIN, DATA, DEV, SUPPLY, TECHNICAL];
const PUBLIC_FAMS = [PUBLIC, ADMIN, FIN, RH, LEGAL, DATA, DEV, ENG, TECHNICAL, EDU, HEALTH, PROD];
const HEALTH_FAMS = [HEALTH, ADMIN, FIN, RH, DATA, DEV, SUPPLY, TECHNICAL, CUST];
const RECRUITERS = [FIN, RH, SALES, ADMIN, SUPPLY, LEGAL, MKT, DATA, DEV];
const EVERYTHING = FAMILY_LABELS;

const ESN: DirType = "ESN et conseil";
const FINANCE: DirType = "Banque, finance et assurance";
const GROUP: DirType = "Grands groupes";
const STARTUP: DirType = "Startups et scale-ups";
const PUBLIC_T: DirType = "Secteur public, santé et associations";
const RECRUIT: DirType = "Cabinets de recrutement";
const BOARD: DirType = "Sites d'emploi spécialisés";

const e = (name: string, type: DirType, url: string, families: readonly string[], sector: string, kw?: string): Entry => ({ name, type, url, families: [...new Set(families)], sector, kw });

export const DIRECTORY: Entry[] = [
  // ---------- ESN et conseil ----------
  e("Capgemini", ESN, "https://www.capgemini.com/fr-fr/carrieres/", ESN_FAMS, "ESN et conseil IT"),
  e("Sopra Steria", ESN, "https://careers.soprasteria.fr/", ESN_FAMS, "ESN et conseil IT"),
  e("Accenture", ESN, "https://www.accenture.com/fr-fr/careers", ESN_FAMS, "ESN et conseil IT", "conseil technologie"),
  e("CGI", ESN, "https://www.cgi.com/france/fr-fr/recrute", ESN_FAMS, "ESN et conseil IT"),
  e("Eviden (Atos)", ESN, "https://eviden.com/en/careers", ESN_FAMS, "ESN et conseil IT", "atos cybersécurité calcul"),
  e("Alten", ESN, "https://www.alten.fr/carriere/", [DEV, ENG, PROD, DATA, INDUS], "ESN et conseil IT", "ingénierie conseil technologie"),
  e("Devoteam", ESN, "https://www.devoteam.com/jobs/", TECH.concat([CONSEIL]), "ESN et conseil IT", "cloud"),
  e("Wavestone", ESN, "https://www.wavestone.com/en/careers/our-offers/", [CONSEIL, DATA, PROD, DEV], "Conseil", "cybersécurité transformation"),
  e("Onepoint", ESN, "https://www.groupeonepoint.com/en/join-onepoint/", [CONSEIL, DATA, DEV, PROD, DESIGN], "ESN et conseil IT"),
  e("Inetum", ESN, "https://france-recrute.inetum.com/jobs", ESN_FAMS, "ESN et conseil IT"),
  e("Sogeti", ESN, "https://www.fr.sogeti.com/carrieres/", ESN_FAMS, "ESN et conseil IT", "capgemini"),
  e("Aubay", ESN, "https://aubay.com/carriere-accueil/", [DATA, DEV, PROD, BANK], "ESN et conseil IT", "banque assurance"),
  e("Talan", ESN, "https://www.talan.com/global/en/join-us/our-job-offers", ESN_FAMS, "ESN et conseil IT"),
  e("Davidson", ESN, "https://www.davidson.fr/nos-offres", TECH, "ESN et conseil IT"),
  e("Extia", ESN, "https://www.extia-group.com/join-us", TECH, "ESN et conseil IT"),
  e("Cognizant", ESN, "https://careers.cognizant.com/fr/fr", ESN_FAMS, "ESN et conseil IT"),
  e("Astek", ESN, "https://astekgroup.fr/index.php/careers/?lang=en", [DEV, ENG, DATA, PROD, INDUS], "ESN et conseil IT", "ingénierie"),
  e("Deloitte France", ESN, "https://www.deloitte.com/fr/fr/careers/join-deloitte.html", BIG4, "Conseil", "audit big four"),
  e("PwC France", ESN, "https://carrieres.pwc.fr/fr/", BIG4, "Conseil", "audit big four"),
  e("EY France", ESN, "https://www.ey.com/fr_fr/careers/what-you-can-do-here", BIG4, "Conseil", "audit big four"),
  e("KPMG France", ESN, "https://emplois.kpmg.fr/recherche-d'offres", BIG4, "Conseil", "audit big four"),
  e("Forvis Mazars", ESN, "https://recrutement-fr.forvismazars.com/devenir-mazarien", [FIN, LEGAL, CONSEIL, DATA], "Comptabilité et audit", "mazars audit expertise comptable"),
  e("McKinsey & Company", ESN, "https://www.mckinsey.com/fr/careers/careers-in-france", STRATEGY, "Conseil", "stratégie"),
  e("Boston Consulting Group (BCG)", ESN, "https://careers.bcg.com/global/en/locations/france", STRATEGY, "Conseil", "stratégie"),
  e("Sia Partners", ESN, "https://www.sia-partners.com/en/join-us", [CONSEIL, DATA, FIN, PROD], "Conseil"),

  // ---------- Banque, finance et assurance ----------
  e("BNP Paribas", FINANCE, "https://group.bnpparibas/en/careers/all-job-offers", BANKING, "Banque"),
  e("Société Générale", FINANCE, "https://careers.societegenerale.com/", BANKING, "Banque"),
  e("Crédit Agricole", FINANCE, "https://groupecreditagricole.jobs/fr/nos-offres/", BANKING, "Banque", "lcl amundi"),
  e("Natixis", FINANCE, "https://recrutement.natixis.com/", BANKING, "Banque", "bpce banque d'investissement"),
  e("Groupe BPCE", FINANCE, "https://recrutement.bpce.fr/", BANKING, "Banque", "banque populaire caisse d'épargne"),
  e("La Banque Postale", FINANCE, "https://www.labanquepostale.com/candidats.html", BANKING, "Banque", "la poste"),
  e("Crédit Mutuel Alliance Fédérale", FINANCE, "https://recrutement.creditmutuel.fr/fr/nos_offres.html", BANKING, "Banque", "cic"),
  e("LCL", FINANCE, "https://www.lcl.com/recrutement/", BANKING, "Banque", "crédit lyonnais"),
  e("AXA France", FINANCE, "https://recrutement.axa.fr/", INSURANCE, "Assurance"),
  e("Allianz France", FINANCE, "https://careers.allianz.com/fr/fr", INSURANCE, "Assurance"),
  e("Generali France", FINANCE, "https://carrieres.generali.fr/", INSURANCE, "Assurance"),
  e("CNP Assurances", FINANCE, "https://www.cnp.fr/en/the-cnp-assurances-group/candidates", INSURANCE, "Assurance", "actuariat"),
  e("MAIF", FINANCE, "https://recrutement.maif.fr/", INSURANCE, "Assurance", "mutuelle"),
  e("Macif", FINANCE, "https://www.macif.fr/assurance/la-macif/ressources-humaines", INSURANCE, "Assurance", "mutuelle"),
  e("Covéa", FINANCE, "https://covea.eu/fr/carrieres/decouvrez-nos-metiers", INSURANCE, "Assurance", "maaf macif gmf mma"),
  e("AG2R La Mondiale", FINANCE, "https://www.ag2rlamondiale.fr/recrutement", INSURANCE, "Assurance", "retraite prévoyance mutuelle"),
  e("Malakoff Humanis", FINANCE, "https://carrieres.malakoffhumanis.com/offre-de-emploi/liste-offres.aspx", INSURANCE, "Assurance", "retraite prévoyance mutuelle"),
  e("Klesia", FINANCE, "https://recrutement.klesia.fr/fr", INSURANCE, "Assurance", "retraite prévoyance"),
  e("Amundi", FINANCE, "https://jobs.amundi.com/offre-de-emploi/liste-offres.aspx", [FIN, DATA, DEV, LEGAL, PROD], "Finance et investissement", "gestion d'actifs"),
  e("Caisse des Dépôts", FINANCE, "https://recrutement.groupe.caissedesdepots.fr/offre-de-emploi/liste-offres.aspx", [FIN, DATA, DEV, LEGAL, PROD, PUBLIC, REAL], "Finance et investissement", "banque des territoires"),
  e("Banque de France", FINANCE, "https://www.recrutement.banque-france.fr/fr", [FIN, DATA, DEV, LEGAL, RESEARCH, BANK], "Banque", "économie banque centrale"),

  // ---------- Startups et scale-ups ----------
  e("Dataiku", STARTUP, "https://www.dataiku.com/company/careers", [DATA, DEV, PROD, SALES, MKT, CUST, RH], "Données et IA"),
  e("Criteo", STARTUP, "https://careers.criteo.com/en/", [DATA, DEV, PROD, SALES, MKT, FIN], "Publicité et communication", "adtech"),
  e("Doctolib", STARTUP, "https://careers.doctolib.fr/", SAAS.concat([HEALTH]), "Tech et logiciel (SaaS)", "santé"),
  e("Mirakl", STARTUP, "https://www.mirakl.com/company/careers/jobs/", SAAS, "Tech et logiciel (SaaS)", "marketplace"),
  e("Contentsquare", STARTUP, "https://contentsquare.com/careers/", SAAS, "Tech et logiciel (SaaS)", "analytics expérience digitale"),
  e("Qonto", STARTUP, "https://qonto.com/en/careers", SAAS.concat([BANK, FIN, LEGAL]), "Fintech", "néobanque"),
  e("Alan", STARTUP, "https://alan.com/en/careers", SAAS.concat([BANK]), "Assurance", "assurance santé"),
  e("Back Market", STARTUP, "https://jobs.backmarket.com/", SAAS.concat([SUPPLY, RETAIL]), "E-commerce", "reconditionné"),
  e("Ledger", STARTUP, "https://careers.ledger.com/", SAAS.concat([LEGAL, FIN]), "Fintech", "crypto sécurité"),
  e("OVHcloud", STARTUP, "https://careers.ovhcloud.com/go/?locale=fr_FR", SAAS.concat([INDUS, SUPPLY]), "Tech et logiciel (SaaS)", "cloud hébergement"),
  e("Algolia", STARTUP, "https://www.algolia.com/careers", SAAS, "Tech et logiciel (SaaS)", "recherche"),
  e("PayFit", STARTUP, "https://careers.payfit.com/", SAAS.concat([RH, FIN]), "Tech et logiciel (SaaS)", "paie rh"),
  e("Swile", STARTUP, "https://www.swile.co/careers", SAAS.concat([FIN]), "Fintech", "titres-restaurant avantages salariés"),
  e("Veepee", STARTUP, "https://careers.veepee.com/en/", SAAS.concat([RETAIL, SUPPLY]), "E-commerce", "ventes privées"),
  e("Deezer", STARTUP, "https://www.deezerjobs.com/en/", SAAS.concat([LEGAL]), "Médias et édition", "musique streaming"),
  e("Mistral AI", STARTUP, "https://mistral.ai/careers/", [DATA, DEV, RESEARCH, PROD, SALES], "Données et IA", "intelligence artificielle"),
  e("Datadog", STARTUP, "https://careers.datadoghq.com/emea/", SAAS, "Tech et logiciel (SaaS)", "observabilité"),
  e("Pennylane", STARTUP, "https://www.pennylane.com/fr/carrieres", SAAS.concat([FIN]), "Fintech", "comptabilité gestion"),
  e("BlaBlaCar", STARTUP, "https://jobs.blablacar.com/", SAAS, "Tech et logiciel (SaaS)", "covoiturage"),
  e("ManoMano", STARTUP, "https://jobs.manomano.com/en/", SAAS.concat([RETAIL, SUPPLY]), "E-commerce", "bricolage"),
  e("Spendesk", STARTUP, "https://career.spendesk.com/jobs", SAAS.concat([FIN]), "Fintech", "dépenses"),
  e("Aircall", STARTUP, "https://aircall.io/careers/", SAAS, "Tech et logiciel (SaaS)", "téléphonie"),
  e("Ankorstore", STARTUP, "https://my.ankorstore.com/join-us/en", SAAS.concat([RETAIL, SUPPLY]), "E-commerce", "commerce de gros"),
  e("OpenClassrooms", STARTUP, "https://jobs.openclassrooms.com/jobs", SAAS.concat([EDU]), "Éducation et formation", "formation en ligne"),

  // ---------- Grands groupes ----------
  e("TotalEnergies", GROUP, "https://jobs.totalenergies.com/fr_FR/careers/SearchJobs", ENERGY_FAMS, "Énergie et utilities", "pétrole gaz"),
  e("EDF", GROUP, "https://www.edf.fr/en/edf-join-us/join-us/see-the-offers/our-offers", ENERGY_FAMS, "Énergie et utilities", "électricité nucléaire"),
  e("Engie", GROUP, "https://jobs.engie.com/?locale=fr_FR", ENERGY_FAMS, "Énergie et utilities", "gaz électricité"),
  e("Orano", GROUP, "https://jobs.orano.group/fr_FR/jobs/SearchJobs", ENERGY_FAMS, "Énergie et utilities", "nucléaire"),
  e("Air Liquide", GROUP, "https://www.airliquide.com/join-us/careers-air-liquide", INDUSTRY.concat([ENERGY]), "Chimie et matériaux", "gaz industriels"),
  e("Veolia", GROUP, "https://jobs.veolia.com/fr/search-jobs", ENERGY_FAMS.concat([TECHNICAL]), "Environnement et RSE", "eau déchets"),
  e("Schneider Electric", GROUP, "https://careers.se.com/france", INDUSTRY.concat([ENERGY]), "Industrie", "électricité automatismes"),
  e("Saint-Gobain", GROUP, "https://joinus.saint-gobain.com/fr", INDUSTRY.concat([ENG]), "Chimie et matériaux", "construction verre"),
  e("Legrand", GROUP, "https://careers.legrand.com/fr/", INDUSTRY, "Industrie", "électricité bâtiment"),
  e("Michelin", GROUP, "https://recrutement.michelin.fr/trouvez-votre-emploi-chez-michelin", INDUSTRY, "Industrie", "pneumatiques"),
  e("Safran", GROUP, "https://www.safran-group.com/jobs", INDUSTRY, "Aéronautique et défense", "moteurs"),
  e("Thales", GROUP, "https://careers.thalesgroup.com/fr/fr", INDUSTRY, "Aéronautique et défense", "défense spatial"),
  e("Airbus", GROUP, "https://www.airbus.com/en/careers", INDUSTRY, "Aéronautique et défense", "avions"),
  e("Dassault Systèmes", GROUP, "https://www.3ds.com/careers", SAAS.concat([RESEARCH]), "Tech et logiciel (SaaS)", "logiciel 3d"),
  e("Renault Group", GROUP, "https://www.renaultgroup.com/en/careers/", INDUSTRY, "Automobile"),
  e("Stellantis", GROUP, "https://careers.stellantis.com/", INDUSTRY, "Automobile", "peugeot citroën"),
  e("SNCF", GROUP, "https://emploi.sncf.com/nos-offres", TRANSPORT.concat([ENG]), "Transport et logistique", "train"),
  e("RATP", GROUP, "https://www.ratp.fr/carrieres", TRANSPORT.concat([ENG]), "Transport et logistique", "métro bus"),
  e("Air France", GROUP, "https://recrutement.airfrance.com/", TRANSPORT.concat([HOTEL]), "Transport et logistique", "aérien"),
  e("Geodis", GROUP, "https://injob.geodis.com/homepage.aspx", TRANSPORT, "Transport et logistique", "logistique"),
  e("CMA CGM", GROUP, "https://www.cmacgm-group.com/en/talents", TRANSPORT, "Transport et logistique", "maritime"),
  e("VINCI", GROUP, "https://emplois.vinci.com/", BUILD, "BTP et construction", "concessions travaux"),
  e("Bouygues", GROUP, "https://talents.bouygues.com/homepage.aspx", BUILD, "BTP et construction", "construction télécoms"),
  e("Eiffage", GROUP, "https://www.eiffage.com/carrieres", BUILD, "BTP et construction", "travaux"),
  e("Orange", GROUP, "https://orange.jobs/fr/fr/search-results", SAAS.concat([CUST, FIN, RH]), "Télécoms"),
  e("SFR", GROUP, "https://recrutement.sfr.com/", SAAS.concat([CUST, FIN, RH]), "Télécoms", "altice"),
  e("Sanofi", GROUP, "https://jobs.sanofi.com/en/france", [RESEARCH, HEALTH, INDUS, DATA, DEV, FIN, MKT, SALES, SUPPLY, LEGAL, RH], "Santé et pharma", "médicaments laboratoire"),
  e("L'Oréal", GROUP, "https://careers.loreal.com/fr_FR/content/France", LUXURY.concat([RESEARCH]), "Luxe, mode et cosmétique", "cosmétique beauté"),
  e("Danone", GROUP, "https://careers.danone.com/fr/fr/home.html", INDUSTRY.concat([MKT]), "Agroalimentaire", "produits laitiers"),
  e("Pernod Ricard", GROUP, "https://www.pernod-ricard.com/en/careers", INDUSTRY.concat([MKT]), "Agroalimentaire", "vins spiritueux"),
  e("LVMH", GROUP, "https://thejourney.lvmh.com/jobs/", LUXURY, "Luxe, mode et cosmétique", "louis vuitton dior"),
  e("Hermès", GROUP, "https://talents.hermes.com/fr-FR/sites/CX/", LUXURY, "Luxe, mode et cosmétique"),
  e("Carrefour", GROUP, "https://recrute.carrefour.fr/", RETAIL_FAMS, "Commerce et distribution", "supermarché"),
  e("Auchan", GROUP, "https://www.auchan-recrute.fr/jobs", RETAIL_FAMS, "Commerce et distribution", "supermarché"),
  e("Decathlon", GROUP, "https://recrutement.decathlon.fr/", RETAIL_FAMS.concat([DESIGN]), "Commerce et distribution", "sport"),
  e("Leroy Merlin", GROUP, "https://recrute.leroymerlin.fr/", RETAIL_FAMS, "Commerce et distribution", "bricolage"),
  e("Fnac Darty", GROUP, "https://carrieres.fnacdarty.com/search", RETAIL_FAMS, "Commerce et distribution", "électroménager culture"),
  e("Publicis Groupe", GROUP, "https://france.publicisgroupe.com/carrieres/?lang=fr", [MKT, DESIGN, DATA, DEV, CONSEIL, SALES, PROD, RH, FIN], "Publicité et communication", "agence publicité média"),
  e("Accor", GROUP, "https://careers.accor.com/fr/fr/jobs", HOSPITALITY, "Tourisme, hôtellerie et restauration", "hôtels"),
  e("Club Med", GROUP, "https://www.clubmedjobs.com/en/search_jobs", HOSPITALITY, "Tourisme, hôtellerie et restauration", "villages vacances"),
  e("Sodexo", GROUP, "https://www.sodexo.fr/carrieres/nos-metiers", HOSPITALITY, "Tourisme, hôtellerie et restauration", "restauration collective services"),
  e("Nexity", GROUP, "https://nexity.fr/recrutement", [REAL, SALES, ENG, FIN, LEGAL, RH, DATA, DEV, CUST, MKT], "Immobilier", "promotion immobilière"),
  e("Foncia", GROUP, "https://fr.foncia.com/carrieres", [REAL, SALES, CUST, FIN, LEGAL, ADMIN, RH, MKT], "Immobilier", "syndic gestion locative"),
  e("Google", GROUP, "https://www.google.com/about/careers/applications/", SAAS.concat([RESEARCH, LEGAL]), "Tech et logiciel (SaaS)"),
  e("Microsoft", GROUP, "https://careers.microsoft.com/v2/global/en/locations/paris.html", SAAS.concat([RESEARCH, LEGAL]), "Tech et logiciel (SaaS)"),
  e("Amazon (AWS)", GROUP, "https://www.amazon.jobs/en/location/france", SAAS.concat([SUPPLY, LEGAL]), "Tech et logiciel (SaaS)", "logistique cloud"),
  e("SAP", GROUP, "https://jobs.sap.com/go/SAP-Jobs-in-France/850401/", SAAS.concat([CONSEIL]), "Tech et logiciel (SaaS)", "erp"),
  e("Salesforce", GROUP, "https://www.salesforce.com/company/careers/locations/emea/france/", SAAS.concat([CONSEIL]), "Tech et logiciel (SaaS)", "crm"),
  e("Ubisoft", GROUP, "https://www.ubisoft.com/fr-fr/company/careers/our-jobs", SAAS.concat([PROD]), "Jeux vidéo"),
  e("Zenika", ESN, "https://jobs.zenika.com/", TECH, "ESN et conseil IT", "agile cloud développement"),
  e("Cegos", ESN, "https://recrutement.cegos.com/", [EDU, RH, CONSEIL, SALES, ADMIN], "Éducation et formation", "formation professionnelle"),

  // ---------- Secteur public, santé et associations ----------
  e("AP-HP", PUBLIC_T, "https://recrutement.aphp.fr/", HEALTH_FAMS.concat([RESEARCH, LEGAL]), "Santé et pharma", "hôpitaux paris"),
  e("Ramsay Santé", PUBLIC_T, "https://www.ramsaysante.fr/recrutement-nous-rejoindre/nos-offres-demploi", HEALTH_FAMS, "Santé et pharma", "cliniques"),
  e("Elsan", PUBLIC_T, "https://www.elsan.care/en/candidates", HEALTH_FAMS, "Santé et pharma", "cliniques"),
  e("Clariane", PUBLIC_T, "https://nousrejoindre.clariane.com/", HEALTH_FAMS.concat([HOTEL]), "Santé et pharma", "korian ehpad"),
  e("CNRS", PUBLIC_T, "https://emploi.cnrs.fr/", [RESEARCH, DATA, DEV, ADMIN, ENG, TECHNICAL, RH, FIN, EDU], "Biotech et recherche", "laboratoires"),
  e("Inria", PUBLIC_T, "https://jobs.inria.fr/public/classic/fr/offres", [RESEARCH, DATA, DEV, ADMIN, PROD, RH, FIN], "Biotech et recherche", "numérique"),
  e("CEA", PUBLIC_T, "https://www.emploi.cea.fr/offre-de-emploi/liste-offres.aspx", [RESEARCH, ENG, ENERGY, DATA, DEV, INDUS, ADMIN, TECHNICAL], "Biotech et recherche", "énergie atomique"),
  e("Insee", PUBLIC_T, "https://www.insee.fr/fr/information/4776620", [DATA, RESEARCH, PUBLIC, FIN, DEV, ADMIN], "Secteur public et collectivités", "statistiques"),
  e("L'Assurance Maladie", PUBLIC_T, "https://www.assurance-maladie.ameli.fr/nous-rejoindre/nos-offres-demploi", PUBLIC_FAMS.concat([CUST]), "Secteur public et collectivités", "sécurité sociale cpam"),
  e("Ville de Paris", PUBLIC_T, "https://travaillerpourparis.paris.fr/", PUBLIC_FAMS.concat([DESIGN, MKT]), "Secteur public et collectivités", "collectivité mairie"),
  e("Éducation nationale", PUBLIC_T, "https://www.devenirenseignant.gouv.fr/", [EDU, PUBLIC, ADMIN], "Éducation et formation", "enseignant professeur concours"),
  e("Croix-Rouge française", PUBLIC_T, "https://www.croix-rouge.fr/jobs", [HEALTH, PUBLIC, EDU, ADMIN, RH, FIN, MKT, SUPPLY, LEGAL], "Associations et ESS", "humanitaire"),
  e("Médecins Sans Frontières", PUBLIC_T, "https://www.msf.fr/agir/rejoindre-nos-equipes/offres-emploi", [HEALTH, PUBLIC, SUPPLY, FIN, RH, MKT, LEGAL, ADMIN], "Associations et ESS", "humanitaire"),

  // ---------- Cabinets de recrutement ----------
  e("Michael Page", RECRUIT, "https://www.michaelpage.fr/", RECRUITERS.concat([BANK, PROD, INDUS]), "RH et recrutement"),
  e("Page Personnel", RECRUIT, "https://www.pagepersonnel.fr/", [ADMIN, FIN, RH, SALES, CUST, SUPPLY, MKT, LEGAL], "RH et recrutement", "assistanat comptabilité"),
  e("Robert Half", RECRUIT, "https://www.roberthalf.com/fr/fr/offres-emploi", [FIN, DATA, DEV, ADMIN, RH, LEGAL, BANK, PROD], "RH et recrutement"),
  e("Hays", RECRUIT, "https://www.hays.fr/", RECRUITERS.concat([ENG, INDUS, ENERGY]), "RH et recrutement"),
  e("Randstad", RECRUIT, "https://www.randstad.fr/emploi/", [INDUS, SUPPLY, ADMIN, CUST, SALES, TECHNICAL, TRANSP, HEALTH, RETAIL, HOTEL, FIN, RH], "RH et recrutement", "intérim"),
  e("Adecco", RECRUIT, "https://www.adecco.fr/resultats-offres-emploi", [INDUS, SUPPLY, ADMIN, CUST, SALES, TECHNICAL, TRANSP, RETAIL, HOTEL, FIN, HEALTH, ENG], "RH et recrutement", "intérim"),
  e("Manpower", RECRUIT, "https://www.manpower.fr/", [INDUS, SUPPLY, ADMIN, CUST, SALES, TECHNICAL, TRANSP, RETAIL, HOTEL, FIN, HEALTH, ENG], "RH et recrutement", "intérim"),
  e("Synergie", RECRUIT, "https://www.synergie.fr/", [INDUS, ADMIN, SUPPLY, TECHNICAL, HEALTH, TRANSP, RETAIL, SALES, CUST, ENG], "RH et recrutement", "intérim"),
  e("Walters People", RECRUIT, "https://www.walterspeople.fr/", [FIN, BANK, LEGAL, RH, SUPPLY, MKT, ADMIN, REAL, SALES], "RH et recrutement"),
  e("Externatic", RECRUIT, "https://www.externatic.fr/", TECH, "RH et recrutement", "informatique développeur"),

  // ---------- Sites d'emploi spécialisés ----------
  e("Free-Work", BOARD, "https://www.free-work.com/", TECH.concat([DESIGN]), "Tech et logiciel (SaaS)", "freelance informatique"),
  e("Les Jeudis", BOARD, "https://lesjeudis.com/offers", TECH, "Tech et logiciel (SaaS)", "informatique"),
  e("talent.io", BOARD, "https://public.talent.io/fr-fr/home", TECH, "Tech et logiciel (SaaS)", "développeur data"),
  e("Malt", BOARD, "https://www.malt.fr/", [DEV, DATA, DESIGN, MKT, CONSEIL, PROD, FIN], "Conseil", "freelance indépendant"),
  e("Comet", BOARD, "https://www.comet.co/", [DATA, DEV, PROD, DESIGN, CONSEIL], "ESN et conseil IT", "freelance consultant"),
  e("Jobs That Make Sense", BOARD, "https://jobs.makesense.org/en/s/jobs", [PUBLIC, MKT, PROD, DEV, DATA, FIN, RH, ENERGY, EDU, HEALTH], "Associations et ESS", "impact social environnement"),
  e("Emploi-Environnement", BOARD, "https://www.emploi-environnement.com/", [ENERGY, ENG, RESEARCH, PUBLIC, TECHNICAL], "Environnement et RSE", "développement durable écologie"),
  e("Place de l'emploi public", BOARD, "https://place-emploi-public.gouv.fr/nos-offres/", PUBLIC_FAMS, "Secteur public et collectivités", "fonction publique"),
  e("Choisir le service public", BOARD, "https://choisirleservicepublic.gouv.fr/nos-offres/", PUBLIC_FAMS, "Secteur public et collectivités", "fonction publique concours"),
  e("Emploi Territorial", BOARD, "https://www.emploi-territorial.fr/", PUBLIC_FAMS, "Secteur public et collectivités", "collectivités communes départements"),
  e("Hosco", BOARD, "https://www.hosco.com/en/jobs", [HOTEL, SALES, CUST, MKT, RH, FIN], "Tourisme, hôtellerie et restauration", "hôtellerie restauration"),
  e("FashionJobs", BOARD, "https://fr.fashionjobs.com/", [RETAIL, MKT, DESIGN, SALES, SUPPLY], "Luxe, mode et cosmétique", "mode luxe beauté"),
  e("ProfilCulture", BOARD, "https://www.profilculture.com/", [DESIGN, MKT, PUBLIC, EDU, ADMIN], "Médias et édition", "culture spectacle musée audiovisuel"),
  e("JobTeaser", BOARD, "https://www.jobteaser.com/fr/job-search/list", EVERYTHING, "", "stage alternance premier emploi jeunes diplômés"),
  e("La bonne alternance", BOARD, "https://labonnealternance.apprentissage.beta.gouv.fr/", EVERYTHING, "", "alternance apprentissage"),
  e("1jeune1solution", BOARD, "https://www.1jeune1solution.gouv.fr/", EVERYTHING, "", "jeunes stage alternance emploi"),

  // --- fin de la liste ---
];
