import type { Metadata, Viewport } from "next";
import { Manrope, Inter } from "next/font/google";
import { createClient } from "@/lib/supabase/server";
import { AppNav } from "@/components/AppNav";
import { LanguageProvider } from "@/lib/i18n";
import { ToastProvider } from "@/lib/toast";
import { OfflineBanner } from "@/components/OfflineBanner";
import { SplashScreenHider } from "@/components/SplashScreenHider";
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
  appleWebApp: {
    title: "Uzuza",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#1a5f4a",
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
      <head>
        {/* Applies saved display preferences before paint, so there's no
            flash of the default text size/contrast on load. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{
              var s=localStorage.getItem('uzuza_text_size');
              var c=localStorage.getItem('uzuza_contrast');
              var t=localStorage.getItem('uzuza_theme');
              if(s==='large')document.documentElement.setAttribute('data-text-size','large');
              if(c==='high')document.documentElement.setAttribute('data-contrast','high');
              if(t==='dark')document.documentElement.setAttribute('data-theme','dark');
            }catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-paper text-foreground font-sans">
        <SplashScreenHider />
        <OfflineBanner />
        <LanguageProvider>
          <ToastProvider>
            {children}
            <AppNav signedIn={!!user} />
          </ToastProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
