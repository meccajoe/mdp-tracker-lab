import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import Link from "next/link";

export const metadata: Metadata = {
  title: "MDP Project Tracker",
  description: "Internal project cost tracking for Mecca Design & Production",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <div className="min-h-screen bg-gray-50">
          <nav className="bg-white border-b border-gray-200">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex justify-between h-14 items-center">
                <div className="flex items-center gap-8">
                  <Link href="/" className="text-lg font-bold text-gray-900">
                    MDP Tracker
                  </Link>
                  <div className="flex items-center gap-4">
                    <Link
                      href="/"
                      className="text-sm text-gray-600 hover:text-gray-900"
                    >
                      Dashboard
                    </Link>
                    <Link
                      href="/projects"
                      className="text-sm text-gray-600 hover:text-gray-900"
                    >
                      Projects
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </nav>
          <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            {children}
          </main>
        </div>
        <Toaster />
      </body>
    </html>
  );
}
