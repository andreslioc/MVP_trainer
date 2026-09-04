import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Jost, Roboto } from "next/font/google";
import type { ReactNode } from "react";

import { THEME_COOKIE, parseTheme, themeAttribute } from "../lib/theme.ts";
import "./globals.css";

/**
 * Las dos familias del manual de marca.
 *
 * Roboto es la secundaria y lleva el cuerpo y la interfaz. La primaria es
 * Metropolis, que no esta en Google Fonts: hasta tener la licenciada se sirve
 * Jost, la geometrica mas cercana, y `--font-display` nombra a Metropolis
 * primero para que entre sola el dia que se cargue.
 */
const roboto = Roboto({
  variable: "--font-roboto",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
  fallback: ["ui-sans-serif", "system-ui", "Segoe UI"],
});

const jost = Jost({
  variable: "--font-jost",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  fallback: ["Century Gothic", "Avenir Next", "ui-sans-serif"],
});

export const metadata: Metadata = {
  title: {
    default: "Super Store Sales OS",
    template: "%s | Super Store Sales OS",
  },
  description: "Capacitación y asistencia comercial para el equipo de Super Store.",
};

/**
 * El tema se resuelve EN EL SERVIDOR, desde la cookie.
 *
 * Es la unica forma de que no haya un destello de claro antes de pintar oscuro:
 * si el atributo lo pusiera un efecto del navegador, el primer frame ya se
 * habria pintado con la paleta equivocada. Cuando la cookie dice "sistema" no se
 * estampa nada y manda `prefers-color-scheme`, que no necesita servidor.
 */
export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <html
      lang="es"
      className={`${roboto.variable} ${jost.variable} h-full antialiased`}
      data-theme={themeAttribute(theme)}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
