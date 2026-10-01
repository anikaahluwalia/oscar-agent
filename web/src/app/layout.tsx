import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import { OscarChatDrawer } from "@/components/oscar-chat-drawer";
import { Sidebar } from "@/components/sidebar";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WhyDrawer } from "@/components/why-drawer";
import "./globals.css";

const inter = Inter({ variable: "--font-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Oscar",
  description: "Oscar looks after your inbox, and comes to get you when something needs you.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: next-themes sets the theme class before React loads.
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <ThemeProvider>
          <TooltipProvider>
            <div className="flex flex-1 flex-col md:flex-row">
              <Sidebar />
              <div className="flex min-w-0 flex-1 flex-col">{children}</div>
            </div>
            <WhyDrawer />
            <OscarChatDrawer />
          </TooltipProvider>
          <Toaster position="bottom-center" />
        </ThemeProvider>
      </body>
    </html>
  );
}
