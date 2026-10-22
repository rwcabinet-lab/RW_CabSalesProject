import type { Metadata } from "next";
import "./globals.css";
import { Navbar } from "@/components/layout/Navbar";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { ToastContainer } from "@/components/ui/ToastContainer";

export const metadata: Metadata = {
  title: "正道工業系統櫃事業部 - 業務時程追蹤系統",
  description: "正道工業系統櫃事業部 業務時程追蹤系統 (Next.js + Prisma)",
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
        <QueryProvider>
          <Navbar />
          <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
            {children}
          </main>
          <ToastContainer />
        </QueryProvider>
      </body>
    </html>
  );
}
