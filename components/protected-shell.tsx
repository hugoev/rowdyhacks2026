'use client';
import Link from 'next/link';
import { ArrowLeft, X } from 'lucide-react';
import { useTripwire } from './context';
import { Protected } from './protected';
import { DetectiveBoard } from './detective-board';

const taskConnections = [['check-call', 'send-money']] as const;

export function ProtectedShell({ student = false }: { student?: boolean }) {
  const { state, error, setError } = useTripwire();
  return <div className="app-shell simple-surface">
    <a className="skip-link" href="#main">Skip to main content</a>
    <div className="workspace">
      <header className="topbar">
        <div className="breadcrumb"><Link className="family-brand" href="/">tripwire<span>.</span></Link></div>
        <div className="topbar-right"><Link className="family-settings-link" href="/settings">Settings</Link></div>
      </header>
      <main id="main" className="main-content">
        <nav className="family-return" aria-label="Return navigation"><Link href="/" className="button secondary"><ArrowLeft size={22} aria-hidden="true"/>Back to command center</Link></nav>
        {error && <div role="alert" className="error-banner"><span>{error}</span><button className="icon-button" aria-label="Dismiss error" onClick={() => setError('')}><X size={18}/></button></div>}
        {state ? <DetectiveBoard variant="calm" connections={taskConnections}><Protected student={student}/></DetectiveBoard> : <div className="loading-state"><div className="brand-mark">T<span/></div><h1>Preparing your protection…</h1><p>Loading your family safety workspace.</p><button className="button secondary" onClick={() => window.location.reload()}>Try again</button></div>}
      </main>
    </div>
  </div>;
}
