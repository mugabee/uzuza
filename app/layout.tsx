import type { Metadata } from "next";
import { Manrope, Inter } from "next/font/google";
import { createClient } from "@/lib/supabase/server";
import { AppNav } from "@/components/AppNav";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Uzuza",
  description: "Digital platform for ibimina and event contributions",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <html
      lang="en"
      className={`${manrope.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-paper text-foreground font-sans">
        <AppNav signedIn={!!user} />
        {children}
      </body>
    </html>
  );
}
