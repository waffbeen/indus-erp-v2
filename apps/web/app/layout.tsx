import "./globals.css";
import type { Metadata } from "next";
import { Toaster } from "@/components/Toaster";
import { NavProgress } from "@/components/NavProgress";
import { Warmup } from "@/components/Warmup";

export const metadata: Metadata = {
  title: "Prathvi's ERP",
  description: "AI-powered procurement & inventory SaaS",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Warmup />
        <NavProgress />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
