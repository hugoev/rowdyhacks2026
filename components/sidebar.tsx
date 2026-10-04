'use client';
import Link from 'next/link';
import { FolderOpen, LayoutDashboard, MonitorPlay, Settings, Smartphone, ShieldCheck, Users } from 'lucide-react';
import { Wordmark } from './wordmark';
import { BrandMark } from './brand-mark';
import type { View } from './tripwire';

export function Sidebar({ view, menu, urgent, onClose }: { view: View; menu: boolean; urgent: number; onClose: () => void }) {
  return <>
    {menu && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => onClose()}/>}
    <aside className={'sidebar ' + (menu ? 'open' : '')}>
      <Link onClick={onClose} className="brand" href="/"><BrandMark/><span className="brand-name"><Wordmark/></span><small>BEFORE THE MONEY MOVES</small></Link>
      <div className="sidebar-family"><div className="avatar rosa">R</div><div><strong>The Garcia family</strong><small>Protected household</small></div><ShieldCheck size={17}/></div>
      <div className="nav-label">CASEBOARD</div>
      <nav aria-label="Main navigation">
        {([{ id: 'guardian', label: 'Mission Control', icon: LayoutDashboard }, { id: 'protected', label: 'Rosa’s phone', icon: Smartphone }, { id: 'cases', label: 'Case files', icon: FolderOpen }, { id: 'stage', label: 'Stage view', icon: MonitorPlay }] as const).map(item => <Link onClick={onClose} key={item.id} href={'/' + item.id} className={view === item.id ? 'nav-item active' : 'nav-item'} aria-current={view === item.id ? 'page' : undefined}><item.icon size={19} strokeWidth={1.6}/><span className="tape-label">{item.label}</span>{item.id === 'guardian' && urgent > 0 && <span className="nav-count">{urgent}</span>}</Link>)}
      </nav>
      <div className="nav-label second">THE CREW</div><nav aria-label="Family navigation"><Link onClick={onClose} href="/relative" className={'nav-item ' + (view === 'relative' ? 'active' : '')}><Users size={19}/><span className="tape-label">Diego’s phone</span></Link><Link onClick={onClose} href="/settings" className={'nav-item ' + (view === 'settings' ? 'active' : '')}><Settings size={19}/><span className="tape-label">Family settings</span></Link></nav>
      <div className="sidebar-bottom"><div className="crew-note"><span className="mini-cross">+</span><p>Every scam is a heist.<br/><strong>You have a crew.</strong></p></div><div className="sidebar-user"><div className="avatar alex">{view === 'protected' || view === 'settings' ? 'R' : 'D'}</div><div><strong>{view === 'protected' || view === 'settings' ? 'Rosa Garcia' : 'Diego Garcia'}</strong><small>{view === 'protected' || view === 'settings' ? 'Protected family member' : 'Trusted contact · grandson'}</small></div></div></div>
    </aside>
  </>;
}
