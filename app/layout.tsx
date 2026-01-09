import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ダブルスメーカー",
  description: "ダブルスの組み合わせ作成アプリ",
  manifest: '/manifest.json',
  icons: {
    icon: '/icon-192.png',
    apple: '/apple-touch-icon.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
