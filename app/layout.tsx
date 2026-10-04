import type { Metadata } from 'next';
import { Inter, Syne } from 'next/font/google';
import './globals.css';
import './protected.css';
import './transitions.css';
import { PageTransition } from '@/components/page-transition';
import { ServiceWorker } from '@/components/service-worker';
const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' });
const syne = Syne({ subsets: ['latin'], display: 'swap', variable: '--font-syne' });
export const metadata: Metadata = {
  title: 'Tripwire — Before the money moves.',
  description: 'Your family’s counter-heist crew. A consent-first scam defense demo built for RowdyHacks XII.',
  icons: { icon: '/favicon.svg' },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={`${inter.variable} ${syne.variable}`}><body><PageTransition>{children}</PageTransition><ServiceWorker/></body></html>;
}
