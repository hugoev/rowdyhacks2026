import type { Metadata } from 'next';
import './globals.css';
import './protected.css';
export const metadata: Metadata = {
  title: 'Tripwire — Before the money moves.',
  description: 'Your family’s counter-heist crew. A consent-first scam defense demo built for RowdyHacks XII.',
  icons: { icon: '/favicon.svg' },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
