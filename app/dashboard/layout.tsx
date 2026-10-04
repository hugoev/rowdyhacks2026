import type { Metadata } from 'next';
// The detective-board styles load only under /dashboard, so Rosa's calm screens never get them.
import './base.css';
import './detective.css';
import './contrast.css';
import './mission.css';
import './dashboard.css';
export const metadata: Metadata = { title: 'Mission Control · Tripwire' };
export default function DashboardLayout({ children }: { children: React.ReactNode }) { return children; }
