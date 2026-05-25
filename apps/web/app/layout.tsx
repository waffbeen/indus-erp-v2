import "./globals.css";
import type { Metadata } from "next";
import { Toaster } from "@/components/Toaster";
import { NavProgress } from "@/components/NavProgress";

export const metadata: Metadata = {
  title: "Indus ERP",
  description: "AI-powered procurement & inventory SaaS",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <NavProgress />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
