import type { Metadata } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
  fallback: ["ui-sans-serif", "system-ui", "Segoe UI", "Roboto"],
});

export const metadata: Metadata = {
  title: {
    default: "Super Store Sales OS",
    template: "%s | Super Store Sales OS",
  },
  description: "Capacitación y asistencia comercial para el equipo de Super Store.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="es" className={`${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
