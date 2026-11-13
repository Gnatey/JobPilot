// Retour du lien de confirmation d'inscription : bannière verte dans l'appli, ou « adresse confirmée » sur la page de connexion.
// Avant : un lien ouvert dans un autre navigateur que celui de l'inscription affichait « Ce lien a expiré » alors que l'adresse était confirmée.
import { readFileSync } from "node:fs";
import { ok, done } from "./helpers";
import { returnTarget, CONFIRMED_COOKIE } from "../lib/auth-return";

const t = (o: Partial<Parameters<typeof returnTarget>[0]>) => returnTarget({ hasCode: false, exchanged: false, hasError: false, confirmation: false, next: null, ...o });

// ---------- Confirmation d'inscription (/auth/confirme) ----------
ok("lien valable, session ouverte : dans l'appli, avec le témoin de la bannière verte", JSON.stringify(t({ hasCode: true, exchanged: true, confirmation: true })) === JSON.stringify({ to: "/", flag: true }));
ok("lien valable mais session non ouverte (autre navigateur) : « adresse confirmée » sur la page de connexion", JSON.stringify(t({ hasCode: true, exchanged: false, confirmation: true })) === JSON.stringify({ to: "/login?confirme=1", flag: false }));
ok("lien expiré ou déjà utilisé (erreur renvoyée par Supabase) : message « lien expiré », jamais « confirmée »", t({ hasError: true, confirmation: true }).to === "/login?erreur=lien" && !t({ hasError: true, confirmation: true }).flag);
ok("ouverture sans code ni erreur : pas de faux « confirmée » (retour à la connexion avec le message de lien)", t({ confirmation: true }).to === "/login?erreur=lien" && !t({ confirmation: true }).flag);
ok("un code d'erreur sans code valable ne déclenche jamais le message vert", !t({ hasCode: false, hasError: true, confirmation: true }).to.includes("confirme"));

// ---------- Connexion par e-mail et mot de passe oublié (/auth/callback) : comportement d'avant ----------
ok("connexion par e-mail réussie : destination demandée, aucune bannière « confirmée »", JSON.stringify(t({ hasCode: true, exchanged: true, next: "/parametres" })) === JSON.stringify({ to: "/parametres", flag: false }));
ok("connexion par e-mail : code refusé = « lien expiré » (jamais « confirmée »)", t({ hasCode: true, exchanged: false }).to === "/login?erreur=lien");
ok("callback sans code : retour à la destination, comme avant", t({ next: "/parametres" }).to === "/parametres" && t({}).to === "/");
ok("callback avec erreur : « lien expiré »", t({ hasError: true }).to === "/login?erreur=lien");

// ---------- La destination reste un chemin de ce site ----------
ok("destination hostile ramenée à /", t({ hasCode: true, exchanged: true, next: "//evil.example", confirmation: true }).to === "/" && t({ hasCode: true, exchanged: true, next: "https://evil.example/x" }).to === "/");

// ---------- Câblage (les routes ne se testent pas directement) ----------
const read = (p: string) => readFileSync(p, "utf8");
ok("/auth/confirme et /auth/callback existent et partagent le même corps", /handleAuthReturn\(req, true\)/.test(read("app/auth/confirme/route.ts")) && /handleAuthReturn\(req, false\)/.test(read("app/auth/callback/route.ts")));
ok("l'inscription envoie vers /auth/confirme ; connexion par e-mail et mot de passe oublié restent sur /auth/callback", (() => {
  const f = read("components/login-form.tsx");
  return /signUp\([^)]*auth\/confirme/.test(f) && /signInWithOtp\([^)]*auth\/callback/.test(f) && /resetPasswordForEmail\([^)]*auth\/callback\?next=\/parametres/.test(f);
})());
ok("la porte (proxy.ts) laisse passer tout /auth sans connexion", /const PUBLIC = \[[^\]]*"\/auth"/.test(read("proxy.ts")));
ok("la bannière est montée dans la mise en page de l'appli connectée, et lit le même témoin que celui posé par la route", /<ConfirmedBanner \/>/.test(read("app/layout.tsx")) && read("components/confirmed-banner.tsx").includes("CONFIRMED_COOKIE") && read("lib/auth-callback.ts").includes("CONFIRMED_COOKIE") && CONFIRMED_COOKIE === "jp_confirme");
ok("le témoin ne contient aucun secret et expire vite", /res\.cookies\.set\(CONFIRMED_COOKIE, "1", \{ maxAge: 120/.test(read("lib/auth-callback.ts")));
ok("la page de connexion lit ?confirme=1 et le formulaire l'affiche en vert", /confirmed=\{sp\.confirme === "1"\}/.test(read("app/login/page.tsx")) && /confirmed \? \{ text: (?:tx\()?"Ton adresse est confirmée[^}]*done: true/.test(read("components/login-form.tsx")));
done();
