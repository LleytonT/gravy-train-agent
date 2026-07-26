import type { Metadata } from "next";
import { IBM_Plex_Mono, Manrope, Syne } from "next/font/google";

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
    "Personal GTM opportunity agent for APAC tech sales — chat with dossiers, scores, and watchlist memory.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${syne.variable} ${manrope.variable} ${ibmPlexMono.variable}`}
    >
      <body
        style={
          {
            "--font-display": "var(--font-syne), ui-sans-serif, system-ui, sans-serif",
            "--font-body": "var(--font-manrope), ui-sans-serif, system-ui, sans-serif",
            "--font-mono":
              "var(--font-ibm-plex-mono), ui-monospace, monospace",
          } as React.CSSProperties
        }
      >
        {children}
      </body>
    </html>
  );
}
