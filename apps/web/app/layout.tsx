import type { Metadata, Viewport } from "next";
import "@fontsource-variable/montserrat";
import "./globals.css";
import { Providers } from "@/components/providers";
import { NavProgress } from "@/components/shell/nav-progress";
import { THEME_SCRIPT } from "@/components/theme/theme";

export const metadata: Metadata = {
  title: { default: "HVEMS", template: "%s · HVEMS" },
  description: "Heavy Vehicle & Equipment Management System",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f5f6" },
    { media: "(prefers-color-scheme: dark)", color: "#141518" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // data-theme is set by THEME_SCRIPT before React hydrates, hence suppressHydrationWarning on <html> only.
    <html lang="en-AU" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="antialiased">
        <NavProgress />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
