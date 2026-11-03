import { ENV_VARS, SUPABASE_URL, SUPABASE_ANON_KEY, supabaseConfigured } from "@/lib/env";
import { Logo } from "@/components/nav";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Page affichée tant que l'app n'a pas ses variables (personne ne peut encore se connecter). N'affiche jamais les valeurs, seulement leur présence.
 * Une fois l'app configurée, elle n'a plus lieu d'être publique : l'état de l'installation est dans /admin (qui demande la connexion).
 */
export default function Configuration() {
  if (supabaseConfigured()) redirect("/admin#installation");
  const rows = ENV_VARS.map((v) => ({ ...v, ok: Boolean(process.env[v.name]) || [v.alt ?? []].flat().some((k) => Boolean(process.env[k])) }));
  const missingRequired = rows.filter((r) => r.required && !r.ok);
  const urlProblem = SUPABASE_URL && !supabaseConfigured()
    ? SUPABASE_ANON_KEY !== SUPABASE_ANON_KEY.trim() ? "La clé Supabase contient un espace ou un retour à la ligne au début ou à la fin." : "NEXT_PUBLIC_SUPABASE_URL n'est pas une adresse valide : elle doit ressembler à https://abcd1234.supabase.co, sans guillemets ni espace."
    : null;
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Logo />
      <h1 className="display mt-8 text-[2.4rem]">
        {missingRequired.length || urlProblem ? "Il manque des réglages" : "Configuration en place"}
      </h1>
      <p className="mt-2 text-muted">
        {missingRequired.length
          ? "Ajoute les variables manquantes dans Vercel (Settings > Environment Variables), puis lance un Redeploy : les variables NEXT_PUBLIC_ ne sont prises en compte qu'au déploiement."
          : supabaseConfigured() ? "Tout l'indispensable est là." : "Les variables existent mais l'adresse Supabase semble invalide : elle doit commencer par https://."}
      </p>
      {urlProblem && <p className="mt-4 rounded-xl bg-bad/10 p-3 text-sm text-bad">{urlProblem} Corrige-la dans Vercel puis redéploie.</p>}
      <ul className="list mt-6">
        {rows.map((r) => (
          <li key={r.name} className="flex items-start gap-3 px-4 py-3">
            <span className={`mt-0.5 font-bold ${r.ok ? "text-good" : r.required ? "text-bad" : "text-muted"}`} aria-label={r.ok ? "présente" : "absente"}>
              {r.ok ? "✓" : r.required ? "✗" : "○"}
            </span>
            <div className="min-w-0">
              <p className="break-all font-mono text-sm font-semibold">{r.name}</p>
              <p className="text-sm text-muted">{r.role}{r.required ? "" : " (facultatif)"}</p>
            </div>
          </li>
        ))}
      </ul>
      {!missingRequired.length && !urlProblem && <a href="/login" className="btn btn-primary mt-6">Aller à la connexion</a>}
    </div>
  );
}
