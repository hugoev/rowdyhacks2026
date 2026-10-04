import type { Metadata } from 'next';
import { DemoStage } from '@/components/demo-stage';
export const metadata: Metadata = { title: 'Tripwire · live demo' };
export default function Page() { return <DemoStage/>; }
