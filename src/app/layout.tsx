import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ErrorBoundary } from "@/components/error-boundary";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Taberna del Viejo Greg - RPG con IA",
  description: "Juego de rol por texto con inteligencia artificial como Dungeon Master. Crea tu personaje, explora mundos de fantasía y vive aventuras épicas.",
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.ico",
  },
  openGraph: {
    title: "Taberna del Viejo Greg - RPG con IA",
    description: "Juego de rol por texto con IA como Dungeon Master. Crea tu personaje y vive aventuras épicas.",
    type: "website",
    locale: "es_ES",
  },
  twitter: {
    card: "summary",
    title: "Taberna del Viejo Greg - RPG con IA",
    description: "Juego de rol por texto con IA como Dungeon Master.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f0e8" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1510" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
