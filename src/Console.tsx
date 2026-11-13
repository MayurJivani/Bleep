import { motion, AnimatePresence } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { Team, View, Transmission } from '../shared/engine';
import { ROUNDS } from '../shared/engine';
import { CH, ChBadge, Led, SegRow, SoundToggle, Ticker, Wordmark, Screws, Signature, chColor } from './ui';
import { sfx } from './sound';
import { useRoom } from './net';

export const pad = (n: number) => String(n).padStart(2, '0');

export function statusLine(v: View): string {
  switch (v.phase) {
    case 'lobby': return 'SYSTEM READY';
    case 'encrypt': return v.transmitted.some(Boolean) ? 'SIGNAL DETECTED' : 'ENCRYPTING';
    case 'guess': return 'TRANSMISSION ACTIVE';
    case 'reveal': {
      const h = v.history.at(-1)!;
      return h.interceptOk ? 'SIGNAL INTERCEPTED' : h.decodeOk ? 'ENCRYPTION COMPLETE' : 'SIGNAL COMPROMISED';
    }
    case 'tiebreak': return 'SIGNAL TIE';
    case 'over': return 'TRANSMISSION ENDED';
  }
}

export function useSandSeconds(v: View) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!v.sandEndsAt) return; const i = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(i); }, [v.sandEndsAt]);
  return v.sandEndsAt ? Math.max(0, Math.ceil((v.sandEndsAt - now) / 1000)) : null;
}

/** Plays the feedback sound for each new event, on every device that watches. */
export function useEventSounds(v: View | null) {
  const last = useRef<string>('');
  useEffect(() => {
    if (!v) return;
    const k = `${v.stepKey}.${v.transmitted.join()}`;
    if (!last.current) { last.current = k; return; }
    if (k === last.current) return;
    last.current = k;
    const h = v.history.at(-1);
    if (v.phase === 'over') sfx.victory();
    else if (v.phase === 'reveal' && h) (h.interceptOk ? sfx.intercept : h.decodeOk ? sfx.correct : sfx.wrong)();
    else if (v.phase === 'guess') sfx.transmit();
    else if (v.phase === 'encrypt' && v.transmitted.some(Boolean)) sfx.signal();
  }, [v]);
}

export function TopStrip({ v, online, compact }: { v: View; online: boolean; compact?: boolean }) {
  return (
    <div className="flex items-center gap-x-5 gap-y-2 flex-wrap">
      <Wordmark className={compact ? 'h-5 text-char' : 'h-7 text-char'} />
      {!compact && <div className="label leading-tight hidden md:block">SYSTEM 004<br />COMMUNICATION UNIT</div>}
      <div className="flex-1" />
      <div className="flex items-center gap-4">
        <Readout k="ROOM" val={v.room} />
        {v.round > 0 && <Readout k="RND" val={`${pad(v.round)}/${pad(ROUNDS)}`} />}
        {(v.phase === 'guess' || v.phase === 'reveal') && <Readout k="CH" val={CH[v.active]} />}
        <span className="flex items-center gap-1.5 label" title={online ? 'CONNECTION ESTABLISHED' : 'NO CARRIER'}>
          <Led c={online ? 'green' : 'orange'} pulse={!online} /> {online ? 'LINK' : 'NO CARRIER'}
        </span>
        {!compact && <SoundToggle />}
      </div>
    </div>
  );
}
const Readout = ({ k, val }: { k: string; val: string }) => (
  <div className="flex items-baseline gap-1.5"><span className="label">{k}</span><span className="mono text-[13px] font-semibold tnum">{val}</span></div>
);

