import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Dhan WebSocket Live Market Data',
  description: 'Next.js app with global Dhan WebSocket connection',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

