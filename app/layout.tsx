import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mon Studio TV",
  description: "Prototype premium de préparation de productions live.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body className="min-h-screen bg-[#f7f9fb] text-stone-950 antialiased">{children}</body>
    </html>
  );
}
