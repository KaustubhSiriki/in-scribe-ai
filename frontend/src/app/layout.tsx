import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { SupabaseProvider } from "./supabase-provider";
import ThemeProvider from "@/components/ThemeProvider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "InScribe AI",
  description: "Intelligent Document Analysis",
  icons: {
    icon: "/favicon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.className}>
      <link rel="icon" href="/favicon.png" sizes="any" />
      <body>
        <SupabaseProvider>
          <ThemeProvider>{children}</ThemeProvider>
        </SupabaseProvider>
      </body>
    </html>
  );
}
