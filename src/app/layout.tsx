import type { Metadata } from "next";
import "./globals.css";
import { Navbar } from "@/components/layout/Navbar";

export const metadata: Metadata = {
  title: "系統櫃工廠前段業務報價與案件時程追蹤系統",
  description: "Cabinet Factory Sales & Project Tracking System (Next.js + Prisma)",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-TW">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var c = localStorage.getItem('app_theme_color');
                var d = localStorage.getItem('app_theme_density');
                if (c && c !== 'blue') document.documentElement.classList.add('theme-' + c);
                if (d === 'compact') document.documentElement.classList.add('density-compact');
              } catch(e) {}
            `,
          }}
        />
      </head>
      <body className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </body>
    </html>
  );
}
