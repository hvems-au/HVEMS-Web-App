import type { Metadata, Viewport } from "next";
import "@fontsource-variable/montserrat";
import "./globals.css";
import { Providers } from "@/components/providers";
import { NavProgress } from "@/components/shell/nav-progress";

export const metadata: Metadata = {
  title: { default: "HVEMS", template: "%s · HVEMS" },
  description: "Heavy Vehicle & Equipment Management System",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#444444",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU">
      <body className="antialiased">
        <NavProgress />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
