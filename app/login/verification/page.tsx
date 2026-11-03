import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { TwoFactorGate } from "@/components/two-factor";
import { reauthDays, trustSecret } from "@/lib/reauth";

export const metadata = { title: "Vérification en deux étapes" };

export default async function Verification() {
  const user = await getUser();
  if (!user) redirect("/login");
  // Sans clé de service dans Vercel, l'appareil ne peut pas être marqué « de confiance » : la case est masquée
  return <TwoFactorGate trustDays={trustSecret() ? reauthDays(user.email) : 0} />;
}
