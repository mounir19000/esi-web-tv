import type { Metadata } from "next";
import "./globals.css";
import Header from "@/components/Header";

export const metadata: Metadata = {
  title: "ESI Web TV",
  description: "Official Web TV and Live Streaming Platform for École nationale Supérieure d'Informatique (ESI).",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="flex flex-col min-h-screen">
        <Header />
        <main className="flex-1 w-full">{children}</main>
      </body>
    </html>
  );
}
