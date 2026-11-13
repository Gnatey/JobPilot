import { LoginForm } from "@/components/login-form";
import { tx } from "@/lib/i18n/translate";

export const metadata = { title: tx("Connexion") };

export default async function Login({ searchParams }: { searchParams: Promise<{ mode?: string; erreur?: string; session?: string; confirme?: string }> }) {
  const sp = await searchParams;
  return <LoginForm initialMode={sp.mode === "signup" ? "signup" : "login"} linkExpired={sp.erreur === "lien"} sessionExpired={sp.session === "expiree"} confirmed={sp.confirme === "1"} />;
}
