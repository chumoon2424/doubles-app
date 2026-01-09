import type { Metadata } from "next";
import "./globals.css";

export const metadata = {
  title: 'D.M.(beta)',
  description: 'Doubles Matchmaker',
  manifest: '/manifest.json',
  themeColor: '#1e3a8a', 
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'D.M.(beta)',
  },
  icons: {
    icon: '/icon-192.png',
    apple: '/icon-192.png',
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
