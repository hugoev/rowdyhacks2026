'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Sidebar } from './sidebar';
import { Wordmark } from './wordmark';
import { BrandMark } from './brand-mark';
import { ArrowLeft, Menu, X } from 'lucide-react';
import { useTripwire } from './context';
import { Protected } from './protected';
import { DetectiveBoard } from './detective-board';

const taskConnections = [['check-call', 'send-money']] as const;

export function ProtectedShell() {
  const { state, error, setError } = useTripwire();
  const [menu, setMenu] = useState(false);
  const urgent = state?.payments.filter(payment => payment.status === 'held').length || 0;
  return <div className="app-shell simple-surface">
    <a className="skip-link" href="#main">Skip to main content</a>
    <Sidebar view="protected" menu={menu} urgent={urgent} onClose={() => setMenu(false)}/>
    <div className="workspace">
      <header className="topbar">
        <div className="breadcrumb"><button className="icon-button mobile-menu" aria-label="Open navigation" aria-expanded={menu} onClick={() => setMenu(!menu)}><Menu size={22}/></button><Link className="family-brand" href="/"><Wordmark/></Link></div>
        <div className="topbar-right"><Link className="family-settings-link" href="/settings">Settings</Link></div>
      </header>
      <main id="main" className="main-content">
        <nav className="family-return" aria-label="Return navigation"><Link href="/" className="button secondary"><ArrowLeft size={22} aria-hidden="true"/>Back to command center</Link></nav>
        {error && <div role="alert" className="error-banner"><span>{error}</span><button className="icon-button" aria-label="Dismiss error" onClick={() => setError('')}><X size={18}/></button></div>}
        {state ? <DetectiveBoard variant="calm" connections={taskConnections}><Protected/></DetectiveBoard> : <div className="loading-state"><BrandMark/><h1>Preparing your protection…</h1><p>Loading your family safety workspace.</p><button className="button secondary" onClick={() => window.location.reload()}>Try again</button></div>}
      </main>
    </div>
  </div>;
}
