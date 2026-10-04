import type { Metadata } from 'next';
import { Bebas_Neue, Inter, Syne } from 'next/font/google';
import './globals.css';
import './protected.css';
import './transitions.css';
import { PageTransition } from '@/components/page-transition';
import './detective.css';
import { ServiceWorker } from '@/components/service-worker';
const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' });
const syne = Syne({ subsets: ['latin'], display: 'swap', variable: '--font-syne' });
const bebasNeue = Bebas_Neue({ subsets: ['latin'], weight: '400', display: 'swap', variable: '--font-bebas-neue' });
export const metadata: Metadata = {
  title: 'Tripwire — Before the money moves.',
  description: 'Consent-first protection against social engineering, suspicious callers, and risky payment requests.',
  icons: { icon: '/favicon.svg' },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={`${inter.variable} ${syne.variable} ${bebasNeue.variable}`}><body><PageTransition>{children}</PageTransition><ServiceWorker/></body></html>;
}
