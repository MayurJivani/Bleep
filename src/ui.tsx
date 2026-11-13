import { motion, AnimatePresence } from 'motion/react';
import type { ComponentProps, ReactNode } from 'react';
import { sfx, toggleSound, useSound } from './sound';
import type { Team } from '../shared/engine';

export const spring = { type: 'spring', stiffness: 700, damping: 32, mass: 0.6 } as const;
export const CH = ['A', 'B'] as const;
export const chColor = (t: Team) => (t === 0 ? 'blue' : 'yellow');

/** BLEEP wordmark: geometric strokes; the middle bars of both Es are cut out and replaced by signal lamps. */
export function Wordmark({ className = '', lamp = true }: { className?: string; lamp?: boolean }) {
  const s = { stroke: 'currentColor', strokeWidth: 18, fill: 'none' } as const;
  const E = (x: number) => (
    <g transform={`translate(${x} 0)`}>
      <path {...s} d="M9 0V100M0 9H56M0 91H56" />
      <rect x="27" y="41" width="18" height="18" fill={lamp ? 'var(--color-orange)' : 'currentColor'} />
    </g>
  );
  return (
    <svg viewBox="0 0 380 100" className={className} role="img" aria-label="BLEEP">
      <path {...s} d="M9 0V100M9 9H36a20.5 20.5 0 0 1 0 41H9M9 50H40a20.5 20.5 0 0 1 0 41H9" />
      <path {...s} d="M99 0V100M90 91H146" />
      {E(160)}{E(230)}
      <path {...s} d="M309 0V100M309 9H336a25 25 0 0 1 0 50H309" />
    </svg>
  );
}

const SEG: Record<string, string> = {
  '0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc', '5': 'afgcd', '6': 'afgedc', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg', '-': 'g', '_': 'd', ' ': '',
};
const h = (x1: number, x2: number, y: number) => `${x1},${y} ${x1 + 5},${y - 5} ${x2 - 5},${y - 5} ${x2},${y} ${x2 - 5},${y + 5} ${x1 + 5},${y + 5}`;
const v = (x: number, y1: number, y2: number) => `${x},${y1} ${x + 5},${y1 + 5} ${x + 5},${y2 - 5} ${x},${y2} ${x - 5},${y2 - 5} ${x - 5},${y1 + 5}`;
const POLY: Record<string, string> = {
  a: h(12, 48, 8), g: h(12, 48, 55), d: h(12, 48, 102), f: v(8, 12, 51), b: v(52, 12, 51), e: v(8, 59, 98), c: v(52, 59, 98),
};

/** Seven-segment digit with ghosted unlit segments, like a real LCD. */
export function Seg({ ch, color = 'var(--color-orange)', className = 'h-16' }: { ch: string; color?: string; className?: string }) {
  const lit = SEG[ch] ?? '';
  return (
    <svg viewBox="0 0 60 110" className={className} aria-hidden>
      <g transform="skewX(-6) translate(6 0)">
        {Object.entries(POLY).map(([k, p]) => <polygon key={k} points={p} fill={lit.includes(k) ? color : '#26292C'} style={{ transition: 'fill .12s' }} />)}
      </g>
    </svg>
  );
}

export function SegRow({ text, color, className, label }: { text: string; color?: string; className?: string; label?: string }) {
  return (
    <div className="flex gap-1.5" role="img" aria-label={label ?? text}>
      {[...text].map((c, i) => (
        <motion.div key={i + c} initial={{ opacity: 0.2 }} animate={{ opacity: 1 }} transition={{ duration: 0.12 }}>
          <Seg ch={c} color={color} className={className} />
        </motion.div>
      ))}
    </div>
  );
}

export const Led = ({ c, pulse, label }: { c?: 'orange' | 'yellow' | 'blue' | 'green'; pulse?: boolean; label?: string }) => (
  <motion.span className="led inline-block shrink-0" data-c={c} aria-label={label} role={label ? 'img' : undefined}
    animate={pulse ? { opacity: [1, 0.35, 1] } : { opacity: 1 }} transition={pulse ? { duration: 1.1, repeat: Infinity } : undefined} />
);

type KeyProps = Omit<ComponentProps<typeof motion.button>, 'children'> & { on?: boolean; dark?: boolean; children?: ReactNode; silent?: boolean };
/** Mechanical key: travels 2px on press with a spring return. */
export function Key({ on, dark, className = '', children, onClick, silent, ...rest }: KeyProps) {
  return (
    <motion.button
      type="button" className={`key ${className}`} data-on={!!on} data-dark={!!dark}
      whileTap={rest.disabled ? undefined : { y: 2, scale: 0.985 }} transition={spring}
      onTapStart={() => !rest.disabled && !silent && sfx.press()}
      onClick={onClick} {...rest}
    >{children}</motion.button>
  );
}

export function SoundToggle() {
  const on = useSound();
  return (
    <button type="button" onClick={toggleSound} className="flex items-center gap-2 label cursor-pointer min-h-11 px-1" aria-pressed={on} aria-label="Sound">
      <span className="relative w-8 h-4 rounded-full bg-disp inline-block shadow-inner">
        <motion.span className="absolute top-0.5 w-3 h-3 rounded-full" style={{ background: on ? 'var(--color-orange)' : '#8A8C8E' }} animate={{ left: on ? 18 : 2 }} transition={spring} />
      </span>
      SND {on ? 'ON' : 'OFF'}
    </button>
  );
}

export const Screws = () => (<>
  {['top-3 left-3', 'top-3 right-3', 'bottom-3 left-3', 'bottom-3 right-3'].map(p => <span key={p} className={`screw absolute ${p} hidden sm:block`} />)}
</>);

/** Status text that re-types itself when it changes. */
export function Ticker({ text, className = '' }: { text: string; className?: string }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.span key={text} className={`inline-block ${className}`} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.14 }}>
        {text}
      </motion.span>
    </AnimatePresence>
  );
}

export const Signature = ({ className = '' }) => (
  <div className={`label flex items-center gap-2 ${className}`}><span className="text-char">BLEEP</span><span>A FUTILE STUDIO GAME</span></div>
);

export const ChBadge = ({ t, size = 'sm' }: { t: Team; size?: 'sm' | 'lg' }) => (
  <span className={`inline-grid place-items-center font-mono font-bold rounded ${size === 'lg' ? 'w-8 h-8 text-sm' : 'w-5 h-5 text-[10px]'} ${t === 0 ? 'bg-blue text-disp' : 'border-2 border-yellow text-char bg-yellow/30'}`}>{CH[t]}</span>
);
