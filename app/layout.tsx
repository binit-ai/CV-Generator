import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tailored CV Generator",
  description: "Generate a tailored CV PDF for any job description using Claude.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">
        <div className="min-h-screen flex flex-col">
          <header className="border-b border-slate-200 bg-white">
            <div className="mx-auto max-w-5xl px-4 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-xl bg-primary-600 text-white flex items-center justify-center text-sm font-bold">
                  CV
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    Tailored CV Generator
                  </p>
                  <p className="text-xs text-slate-500">
                    Powered by Claude and LaTeX
                  </p>
                </div>
              </div>
            </div>
          </header>
          <main className="flex-1">
            <div className="mx-auto max-w-5xl px-4 py-8">{children}</div>
          </main>
          <footer className="border-t border-slate-200 bg-white">
            <div className="mx-auto max-w-5xl px-4 py-4 text-xs text-slate-400 flex justify-between">
              <span>CV Generator</span>
              <span>PDFs compiled locally via LaTeX</span>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
