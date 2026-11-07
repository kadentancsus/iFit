import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "iFit",
    template: "%s · iFit",
  },
  description: "iFit: Making Every Workout Count. Log sets fast, swap busy equipment and check form.",
  applicationName: "iFit",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7f9" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0f14" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-3 focus:font-semibold"
        >
          Skip to content
        </a>
        <header className="sticky top-0 z-40 border-b border-border bg-surface/95 backdrop-blur">
          <div className="mx-auto flex h-14 w-full max-w-2xl items-center justify-between px-4">
            <Link
              href="/"
              className="flex min-h-11 items-center text-lg font-bold tracking-tight text-brand"
            >
              iFit
            </Link>
          </div>
        </header>
        <main id="main" className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-6">
          {children}
        </main>
      </body>
    </html>
  );
}
