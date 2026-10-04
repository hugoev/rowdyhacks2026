'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

export type BoardConnection = readonly [from: string, to: string];
type Anchor = { id: string; x: number; y: number; width: number; height: number };
const noConnections: readonly BoardConnection[] = [];

/** Decorations are independent of application state and never intercept input. */
export function DetectiveBoard({ children, variant = 'standard', connections = noConnections }: {
  children: ReactNode;
  variant?: 'standard' | 'calm';
  connections?: readonly BoardConnection[];
}) {
  const root = useRef<HTMLDivElement>(null);
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
    let source: 'pointer' | 'keyboard' | 'idle' = 'idle';
    let pointer = { x: 0, y: 0 };
    let frame = 0;
    let dirty = true;
    let disposed = false;

    function nodeFor(target: EventTarget | null) {
      if (!(target instanceof Element)) return null;
      const node = target.closest<HTMLElement>('[data-board-node]');
      return node && board.contains(node) && anchors.has(node) ? node : null;
    }

    function activate(node: HTMLElement | null, input: typeof source) {
      if (active !== node) {
        active?.removeAttribute('data-board-lit');
        active = node;
        active?.setAttribute('data-board-lit', 'true');
      }
      source = node ? input : 'idle';
      schedule();
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
      if (active && !anchors.has(active)) activate(null, 'idle');
      const nextGeometry = { width: bounds.width, height: bounds.height, anchors: [...anchors.values()] };
      setGeometry(previous => JSON.stringify(previous) === JSON.stringify(nextGeometry) ? previous : nextGeometry);
      dirty = false;
    }

    function draw() {
      frame = 0;
      if (disposed) return;
      if (dirty) measure();
      board.dataset.spotlight = source;
      const anchor = active && anchors.get(active);
      if (!active || !anchor) {
        board.style.setProperty('--lamp-angle', '0deg');
        return;
      }
      const tracksCursor = source === 'pointer' && finePointer.matches && !reducedMotion.matches;
      const localX = tracksCursor ? Math.max(0, Math.min(anchor.width, pointer.x - bounds.left - anchor.x)) : anchor.width / 2;
      const localY = tracksCursor ? Math.max(0, Math.min(anchor.height, pointer.y - bounds.top - anchor.y)) : anchor.height / 2;
      active.style.setProperty('--spot-x', `${localX}px`);
      active.style.setProperty('--spot-y', `${localY}px`);
      const x = anchor.x + localX;
      const y = Math.max(90, anchor.y + localY);
      const radius = Math.min(140, anchor.width * .42);
      beam.current?.setAttribute('points', `${bounds.width / 2 - 9},68 ${bounds.width / 2 + 9},68 ${x + radius},${y} ${x - radius},${y}`);
      pool.current?.setAttribute('cx', String(x));
      pool.current?.setAttribute('cy', String(y));
      pool.current?.setAttribute('rx', String(radius));
      board.style.setProperty('--lamp-angle', `${Math.max(-13, Math.min(13, (x - bounds.width / 2) / bounds.width * 30))}deg`);
    }

    function schedule() { if (!frame && !disposed) frame = requestAnimationFrame(draw); }
    function refresh() { dirty = true; schedule(); }
    function move(event: PointerEvent) {
      if (event.pointerType === 'touch' || !finePointer.matches) return;
      pointer = { x: event.clientX, y: event.clientY };
      activate(nodeFor(event.target), 'pointer');
    }
    function leave() { activate(nodeFor(document.activeElement), 'keyboard'); }
    function focus(event: FocusEvent) { activate(nodeFor(event.target), 'keyboard'); }
    function blur(event: FocusEvent) { activate(nodeFor(event.relatedTarget), 'keyboard'); }
    function preferencesChanged() { activate(null, 'idle'); refresh(); }
    const resize = new ResizeObserver(refresh);
    const mutation = new MutationObserver(refresh);
    resize.observe(board);
    mutation.observe(board, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'data-board-node'] });
    board.addEventListener('pointermove', move);
    board.addEventListener('pointerleave', leave);
    board.addEventListener('focusin', focus);
    board.addEventListener('focusout', blur);
    window.addEventListener('resize', refresh);
    window.addEventListener('scroll', refresh, { passive: true, capture: true });
    finePointer.addEventListener('change', preferencesChanged);
    reducedMotion.addEventListener('change', preferencesChanged);
    schedule();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      resize.disconnect();
      mutation.disconnect();
      active?.removeAttribute('data-board-lit');
      board.removeEventListener('pointermove', move);
      board.removeEventListener('pointerleave', leave);
      board.removeEventListener('focusin', focus);
      board.removeEventListener('focusout', blur);
      window.removeEventListener('resize', refresh);
      window.removeEventListener('scroll', refresh, true);
      finePointer.removeEventListener('change', preferencesChanged);
      reducedMotion.removeEventListener('change', preferencesChanged);
    };
  }, []);

  const byId = new Map(geometry.anchors.map(anchor => [anchor.id, anchor]));
  return <div ref={root} className={`detective-board detective-board--${variant}`} data-spotlight="idle">
    <div className="board-lamp" aria-hidden="true">
      <svg viewBox="0 0 120 90" focusable="false"><path d="M60 0V43" stroke="#493527" strokeWidth="3"/><g className="board-lamp-shade"><path d="M48 40h24l8 15 25 17H15l25-17Z" fill="#30251c"/><path d="M43 54h34" stroke="#70583e" strokeWidth="2"/><ellipse cx="60" cy="72" rx="44" ry="5" fill="#c8a27a"/><path d="M47 72a13 10 0 0 0 26 0" fill="#fff2bb"/></g></svg>
    </div>
    <svg className="board-beam" viewBox={`0 0 ${geometry.width} ${geometry.height}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff2b9" stopOpacity=".55"/><stop offset="1" stopColor="#fff5d6" stopOpacity=".08"/></linearGradient></defs>
      <polygon ref={beam} fill={`url(#${gradientId})`}/><ellipse ref={pool} ry="22" fill="#fff5d6" opacity=".24"/>
    </svg>
    <svg className="board-strings" viewBox={`0 0 ${geometry.width} ${geometry.height}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
      {connections.map(([from, to], index) => {
        const a = byId.get(from); const b = byId.get(to);
        if (!a || !b) return null;
        // Attach outside the paper. Same-column threads stay in the side gutter;
        // side-by-side cards are joined above their top edges, never through text.
        const ax = a.x - 7; const ay = a.y + 17; const bx = b.x - 7; const by = b.y + 17;
        const rail = Math.max(6, Math.min(ax, bx) - 8 - index * 3);
        const top = Math.min(a.y, b.y) - 12;
        const sameColumn = Math.abs(a.x - b.x) < 20;
        const path = sameColumn ? `M${ax},${ay} L${rail},${ay - 8} L${rail + 3},${by - 12} L${bx},${by}` : `M${ax},${ay} L${ax},${top} L${bx},${top + 3} L${bx},${by}`;
        return <g key={`${from}-${to}`} className="board-thread"><path d={path} className="board-thread-shadow"/><path d={path} className="board-thread-red"/>{[[ax, ay], [bx, by]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="4" className="board-thread-pin"/>)}</g>;
      })}
      {geometry.anchors.map(anchor => <g key={anchor.id} className="board-paper-pin" transform={`translate(${anchor.x + anchor.width / 2},${anchor.y + 7})`}><ellipse cy="3" rx="5" ry="3" fill="#30251c" opacity=".2"/><circle r="4" fill="#b88a47" stroke="#806044"/><circle cx="-1" cy="-1" r="1.2" fill="#f8e6bd"/></g>)}
    </svg>
    <div className="board-content">{children}</div>
  </div>;
}
