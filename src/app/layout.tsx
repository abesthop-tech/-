import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '家族献立 (kazoku-kondate)',
  description: '家庭向け献立・買い物・調理工程アシスタント',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="min-h-screen pb-16 relative overflow-x-hidden antialiased">
        {children}
      </body>
    </html>
  );
}
