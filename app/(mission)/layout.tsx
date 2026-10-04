import type { Metadata } from 'next';
import '../dashboard/base.css';
import '../dashboard/detective.css';
import '../dashboard/contrast.css';
import '../dashboard/mission.css';
import '../dashboard/dashboard.css';
export const metadata: Metadata = { title: 'Dashboard · Tripwire' };
export default function MissionLayout({ children }: { children: React.ReactNode }) { return children; }
