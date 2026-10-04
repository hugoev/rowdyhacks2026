import type { Metadata } from 'next';
import { PhoneCall } from '@/components/phone-call';
export const metadata: Metadata = { title: 'Phone · Tripwire', robots: { index: false } };
export default async function Page({ searchParams }: { searchParams: Promise<{ who?: string }> }) {
  const { who } = await searchParams;
  return <PhoneCall key={who} who={who === 'diego' ? 'diego' : 'rosa'}/>;
}
