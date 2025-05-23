import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { SupabaseProvider } from "./supabase-provider";
import Navbar from "@/components/layout/Navbar";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "InScribe AI",
  description: "Intelligent Document Analysis",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-gray-50`}> {/* body bg color */}
        <SupabaseProvider>
          <Navbar /> {/* Add Navbar here, above the main content */}
          <main className="container mx-auto px-4 py-8"> {/* Adjust padding in the future*/}
            {children}
          </main>
          {/* Possible global Footer component here as well */}
        </SupabaseProvider>
      </body>
    </html>
  );
}