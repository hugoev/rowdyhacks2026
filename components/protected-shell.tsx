'use client';
import { X } from 'lucide-react';
import { useTripwire } from './context';
import { Protected } from './protected';
import { Badge } from './ui';

export function ProtectedShell() {
  const { state, error, setError, online } = useTripwire();
  return <div className="app-shell simple-surface">
    <a className="skip-link" href="#main">Skip to main content</a>
    <div className="workspace">
      <header className="topbar">
        <div className="breadcrumb"><a className="family-brand" href="/">tripwire<span>.</span></a></div>
        <div className="topbar-right"><a className="family-settings-link" href="/settings">Settings</a><span className={'connection ' + (online ? 'connected' : '')}><i/>{online ? 'Live connection' : 'Connecting…'}</span><Badge tone="outline">{state?.config.demo !== false ? 'DEMO MODE' : 'PAIRED MODE'}</Badge></div>
      </header>
      <main id="main" className="main-content">
        {error && <div role="alert" className="error-banner"><span>{error}</span><button className="icon-button" aria-label="Dismiss error" onClick={() => setError('')}><X size={18}/></button></div>}
        {state ? <Protected/> : <div className="loading-state"><div className="brand-mark">T<span/></div><h1>Connecting your crew…</h1><p>Preparing the family shield.</p><button className="button secondary" onClick={() => window.location.reload()}>Retry connection</button></div>}
      </main>
    </div>
  </div>;
}
