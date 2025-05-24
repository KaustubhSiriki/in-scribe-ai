"use client";
import React from "react";
import { useDarkMode } from "@/hooks/useDarkMode";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";

export default function ThemeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isDark, setIsDark] = useDarkMode();
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar isDark={isDark} toggleDark={() => setIsDark((d) => !d)} />
      <main className="flex-1 h-fit bg-background text-text-primary transition-colors duration-200">
        {children}
      </main>
      <Footer />
    </div>
  );
}
