"use client";

import React from "react";
import { Button } from "@/components/ui/Button";

export default function HomePage() {
  return (
    <main className="relative flex flex-col items-center justify-center min-h-screen overflow-hidden text-text-primary dark:text-text-primary">
      <div className="relative z-10 max-w-3xl px-6 text-center space-y-6">
        <span className="inline-block bg-accent-primary/10 text-accent-primary px-3 py-1 rounded-full font-medium">
          ✨ AI-Powered Document Analysis
        </span>

        <h1 className="text-5xl sm:text-6xl font-bold tracking-tight text-text-primary dark:text-text-primary drop-shadow-lg">
          Transform PDFs into Interactive Knowledge
        </h1>

        <p className="text-lg sm:text-xl text-text-secondary dark:text-text-secondary leading-relaxed">
          Upload your documents and let AI do the heavy lifting—summaries,
          Q&amp;A, insights—all in one sleek interface.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <a href="/dashboard">
            <Button> Get Started </Button>
          </a>
          <a
            href="/dashboard"
            className="inline-block px-8 py-4 rounded-lg font-semibold text-accent-primary hover:text-accent-secondary transition text-lg"
          >
            View Demo →
          </a>
        </div>
      </div>

      {/* Light & Dark gradients, on lowest layer */}
      <div
        className="absolute inset-0 z-0 pointer-events-none"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(circle at 60% 42%, var(--gradient-hero-start, #eceafe) 0%, var(--gradient-hero-end, #f8f9fb) 100%)",
        }}
      />
      <div
        className="absolute inset-0 z-0 pointer-events-none dark:block hidden"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(circle at 60% 42%, var(--gradient-hero-start-dark, #2c256f) 0%, var(--gradient-hero-end-dark, #10111a) 100%)",
        }}
      />
    </main>
  );
}
