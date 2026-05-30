import "./globals.css";
import type { Metadata } from "next";
import { Inter, Fraunces, JetBrains_Mono } from "next/font/google";
import { Toaster } from "@/components/Toaster";
import { NavProgress } from "@/components/NavProgress";
import { Warmup } from "@/components/Warmup";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const fraunces = Fraunces({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-fraunces", display: "swap" });
const jbmono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jbmono", display: "swap" });

export const metadata: Metadata = {
  title: "Prathvi's ERP",
  description: "AI-powered procurement & inventory SaaS",
};

/**
 * Applies the saved appearance (mode / accent / layout) to <html> BEFORE first
 * paint, so there's no flash of the wrong theme. Defaults: light / emerald /
 * editorial. The Settings → Appearance panel writes `indus.appearance`.
 */
const APPEARANCE_SCRIPT = `(function(){try{var a=JSON.parse(localStorage.getItem('indus.appearance')||'{}');var d=document.documentElement;d.setAttribute('data-mode',a.mode==='dark'?'dark':'light');d.setAttribute('data-accent',['emerald','plum','clay','ink'].indexOf(a.accent)>=0?a.accent:'emerald');d.setAttribute('data-layout',['editorial','floating','topnav'].indexOf(a.layout)>=0?a.layout:'editorial');}catch(e){var d=document.documentElement;d.setAttribute('data-mode','light');d.setAttribute('data-accent','emerald');d.setAttribute('data-layout','editorial');}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${fraunces.variable} ${jbmono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: APPEARANCE_SCRIPT }} />
      </head>
      <body>
        <Warmup />
        <NavProgress />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
