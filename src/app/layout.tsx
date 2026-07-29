import type { Metadata } from "next";
import "./globals.css";

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
      <body>
        {children}
      </body>
    </html>
  );
}
