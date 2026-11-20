import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "katex/dist/katex.min.css";
import "./globals.css";
import { SystemRibbon } from "@/components/SystemRibbon";
import { getSystemRibbon } from "@/lib/system-ribbon";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Nkanyezi LMS — a flexible multi-tenant LMS for every subject",
    template: "%s · Nkanyezi LMS",
  },
  description:
    "A multi-tenant learning platform for schools, tutoring groups and independent teachers. Courses, lessons, assessments, grading, analytics and secure materials — with rich content support including math and LaTeX.",
  keywords: ["LMS", "learning management system", "courses", "assessments", "grading", "multi-tenant", "SaaS", "math", "LaTeX"],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const systemRibbon = await getSystemRibbon();
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <SystemRibbon ribbon={systemRibbon} />
        {children}
      </body>
    </html>
  );
}