/** Tokens: two interception lamps, two miscommunication lamps. */
export function Tokens({ v, t }: { v: View; t: Team }) {
  const row = (n: number, c: 'orange' | 'yellow', name: string) => (
    <div className="flex items-center gap-2" aria-label={`${name} ${n} of 2`}>
      <span className="label w-14">{name === 'Interceptions' ? 'INTCPT' : 'MISCOM'}</span>
      {[0, 1].map(i => (
        <motion.span key={i} className="slot" data-c={i < n ? c : undefined}
          animate={i < n ? { scale: [1, 1.25, 1] } : {}} transition={{ duration: 0.4 }} />
      ))}
    </div>
  );
  return <div className="flex flex-col gap-1.5">{row(v.tokens.intercept[t], 'orange', 'Interceptions')}{row(v.tokens.miss[t], 'yellow', 'Miscommunications')}</div>;
}

/** Clues ever given for each digit of a channel: the shared note sheet. */
export const cluesByDigit = (h: Transmission[], t: Team) =>
  [1, 2, 3, 4].map(d => h.filter(x => x.team === t).flatMap(x => x.code.map((c, i) => (c === d ? { clue: x.clues[i], round: x.round } : null)).filter(Boolean) as { clue: string; round: number }[]));

export function NoteKeys({ v, t, words, highlight, onKey, picked }: {
  v: View; t: Team; words?: string[] | null; highlight?: string[] | null; onKey?: (d: number) => void; picked?: number[];
}) {
  const cols = cluesByDigit(v.history, t);
  return (
    <div className="grid grid-cols-4 gap-2">
      {cols.map((clues, i) => {
        const d = i + 1, on = picked?.includes(d);
        const Cap = onKey ? motion.button : motion.div;
        return (
          <div key={d} className="flex flex-col gap-2 min-w-0">
            <Cap type={onKey ? 'button' : undefined} onClick={onKey && (() => onKey(d))} disabled={onKey ? on : undefined}
              whileTap={onKey ? { y: 2 } : undefined} className="key px-2 py-2.5 text-left min-h-14 flex flex-col justify-between" data-on={!!on}>
              <span className="mono text-[11px] font-bold opacity-70">{pad(d)}</span>
              <span className={`text-[12px] font-semibold leading-tight [overflow-wrap:anywhere] ${words ? '' : 'opacity-40 whitespace-nowrap overflow-hidden'}`}>{words ? words[i] : '▮▮▮▮'}</span>
            </Cap>
            <ul className="flex flex-col gap-0.5 min-h-6" aria-label={`Clues for ${CH[t]} ${d}`}>
              {clues.map((c, j) => (
                <motion.li key={j} initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }}
                  className={`mono text-[10.5px] leading-snug truncate rounded px-1 ${highlight?.includes(c.clue) ? 'bg-orange text-white' : 'text-ink2'}`}>
                  <span className="opacity-60">{pad(c.round)}</span> {c.clue}
                </motion.li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

export function TeamModule({ v, t, words, won }: { v: View; t: Team; words?: string[] | null; won?: boolean }) {
  const ops = v.players.filter(p => p.team === t);
  const enc = v.encryptors?.[t];
  const live = v.phase === 'guess' || v.phase === 'reveal';
  return (
    <motion.section className="panel p-4 flex flex-col gap-4 relative" aria-label={`Channel ${CH[t]}`}
      animate={{ boxShadow: won ? '0 0 0 3px #FF572E, inset 0 1px 2px rgb(37 39 41 / .18)' : 'inset 0 1px 2px rgb(37 39 41 / .18)' }}>
      <header className="flex items-center gap-3">
        <ChBadge t={t} size="lg" />
        <div className="flex-1">
          <div className="text-sm font-bold tracking-[.14em]">CHANNEL {pad(t + 1)}</div>
          <div className="label">{live && v.active === t ? 'TRANSMITTING' : v.phase === 'encrypt' ? (v.transmitted[t] ? 'CLUES SEALED' : 'ENCODING') : 'STANDBY'}</div>
        </div>
        <Led c={live && v.active === t ? 'orange' : chColor(t)} pulse={live && v.active === t} />
      </header>
      <Tokens v={v} t={t} />
      <ul className="flex flex-wrap gap-x-3 gap-y-1">
        {ops.map(p => (
          <li key={p.id} className="flex items-center gap-1.5 mono text-[11px]">
            <Led c={p.connected ? 'green' : undefined} label={p.connected ? 'online' : 'offline'} />
            <span className={p.connected ? '' : 'opacity-50'}>{p.name}</span>
            {enc === p.id && <span className="label !text-orange">ENC</span>}
          </li>
        ))}
      </ul>
      <NoteKeys v={v} t={t} words={words} />
    </motion.section>
  );
}

export function Log({ v, max }: { v: View; max?: number }) {
  const rows = [...v.history].reverse().slice(0, max);
  return (
    <ol className="flex flex-col gap-1.5" aria-label="Transmission history">
      {rows.length === 0 && <li className="label py-2">NO TRANSMISSIONS LOGGED</li>}
      <AnimatePresence initial={false}>
        {rows.map(h => (
          <motion.li key={`${h.round}${h.team}`} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-dashed border-[#BDBCB6] pb-1.5 last:border-0">
            <span className="label whitespace-nowrap">RND {pad(h.round)} / CH {CH[h.team]}</span>
            <span className="mono text-[12px] font-semibold truncate">{h.clues.join(' → ')}</span>
            <span className="flex items-center gap-2 mono text-[11px] tnum">
              {h.code.join('-')}
              <span title={h.decodeOk ? 'Decoded' : 'Miscommunication'} className={h.decodeOk ? '' : 'text-[#9A6A00] font-bold'}>{h.decodeOk ? 'OK' : 'MISS'}</span>
              {h.interceptOk && <span className="text-orange font-bold">INTCPT</span>}
            </span>
          </motion.li>
        ))}
      </AnimatePresence>
    </ol>
  );
}

/** Central display of the shared console: never shows anything private. */
export function MainDisplay({ v }: { v: View }) {
  const sand = useSandSeconds(v);
  const h = v.history.at(-1);
  return (
    <div className="screen relative overflow-hidden p-5 sm:p-7 min-h-[300px] flex flex-col">
      <div className="flex justify-between screen-text text-[11px] text-[#8A8C8E]">
        <Ticker text={statusLine(v)} className="text-orange" />
        <span>{v.round ? `ROUND ${pad(v.round)}` : 'STANDBY'}</span>
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={v.stepKey || v.phase} className="flex-1 flex flex-col justify-center gap-4 py-5"
          initial={{ clipPath: 'inset(0 0 100% 0)', opacity: 0.4 }} animate={{ clipPath: 'inset(0 0 0% 0)', opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}>
          {v.phase === 'lobby' && <Big l1="COMMUNICATION" l2="CHANNELS READY" />}
          {v.phase === 'encrypt' && (
            <div className="flex flex-col gap-5">
              {([0, 1] as Team[]).map(t => (
                <div key={t} className="flex items-center gap-4">
                  <span className="screen-text text-sm w-24">CHANNEL {CH[t]}</span>
                  <div className="flex-1 h-2 rounded-full bg-[#26292C] overflow-hidden">
                    <motion.div className="h-full bg-orange" animate={{ width: v.transmitted[t] ? '100%' : ['8%', '42%', '8%'] }}
                      transition={v.transmitted[t] ? { duration: 0.4 } : { duration: 2.4, repeat: Infinity, ease: 'easeInOut' }} />
                  </div>
                  <span className="screen-text text-xs w-24 text-right">{v.transmitted[t] ? 'SEALED' : 'ENCODING'}</span>
                </div>
              ))}
              {sand !== null && <div className="flex items-center gap-4"><span className="screen-text text-xs text-yellow">SAND TIMER</span><SegRow text={pad(sand)} color="var(--color-yellow)" className="h-10" /></div>}
            </div>
          )}
          {(v.phase === 'guess' || v.phase === 'reveal') && v.live && <LiveClues v={v} />}
          {v.phase === 'reveal' && h && (
            <div className="flex items-center gap-6 flex-wrap">
              <SegRow text={h.code.join('')} className="h-14" label={`Code ${h.code.join(' ')}`} />
              <div className="screen-text text-xs flex flex-col gap-1">
                <span className={h.decodeOk ? 'text-blue' : 'text-yellow'}>CH {CH[h.team]} DECODE {h.decode.join('')} {h.decodeOk ? 'MATCH' : 'MISCOMMUNICATION'}</span>
                {h.intercept && <span className={h.interceptOk ? 'text-orange' : 'text-[#8A8C8E]'}>CH {CH[1 - h.team]} INTERCEPT {h.intercept.join('')} {h.interceptOk ? 'SIGNAL LOCKED' : 'NO LOCK'}</span>}
              </div>
            </div>
          )}
          {v.phase === 'tiebreak' && <Big l1="SIGNAL TIE" l2="NAME THE ENEMY WORDS" />}
          {v.phase === 'over' && v.result && <Victory v={v} />}
        </motion.div>
      </AnimatePresence>
      {v.phase === 'guess' && (
        <div className="flex gap-6 screen-text text-[11px]">
          <span className={v.locked.decode ? 'text-blue' : 'text-[#8A8C8E]'}>CH {CH[v.active]} DECODE {v.locked.decode ? 'LOCKED' : '···'}</span>
          {v.needsIntercept && <span className={v.locked.intercept ? 'text-orange' : 'text-[#8A8C8E]'}>CH {CH[1 - v.active]} INTERCEPT {v.locked.intercept ? 'LOCKED' : '···'}</span>}
          {!v.needsIntercept && <span className="text-[#8A8C8E]">NO INTERCEPTION IN ROUND 01</span>}
        </div>
      )}
    </div>
  );
}

const Big = ({ l1, l2 }: { l1: string; l2: string }) => (
  <div className="screen-text leading-tight"><div className="text-2xl sm:text-4xl">{l1}</div><div className="text-2xl sm:text-4xl text-orange">{l2}</div></div>
);

export function LiveClues({ v }: { v: View }) {
  return (
    <div className="relative">
      {v.phase === 'guess' && (
        <motion.div className="absolute inset-y-0 w-24 pointer-events-none" style={{ background: 'linear-gradient(90deg, transparent, rgb(255 87 46 / .22), transparent)' }}
          initial={{ left: '-30%' }} animate={{ left: '110%' }} transition={{ duration: 0.9, ease: 'easeInOut' }} />
      )}
      <ol className="flex flex-col gap-2">
        {v.live!.map((c, i) => (
          <motion.li key={i} className="flex items-baseline gap-4" initial={{ opacity: 0, filter: 'blur(4px)' }} animate={{ opacity: 1, filter: 'blur(0px)' }} transition={{ delay: 0.15 + i * 0.22, duration: 0.25 }}>
            <span className="screen-text text-[11px] text-[#8A8C8E] w-14">CH {pad(i + 1)}</span>
            <span className="screen-text text-[clamp(1.1rem,6cqi,2.75rem)] leading-none [overflow-wrap:anywhere]">{c}</span>
          </motion.li>
        ))}
      </ol>
    </div>
  );
}

function Victory({ v }: { v: View }) {
  const r = v.result!;
  const text = r.winner === null ? ['SIGNAL DEADLOCK', 'NO CHANNEL PREVAILS'] : r.reason === 'intercept' ? ['SIGNAL SUCCESSFULLY', 'INTERCEPTED'] : ['COMMUNICATION CHANNEL', 'SECURED'];
  return (
    <div className="flex flex-col gap-4">
      {r.winner !== null && (
        <motion.div className="screen-text text-sm text-orange" animate={{ opacity: [0, 1, 0.3, 1] }} transition={{ duration: 0.8 }}>CHANNEL {CH[r.winner]} WINS</motion.div>
      )}
      <motion.div initial={{ letterSpacing: '0.4em', opacity: 0 }} animate={{ letterSpacing: '0.08em', opacity: 1 }} transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}>
        <Big l1={text[0]} l2={text[1]} />
      </motion.div>
      <div className="screen-text text-[11px] text-[#8A8C8E]">
        {r.reason === 'miscommunication' && `CHANNEL ${CH[1 - r.winner!]} LOST CONTACT TWICE`}
        {r.reason === 'score' && 'DECIDED ON SIGNAL SCORE'}
        {r.reason === 'tiebreak' && `KEYWORDS IDENTIFIED ${r.tiebreak![0]} : ${r.tiebreak![1]}`}
      </div>
    </div>
  );
}

/** Boot: body, screen power, lamps, status, channels. Under a second, and never blocks input. */
export function Boot({ children }: { children: React.ReactNode }) {
  const first = useRef(!sessionStorage.getItem('bleep:booted'));
  useEffect(() => { if (first.current) { sessionStorage.setItem('bleep:booted', '1'); sfx.boot(); } }, []);
  if (!first.current) return <>{children}</>;
  return (
    <motion.div initial={{ opacity: 0, y: 14, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}>
      <motion.div initial={{ filter: 'brightness(.7)' }} animate={{ filter: 'brightness(1)' }} transition={{ delay: 0.25, duration: 0.5 }}>{children}</motion.div>
    </motion.div>
  );
}

export function ConsoleDevice({ v, online = true, words }: { v: View; online?: boolean; words?: [string[], string[]] | null }) {
  const won = (t: Team) => v.phase === 'over' && v.result?.winner === t;
  return (
    <div className="body relative p-4 sm:p-6 flex flex-col gap-5">
      <Screws />
      <TopStrip v={v} online={online} />
      <div className="grid gap-5 lg:grid-cols-[1fr_1.5fr_1fr] items-start">
        <TeamModule v={v} t={0} words={words?.[0] ?? v.reveal?.[0]} won={won(0)} />
        <div className="flex flex-col gap-5 order-first lg:order-none">
          <MainDisplay v={v} />
          <div className="panel p-4">
            <div className="flex justify-between mb-2"><span className="label">TRANSMISSION LOG</span><span className="label">CHANNEL 01 · CHANNEL 02</span></div>
            <Log v={v} max={8} />
          </div>
        </div>
        <TeamModule v={v} t={1} words={words?.[1] ?? v.reveal?.[1]} won={won(1)} />
      </div>
      <div className="flex items-center gap-4">
        <div className="grille h-6 flex-1 rounded" aria-hidden />
        <Signature />
      </div>
    </div>
  );
}

export function ConsoleScreen({ room }: { room: string }) {
  const { view, online, error } = useRoom(room, 'console');
  useEventSounds(view);
  if (error) return <Notice text={error} />;
  if (!view) return <Notice text="ESTABLISHING CONNECTION" />;
  return (
    <main className="min-h-dvh p-3 sm:p-6 lg:p-10 max-w-[1500px] mx-auto">
      <Boot><ConsoleDevice v={view} online={online} /></Boot>
      {view.phase === 'lobby' && <p className="label text-center mt-4">SHARED CONSOLE · PLAYERS JOIN AT {location.host}/{view.room} ON THEIR PHONES</p>}
    </main>
  );
}

export const Notice = ({ text, children }: { text: string; children?: React.ReactNode }) => (
  <main className="min-h-dvh grid place-items-center p-6">
    <div className="body p-6 w-full max-w-sm flex flex-col gap-4">
      <Wordmark className="h-6 text-char" />
      <div className="screen p-5 screen-text text-orange text-lg"><Ticker text={text} /></div>
      {children}
    </div>
  </main>
);
