import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Stellaview — System Intelligence',
  description: 'A standalone desktop dashboard for everything happening on your system.',
  icons: {
    icon: '/logo.png',
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
