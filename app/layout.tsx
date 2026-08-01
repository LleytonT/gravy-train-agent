import type { Metadata } from "next";
import { IBM_Plex_Mono, Manrope, Syne } from "next/font/google";

import { Providers } from "@/components/providers";
import { cn } from "@/lib/utils";

import "./globals.css";

const syne = Syne({
  subsets: ["latin"],
  variable: "--font-syne",
  display: "swap",
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-ibm-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Gravy Scout",
  description:
    "Personal GTM opportunity agent for APAC tech sales — LinkedIn role matching, gravy-train seats, and who to reach out to.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn(syne.variable, manrope.variable, ibmPlexMono.variable, "font-sans")}
    >
      <body
        style={
          {
            "--font-display": "var(--font-syne), ui-sans-serif, system-ui, sans-serif",
            "--font-body": "var(--font-manrope), ui-sans-serif, system-ui, sans-serif",
            "--font-mono":
              "var(--font-ibm-plex-mono), ui-monospace, monospace",
            "--font-sans": "var(--font-manrope), ui-sans-serif, system-ui, sans-serif",
          } as React.CSSProperties
        }
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
