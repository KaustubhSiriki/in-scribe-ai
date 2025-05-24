import type { Config } from "tailwindcss";
const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "var(--color-background)",
        surface: "var(--color-surface)",
        "surface-alt": "var(--color-surface-alt)",
        "text-primary": "var(--color-text-primary)",
        "text-secondary": "var(--color-text-secondary)",
        "accent-primary": "var(--color-accent-primary)",
        "accent-secondary": "var(--color-accent-secondary)",
        success: "var(--color-success)",
        error: "var(--color-error)",
      },
      backgroundImage: {
        "hero-gradient": "var(--gradient-hero)",
        "surface-gradient": "var(--gradient-surface)",
      },
      boxShadow: {
        "elevated": "0 6px 40px 0 rgba(40,30,100,0.16)",
      },
      borderRadius: {
        "3xl": "1.5rem",
      },
    },
  },
  plugins: [],
};
export default config;
