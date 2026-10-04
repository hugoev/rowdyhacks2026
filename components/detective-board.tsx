'use client';

import { createPortal } from 'react-dom';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

export type BoardConnection = readonly [from: string, to: string];
export type BoardSpotlight = { targets: readonly string[] };
type Anchor = { id: string; x: number; y: number; width: number; height: number };
type LightInput = 'pointer' | 'keyboard' | 'idle';
const noConnections: readonly BoardConnection[] = [];

/** Decorations are independent of application state and never intercept input. */
export function DetectiveBoard({ children, variant = 'standard', connections = noConnections, spotlight }: {
  children: ReactNode;
  variant?: 'standard' | 'calm';
  connections?: readonly BoardConnection[];
  spotlight?: BoardSpotlight;
}) {
  const root = useRef<HTMLDivElement>(null);
  const lamp = useRef<HTMLDivElement>(null);
  const bulb = useRef<SVGPathElement>(null);
  const head = useRef<SVGGElement>(null);
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
  useEffect(() => setPortalHost(document.body), []);
  const beam = useRef<SVGPolygonElement>(null);
  const pool = useRef<SVGEllipseElement>(null);
  const [geometry, setGeometry] = useState<{ width: number; height: number; anchors: Anchor[] }>({ width: 1, height: 1, anchors: [] });
  const gradientId = `board-light-${useId().replace(/:/g, '')}`;

  useEffect(() => {
    const board = root.current!;
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine) and (min-width: 761px)');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let bounds = board.getBoundingClientRect();
    let anchors = new Map<HTMLElement, Anchor>();
    let active: HTMLElement | null = null;
    let source: LightInput = 'idle';
    let intent: LightInput = 'idle';
    let pointer: { x: number; y: number } | null = null;
    let lampVisible = false;
    const targets = new Set(spotlight?.targets);
    let frame = 0;
    let dirty = true;
    let disposed = false;

    function nodeFor(target: EventTarget | null) {
      if (!(target instanceof Element)) return null;
      const node = target.closest<HTMLElement>('[data-board-node]');
      return node && board.contains(node) && anchors.has(node) && targets.has(node.dataset.boardNode!) ? node : null;
    }

    function activate(node: HTMLElement | null, input: LightInput) {
      if (active !== node) {
        active?.removeAttribute('data-board-lit');
        active = node;
        active?.setAttribute('data-board-lit', 'true');
      }
      source = input;
    }

    function measure() {
      bounds = board.getBoundingClientRect();
      const next = new Map<HTMLElement, Anchor>();
      board.querySelectorAll<HTMLElement>('[data-board-node]').forEach(node => {
        if (node.closest('[hidden]') || !node.getClientRects().length) return;
        const rect = node.getBoundingClientRect();
        next.set(node, { id: node.dataset.boardNode!, x: rect.left - bounds.left, y: rect.top - bounds.top, width: rect.width, height: rect.height });
        resize.observe(node);
      });
      anchors.forEach((_, node) => { if (!next.has(node)) resize.unobserve(node); });
      anchors = next;
      const lampBounds = bulb.current?.getBoundingClientRect();
      lampVisible = !!lampBounds && lampBounds.bottom > 0 && lampBounds.top < window.innerHeight && lampBounds.right > 0 && lampBounds.left < window.innerWidth;
      const nextGeometry = { width: bounds.width, height: bounds.height, anchors: [...anchors.values()] };
      setGeometry(previous => JSON.stringify(previous) === JSON.stringify(nextGeometry) ? previous : nextGeometry);
      dirty = false;
    }

    function draw() {
      frame = 0;
      if (disposed) return;
      if (dirty) measure();
      // Scrolling and layout changes can move a different card under a stationary
      // cursor. Keep input intent while hidden, but never retain a stale highlight.
      const target = intent === 'pointer' && pointer && finePointer.matches
        ? document.elementFromPoint(pointer.x, pointer.y)
        : intent === 'keyboard' ? document.activeElement : null;
      const tracksCursor = intent === 'pointer' && pointer && finePointer.matches && !reducedMotion.matches;
      const node = lampVisible ? nodeFor(target) : null;
      const lightInput = lampVisible && (tracksCursor || node) ? intent : 'idle';
      activate(node, lightInput);
      board.dataset.spotlight = source;
      const layer = beam.current?.ownerSVGElement;
      if (layer) {
        layer.dataset.spotlight = source;
        // The beam uses viewport coordinates, but light belongs to the cork board.
        layer.style.clipPath = `inset(${bounds.top}px ${window.innerWidth - bounds.right}px ${window.innerHeight - bounds.bottom}px ${bounds.left}px round 7px)`;
      }
      const anchor = active && anchors.get(active);
      if (source === 'idle') {
        board.style.setProperty('--lamp-angle', '0deg');
        return;
      }
      const x = tracksCursor ? pointer!.x : bounds.left + (anchor?.x ?? 0) + (anchor?.width ?? 0) / 2;
      const y = tracksCursor ? pointer!.y : bounds.top + (anchor?.y ?? 0) + (anchor?.height ?? 0) / 2;
      if (active && anchor) {
        active.style.setProperty('--spot-x', `${x - bounds.left - anchor.x}px`);
        active.style.setProperty('--spot-y', `${y - bounds.top - anchor.y}px`);
      }
      board.style.setProperty('--lamp-angle', `${tracksCursor ? Math.max(-13, Math.min(13, (x - bounds.left - bounds.width / 2) / bounds.width * 30)) : 0}deg`);
      // Read the actual bulb after rotating the shade: the beam stays attached
      // even over the sidebar, page gutters, or after scrolling the window.
      const origin = bulb.current?.getBoundingClientRect();
      if (!origin) return;
      const ox = origin.left + origin.width / 2;
      const oy = origin.top + origin.height / 2;
      const dx = x - ox; const dy = y - oy;
      const distance = Math.hypot(dx, dy) || 1;
      const px = -dy / distance; const py = dx / distance;
      const radius = Math.min(140, distance * .3);
      beam.current?.setAttribute('points', `${ox + px * 7},${oy + py * 7} ${ox - px * 7},${oy - py * 7} ${x - px * radius},${y - py * radius} ${x + px * radius},${y + py * radius}`);
      pool.current?.setAttribute('cx', String(x));
      pool.current?.setAttribute('cy', String(y));
      pool.current?.setAttribute('rx', String(radius));
      pool.current?.setAttribute('transform', `rotate(${Math.atan2(dy, dx) * 180 / Math.PI - 90} ${x} ${y})`);
    }

    function schedule() { if (!frame && !disposed) frame = requestAnimationFrame(draw); }
    function refresh() { dirty = true; schedule(); }
    function move(event: PointerEvent) {
      if (event.pointerType === 'touch' || !finePointer.matches) return;
      pointer = { x: event.clientX, y: event.clientY };
      intent = 'pointer';
      schedule();
    }
    function focus() { intent = 'keyboard'; schedule(); }
    function leave(event: PointerEvent) { if (!event.relatedTarget) { pointer = null; intent = 'idle'; schedule(); } }
    function blur() { pointer = null; intent = 'idle'; schedule(); }
    const resize = new ResizeObserver(refresh);
    const mutation = new MutationObserver(refresh);
    resize.observe(board);
    mutation.observe(board, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'data-board-node'] });
    const visibility = spotlight ? new IntersectionObserver(refresh, { threshold: [0, 1] }) : null;
    if (head.current) visibility?.observe(head.current);
    if (spotlight) {
      window.addEventListener('pointermove', move);
      document.addEventListener('pointerout', leave);
      window.addEventListener('blur', blur);
      board.addEventListener('focusin', focus);
      board.addEventListener('focusout', focus);
      finePointer.addEventListener('change', refresh);
      reducedMotion.addEventListener('change', refresh);
    }
    window.addEventListener('resize', refresh);
    window.addEventListener('scroll', refresh, { passive: true, capture: true });
    schedule();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      resize.disconnect();
      mutation.disconnect();
      visibility?.disconnect();
      active?.removeAttribute('data-board-lit');
      board.dataset.spotlight = 'idle';
      board.style.setProperty('--lamp-angle', '0deg');
      window.removeEventListener('pointermove', move);
      document.removeEventListener('pointerout', leave);
      window.removeEventListener('blur', blur);
      board.removeEventListener('focusin', focus);
      board.removeEventListener('focusout', focus);
      window.removeEventListener('resize', refresh);
      window.removeEventListener('scroll', refresh, true);
      finePointer.removeEventListener('change', refresh);
      reducedMotion.removeEventListener('change', refresh);
    };
  }, [spotlight, portalHost]);

  const byId = new Map(geometry.anchors.map(anchor => [anchor.id, anchor]));
  return <div ref={root} className={`detective-board detective-board--${variant}${spotlight ? ' detective-board--spotlight' : ''}`} data-spotlight="idle">
    {spotlight && <div ref={lamp} className="board-lamp" aria-hidden="true">
      <svg viewBox="0 0 120 90" focusable="false"><path d="M60 0V43" stroke="#493527" strokeWidth="3"/><g ref={head} className="board-lamp-shade"><path d="M48 40h24l8 15 25 17H15l25-17Z" fill="#30251c"/><path d="M43 54h34" stroke="#70583e" strokeWidth="2"/><ellipse cx="60" cy="72" rx="44" ry="5" fill="#c8a27a"/><path ref={bulb} d="M47 72a13 10 0 0 0 26 0" fill="#fff2bb"/></g></svg>
    </div>}
    {spotlight && portalHost && createPortal(<svg className="board-beam" data-spotlight="idle" data-variant={variant} aria-hidden="true" focusable="false">
      <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff2b9" stopOpacity=".55"/><stop offset="1" stopColor="#fff5d6" stopOpacity=".08"/></linearGradient></defs>
      <polygon ref={beam} fill={`url(#${gradientId})`}/><ellipse ref={pool} ry="22" fill="#fff5d6" opacity=".24"/>
    </svg>, portalHost)}
    <svg className="board-strings" viewBox={`0 0 ${geometry.width} ${geometry.height}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <defs><filter id={`${gradientId}-yarn`} x="-20%" y="-20%" width="140%" height="140%"><feTurbulence type="fractalNoise" baseFrequency=".7" numOctaves="2" seed="4" result="fiberNoise"/><feDisplacementMap in="SourceGraphic" in2="fiberNoise" scale="1.6" xChannelSelector="R" yChannelSelector="G"/></filter></defs>
      {connections.map(([from, to], index) => {
        const a = byId.get(from); const b = byId.get(to);
        if (!a || !b) return null;
        // Attach outside the paper. Same-column threads stay in the side gutter;
        // side-by-side cards are joined above their top edges, never through text.
        const ax = a.x - 7; const ay = a.y + 17; const bx = b.x - 7; const by = b.y + 17;
        const rail = Math.max(6, Math.min(ax, bx) - 8 - index * 3);
        const top = Math.min(a.y, b.y) - 12;
        const sameColumn = Math.abs(a.x - b.x) < 20;
        const path = sameColumn ? `M${ax},${ay} Q${rail},${ay - 10} ${rail},${ay + 6} C${rail - 2},${ay + (by - ay) / 3} ${rail + 5},${by - 24} ${rail + 3},${by - 12} Q${rail + 2},${by - 2} ${bx},${by}` : `M${ax},${ay} Q${ax - 3},${top} ${ax + 8},${top} Q${(ax + bx) / 2},${top + 9} ${bx - 8},${top + 3} Q${bx},${top} ${bx},${by}`;
        return <g key={`${from}-${to}`} className="board-thread"><path d={path} className="board-thread-shadow"/><path d={path} className="board-thread-red" filter={`url(#${gradientId}-yarn)`}/><path d={path} className="board-yarn-fiber"/>{[[ax, ay], [bx, by]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="4" className="board-thread-pin"/>)}</g>;
      })}
      <defs><linearGradient id={`${gradientId}-pin`} x1="0" y1="0" x2="1" y2="0"><stop stopColor="#ff5149"/><stop offset=".3" stopColor="#df191a"/><stop offset=".75" stopColor="#9d090d"/><stop offset="1" stopColor="#f32b2b"/></linearGradient></defs>
      {geometry.anchors.map(anchor => <g key={anchor.id} className="board-paper-pin" transform={`translate(${anchor.x + anchor.width / 2},${anchor.y + 7})`}>
        <ellipse cx="3" cy="5" rx="10" ry="3.5" fill="#30251c" opacity=".24"/>
        <g transform="rotate(30)">
          <path d="M0 2V12L-1 14 -1 2" fill="#dedbd5" stroke="#625c54" strokeWidth=".8"/>
          <ellipse cy="2" rx="8" ry="3.5" fill="#a50e14"/>
          <ellipse cy="1" rx="8" ry="3" fill={`url(#${gradientId}-pin)`}/>
          <path d="M-4 -10 -3 1Q0 3 4 1L4 -10Z" fill={`url(#${gradientId}-pin)`}/>
          <path d="M-2.5 -9 -2 0" stroke="#ff8a80" strokeWidth="1"/>
          <ellipse cy="-10" rx="7" ry="3" fill="#a80c12"/>
          <ellipse cy="-11" rx="7" ry="2.8" fill="#ed252a" stroke="#a90e13" strokeWidth=".7"/>
          <path d="M-5 -12Q0 -14 5 -11" fill="none" stroke="#ffafa2" strokeWidth="1.2" strokeLinecap="round"/>
        </g>
      </g>)}
    </svg>
    <div className="board-content">{children}</div>
  </div>;
}
