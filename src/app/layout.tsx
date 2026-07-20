import type { Metadata } from "next";
import "./globals.css";
import { AdminViewProvider } from "@/components/admin-view-provider";
import { Toaster } from "@/components/ui/sonner";
import Sidebar from "@/components/Sidebar";
import AuthGuard from "@/components/AuthGuard";
import { ThemeProvider } from "@/components/ThemeProvider";

export const metadata: Metadata = {
  title: "MDP Tracker",
  description: "Internal project cost tracking for Mecca Design & Production",
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
    shortcut: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <ThemeProvider>
          <AuthGuard>
            <AdminViewProvider>
              <div className="flex min-h-screen min-w-0 bg-background">
                <Sidebar />
                <main className="min-w-0 flex-1 overflow-auto">
                  <div className="mx-auto min-w-0 max-w-[1800px] px-6 py-6 xl:px-8">
                    {children}
                  </div>
                </main>
              </div>
            </AdminViewProvider>
          </AuthGuard>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
