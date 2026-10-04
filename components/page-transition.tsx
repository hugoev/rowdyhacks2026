'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

const calmRoutes = new Set(['/protected', '/student', '/relative', '/settings']);
const vaultRoutes = new Set(['/', '/guardian', '/inspector', '/cases', '/drill', '/weather']);
const canonical = (path: string) => path === '/guardian' ? '/' : path;

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const previous = useRef(pathname);
  const [transition, setTransition] = useState<{ path: string; kind: 'vault' | 'calm' } | null>(null);

  useLayoutEffect(() => {
    const from = previous.current;
    previous.current = pathname;
    setTransition(null);
    if (canonical(from) === canonical(pathname) || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const known = (route: string) => calmRoutes.has(route) || vaultRoutes.has(route);
    if (!known(from) || !known(pathname)) return;
    const kind = calmRoutes.has(from) || calmRoutes.has(pathname) ? 'calm' : 'vault';
    setTransition({ path: pathname, kind });
    // A missing animationend event must never leave the decoration on screen.
    const timeout = setTimeout(() => setTransition(null), kind === 'vault' ? 1100 : 200);
    return () => clearTimeout(timeout);
  }, [pathname]);

  return <>
    <div className={transition?.kind === 'calm' ? 'route-content route-content-calm' : 'route-content'}>{children}</div>
    {transition?.kind === 'vault' && <div key={transition.path} className="vault-transition" aria-hidden="true" onAnimationEnd={event => {
      if (event.animationName === 'vault-door-left') setTransition(null);
    }}>
      <div className="vault-door vault-door-left">
        <div className="vault-door-inset"/>
        <div className="vault-bolts"><i/><i/><i/></div>
        <div className="vault-wheel-mount">
          <svg className="vault-dial" viewBox="0 0 240 240" fill="none">
            <circle cx="120" cy="120" r="113"/><circle cx="120" cy="120" r="101"/>
            {Array.from({ length: 40 }, (_, index) => <path key={index} d={`M120 13v${index % 5 === 0 ? 12 : 5}`} transform={`rotate(${index * 9} 120 120)`}/>)}
          </svg>
          <svg className="vault-wheel" viewBox="0 0 240 240" fill="none">
            <circle className="vault-wheel-rim" cx="120" cy="120" r="77"/>
            {[0, 60, 120, 180, 240, 300].map(angle => <path className="vault-spoke" key={angle} d="M120 120V43" transform={`rotate(${angle} 120 120)`}/>)}
            <circle className="vault-hub" cx="120" cy="120" r="24"/>
            <path className="vault-hub-slot" d="M113 120h14"/>
          </svg>
        </div>
      </div>
      <div className="vault-door vault-door-right"><div className="vault-door-inset"/></div>
    </div>}
  </>;
}
