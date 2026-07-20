import type { Metadata } from "next";
import "./globals.css";
import { AdminViewProvider } from "@/components/admin-view-provider";
import { Toaster } from "@/components/ui/sonner";
import AppShell from "@/components/AppShell";
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
              <AppShell>{children}</AppShell>
            </AdminViewProvider>
          </AuthGuard>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
