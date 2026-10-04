import type { Metadata } from 'next';
import { Operator } from '@/components/operator';
export const metadata: Metadata = { title: 'Operator · Tripwire', robots: { index: false } };
export default function Page() { return <Operator/>; }
