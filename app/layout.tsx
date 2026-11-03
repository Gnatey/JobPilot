import type { Metadata, Viewport } from "next";
import "@fontsource-variable/bricolage-grotesque/wdth.css";
import "@fontsource-variable/instrument-sans/wght.css";
import "./globals.css";
import { Nav } from "@/components/nav";
import { Palette } from "@/components/palette";
import { FeedbackProvider } from "@/components/ui/feedback";
import { THEME_BOOT } from "@/components/theme";
import { getUser } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/env";
import { isAdminEmail } from "@/lib/admin";

export const metadata: Metadata = {
  title: { default: "JobPilot", template: "%s · JobPilot" },
  description: "Suivi de candidatures, CV sur mesure et analyse des offres",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/apple-icon.png" },
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "JobPilot", statusBarStyle: "black-translucent" },
};
export const viewport: Viewport = {
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#111833" }, { media: "(prefers-color-scheme: dark)", color: "#090d1d" }],
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = supabaseConfigured() ? await getUser() : null;
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body className="min-h-dvh">
        <FeedbackProvider>
          <a href="#contenu" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded-full focus:bg-marigold focus:px-4 focus:py-2 focus:font-semibold focus:text-chrome">Aller au contenu</a>
          {user ? (
            <div className="md:flex">
              <Nav admin={isAdminEmail(user.email)} />
              <main id="contenu" className="mx-auto w-full min-w-0 max-w-[90rem] px-4 pb-32 pt-6 md:px-8 md:pb-16 md:pt-8 xl:px-12">{children}</main>
              <Palette />
            </div>
          ) : (
            <main id="contenu">{children}</main>
          )}
        </FeedbackProvider>
      </body>
    </html>
  );
}
