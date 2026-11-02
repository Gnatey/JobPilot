const flat = (s: string) => s.replace(/\s+/g, " ").trim();

/**
 * Le favori envoie parfois seulement la description (texte sélectionné, ou bloc « description » reconnu) :
 * le bandeau du haut de l'annonce (salaire, expérience demandée, niveau d'études, type d'entreprise, contrat) est alors perdu,
 * et l'IA devine (« senior » à tort, « aucun salaire » à tort).
 * On rajoute donc le morceau de la page qui précède la description : c'est là que ce bandeau se trouve.
 */
export function withHeader(description: string, page: string, title = ""): string {
  const body = description.trim();
  const all = flat(page);
  const start = flat(body).slice(0, 80);
  if (all.length <= flat(body).length + 40) return body; // la description est déjà toute la page

  let header = "";
  const at = start.length >= 30 ? all.indexOf(start) : -1;
  if (at > 0) header = all.slice(Math.max(0, at - 1500), at);
  else if (at < 0) header = all.slice(0, 1200); // mise en forme différente : le bandeau est en général au début de la page
  header = header.trim();
  if (header.length < 20) return body;

  return `${title ? `Page : ${flat(title)}\n` : ""}En-tête de l'annonce (titre, entreprise, contrat, salaire, expérience, études) :\n${header}\n\nDescription du poste :\n${body}`;
}
