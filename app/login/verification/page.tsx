import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { TwoFactorGate } from "@/components/two-factor";

export const metadata = { title: "Vérification en deux étapes" };

export default async function Verification() {
  if (!(await getUser())) redirect("/login");
  return <TwoFactorGate />;
}
