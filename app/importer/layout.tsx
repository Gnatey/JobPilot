// La page est un composant du navigateur (pas de `metadata` possible) : ce petit gabarit donne son titre à l'onglet.
export const metadata = { title: "Réception d'une page" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
