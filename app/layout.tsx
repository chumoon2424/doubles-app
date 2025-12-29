import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ダブルスメーカー",
  description: "試合組み合わせ作成アプリ",
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
