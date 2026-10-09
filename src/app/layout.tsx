import type { Metadata } from "next";
import { Fraunces, Outfit } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Cartaz — Programação",
  description:
    "Calendário das sessões do CineSesc, da Cinemateca, do Cine Belas Artes, do Espaço Petrobras, do CINUSP, da Sala São Paulo, do Theatro Municipal, do Teatro Baccarelli e do Theatro São Pedro.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={`${outfit.variable} ${fraunces.variable} antialiased`}>
        <Script id="cartaz-theme" strategy="beforeInteractive">
          {`try{var t=localStorage.getItem("cartaz-theme");if(t!=="light"&&t!=="dark"){t=matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"}document.documentElement.dataset.theme=t}catch(e){}`}
        </Script>
        {children}
      </body>
    </html>
  );
}
