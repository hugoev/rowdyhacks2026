import type { Metadata } from 'next';
import { Bebas_Neue, Inter, Syne } from 'next/font/google';
import './globals.css';
import './transitions.css';
import { PageTransition } from '@/components/page-transition';
import { ServiceWorker } from '@/components/service-worker';
const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' });
const syne = Syne({ subsets: ['latin'], display: 'swap', variable: '--font-syne' });
const bebasNeue = Bebas_Neue({ subsets: ['latin'], weight: '400', display: 'swap', variable: '--font-bebas-neue' });
export const metadata: Metadata = {
  title: 'Tripwire — the safety teller in your bank app',
  description: 'When a payment looks risky, Tripwire asks what it’s for and calls the person being impersonated before the money moves.',
  icons: { icon: '/favicon.svg' },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={`${inter.variable} ${syne.variable} ${bebasNeue.variable}`}><body><PageTransition>{children}</PageTransition><ServiceWorker/></body></html>;
}
