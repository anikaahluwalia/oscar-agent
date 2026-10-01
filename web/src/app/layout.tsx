import type { Metadata } from "next";
import { Figtree, Inter, Geist_Mono } from "next/font/google";
import { Sidebar } from "@/components/sidebar";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const inter = Inter({ variable: "--font-sans", subsets: ["latin"] });
const figtree = Figtree({ variable: "--font-figtree", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Oscar",
  description: "Oscar looks after your inbox, and comes to get you when something needs you.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: next-themes sets the theme class before React loads.
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${figtree.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          <TooltipProvider>
            <div className="flex flex-1">
              <Sidebar />
              {/* Room at the bottom on phones for the menu bar. */}
              <div className="flex min-w-0 flex-1 flex-col pb-20 md:pb-0">{children}</div>
            </div>
          </TooltipProvider>
          {/* At the top, so it never covers the menu bar on phones or the chat box. */}
          <Toaster position="top-center" />
        </ThemeProvider>
      </body>
    </html>
  );
}
