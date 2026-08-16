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
      <body className="app-body">
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <Header />
        {children}
      </body>
    </html>
  );
}
