import './globals.css';
import Link from 'next/link';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="border-b bg-white">
          <div className="container py-4 flex items-center gap-6">
            <div className="text-xl font-bold">Deadlines.ai — Demo</div>
            <nav className="flex gap-4 text-sm">
              <Link href="/ets" className="hover:underline">Evidence Tasks</Link>
              <Link href="/controls" className="hover:underline">Controls</Link>
                            <a href="/batch" className="hover:underline">Batch</a>
              </nav>
          </div>
        </header>
        <main className="container py-8">{children}</main>
      </body>
    </html>
  );
}
