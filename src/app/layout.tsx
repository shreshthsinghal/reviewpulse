import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/reviewpulse/theme-provider";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "ReviewPulse — Weekly app review pulse, in one scannable page",
  description:
    "ReviewPulse turns recent App Store + Play Store reviews into a scannable weekly one-page note: top themes, real user quotes, and action ideas.",
  keywords: [
    "app reviews",
    "product analytics",
    "weekly pulse",
    "ReviewPulse",
    "Groww",
    "Play Store",
    "App Store",
    "LLM",
    "prompting",
    "AI workflow",
  ],
  authors: [{ name: "ReviewPulse" }],
  icons: {
    icon: "/logo.svg",
  },
  openGraph: {
    title: "ReviewPulse — weekly app review pulse",
    description:
      "Import → Group → Generate Note → Draft Email. One scannable page per week, zero PII.",
    siteName: "ReviewPulse",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "ReviewPulse",
    description: "Weekly app review pulse, in one scannable page.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} antialiased bg-background text-foreground font-sans`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
