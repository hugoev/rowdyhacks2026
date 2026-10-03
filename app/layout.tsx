import type { Metadata } from 'next';
import { Inter, Syne } from 'next/font/google';
import './globals.css';
import './protected.css';
const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' });
const syne = Syne({ subsets: ['latin'], display: 'swap', variable: '--font-syne' });
export const metadata: Metadata = {
  title: 'Tripwire — Before the money moves.',
  description: 'Your family’s counter-heist crew. A consent-first scam defense demo built for RowdyHacks XII.',
  icons: { icon: '/favicon.svg' },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={`${inter.variable} ${syne.variable}`}><body>{children}</body></html>;
}
