import type { Metadata, Viewport } from "next";
import { PwaRegistration } from "./pwa-registration";
import "./globals.css";

export const metadata: Metadata = {
  title: "MSTV Production OS",
  description: "Production planning OS for Mon Studio TV.",
  applicationName: "MSTV Production OS",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "MSTV",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/mstv-icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/mstv-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#bb2720",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body className="bg-[var(--app-background)] text-neutral-950 antialiased">
        <PwaRegistration />
        {children}
      </body>
    </html>
  );
}
