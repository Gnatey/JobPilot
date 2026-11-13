import type { Metadata, Viewport } from "next";
import "@fontsource-variable/bricolage-grotesque/wdth.css";
import "@fontsource-variable/instrument-sans/wght.css";
import "./globals.css";
import { Nav } from "@/components/nav";
import { Palette } from "@/components/palette";
import { FeedbackProvider } from "@/components/ui/feedback";
import { ConfirmedBanner } from "@/components/confirmed-banner";
import { THEME_BOOT } from "@/components/theme";
import { getUser } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/env";
import { isAdminEmail } from "@/lib/admin";
import { siteUrl } from "@/lib/site";
import { getLocale, getT } from "@/lib/i18n/server";
import { I18nProvider } from "@/components/i18n";

/** Adresse publique : sert à écrire en entier les liens de l'image de partage et de l'adresse canonique (Next exige une adresse absolue). */
const base = (() => { try { return new URL(siteUrl()); } catch { return undefined; } })();

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
  metadataBase: base,
  title: { default: "JobPilot", template: "%s · JobPilot" },
  description: t("Suivi de candidatures, CV sur mesure et analyse des offres"),
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/apple-icon.png" },
  robots: { index: false, follow: false },
  // Prouve à Google (Search Console) que ce site est à Juliana : requis pour valider l'écran d'autorisation Gmail. Public par nature, à ne pas retirer.
  verification: { google: "c2TVbnaQVNk1wfL4i07pcvqOMIfec8a_T-nD3diwk1I" },
  appleWebApp: { capable: true, title: "JobPilot", statusBarStyle: "black-translucent" },
  };
}
export const viewport: Viewport = {
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#111833" }, { media: "(prefers-color-scheme: dark)", color: "#090d1d" }],
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = supabaseConfigured() ? await getUser() : null;
  const locale = await getLocale();
  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body className="min-h-dvh">
        <I18nProvider locale={locale}>
        <FeedbackProvider>
          <a href="#contenu" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded-full focus:bg-marigold focus:px-4 focus:py-2 focus:font-semibold focus:text-chrome">Aller au contenu</a>
          {user ? (
            <div className="md:flex">
              <Nav admin={isAdminEmail(user.email)} />
              <main id="contenu" className="mx-auto w-full min-w-0 max-w-[90rem] px-4 pb-32 pt-6 md:px-8 md:pb-16 md:pt-8 xl:px-12"><ConfirmedBanner />{children}</main>
              <Palette />
            </div>
          ) : (
            <main id="contenu">{children}</main>
          )}
        </FeedbackProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
