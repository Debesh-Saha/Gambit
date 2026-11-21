import type { Metadata } from 'next';
import "./global.css";
import Providers from '@/components/Providers';

export const metadata: Metadata = {
  title: 'Gambit',
  description: 'Multiplayer chess',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-neutral-900 text-white antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}