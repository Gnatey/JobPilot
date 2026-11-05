// La page est un composant du navigateur (pas de `metadata` possible) : ce petit gabarit donne son titre à l'onglet.
export const metadata = { title: "Recherche" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
