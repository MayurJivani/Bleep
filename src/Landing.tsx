import { motion } from 'motion/react';
import { useState } from 'react';
import type { View } from '../shared/engine';
import { call, go, saveToken } from './net';
import { ConsoleDevice, MainDisplay } from './Console';
import { Key, Led, Signature, SoundToggle, Wordmark } from './ui';

const demo: View = {
  room: 'KVTR', phase: 'guess', host: 'a', me: null, round: 3, active: 0, stepKey: 'demo',
  players: [['a', 'IRIS', 0], ['b', 'TOMAS', 0], ['c', 'NOOR', 0], ['d', 'JUNE', 1], ['e', 'OLLIE', 1], ['f', 'SAM', 1]].map(([id, name, team]) => ({ id: id as string, name: name as string, team: team as 0 | 1, connected: id !== 'f' })),
  encryptors: ['c', 'f'], transmitted: [true, true], sandEndsAt: null,
  live: ['NATURE', 'NIGHT', 'EXPENSIVE'], locked: { decode: false, intercept: true }, needsIntercept: true,
  tokens: { intercept: [0, 1], miss: [1, 0] },
  history: [
    { round: 1, team: 0, clues: ['TICK', 'WEREWOLF', 'RING'], code: [2, 1, 4], decode: [2, 1, 4], intercept: null, decodeOk: true, interceptOk: false },
    { round: 1, team: 1, clues: ['WAVE', 'BLADE', 'ORBIT'], code: [1, 3, 2], decode: [1, 3, 2], intercept: null, decodeOk: true, interceptOk: false },
    { round: 2, team: 0, clues: ['TIDE', 'PINE', 'ALARM'], code: [1, 3, 2], decode: [3, 1, 2], intercept: [1, 3, 2], decodeOk: false, interceptOk: true },
    { round: 2, team: 1, clues: ['SURF', 'COMET', 'EDGE'], code: [1, 2, 3], decode: [1, 2, 3], intercept: [2, 1, 3], decodeOk: true, interceptOk: false },
  ],
  result: null, tiebreakIn: [false, false], secret: null, reveal: null,
};

export function Landing() {
  const [mode, setMode] = useState<'create' | 'join' | null>(null);
  const [name, setName] = useState(localStorage.getItem('bleep:name') ?? '');
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null);
    localStorage.setItem('bleep:name', name);
    const r = mode === 'create' ? await call('create', { name }) : await call('join', { room: code, name });
    setBusy(false);
    if (r.error) return setErr(r.error);
    saveToken(r.room!, r.token!);
    go(`/${r.room}`);
  };

  return (
    <main className="min-h-dvh overflow-x-clip">
      <header className="max-w-[1400px] mx-auto px-5 sm:px-10 pt-6 flex items-center justify-between">
        <Signature />
        <SoundToggle />
      </header>

      <section className="max-w-[1400px] mx-auto px-5 sm:px-10 pt-10 sm:pt-16 pb-12 grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-10 lg:gap-14 items-center">
        <div className="flex flex-col gap-7">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
            <h1><Wordmark className="w-full max-w-[520px] text-char" /></h1>
          </motion.div>
          <p className="text-2xl sm:text-3xl font-semibold tracking-[.06em] leading-tight">THINK ALIKE.<br />SPEAK IN CODE.</p>
          <p className="text-[17px] leading-relaxed max-w-[46ch] text-ink2">
            Your team knows the words. Your teammates know the clues. The other team knows just enough to ruin everything.
          </p>
          <div className="flex items-center gap-3 label"><Led c="orange" pulse /> SYSTEM 004 · COMMUNICATION CHANNELS READY</div>

          <div className="body p-4 sm:p-5 flex flex-col gap-4 max-w-md">
            <div className="grid grid-cols-3 gap-2.5">
              <Key on={mode === 'create'} className="min-h-14 text-[11px] font-bold tracking-[.14em]" onClick={() => setMode('create')}>CREATE ROOM</Key>
              <Key on={mode === 'join'} className="min-h-14 text-[11px] font-bold tracking-[.14em]" onClick={() => setMode('join')}>JOIN ROOM</Key>
              <Key dark className="min-h-14 text-[11px] font-bold tracking-[.14em]" onClick={() => document.getElementById('how')?.scrollIntoView({ behavior: 'smooth' })}>HOW TO PLAY</Key>
            </div>
            {mode && (
              <motion.form onSubmit={submit} className="flex flex-col gap-3" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
                {mode === 'join' && (
                  <label className="flex flex-col gap-1.5"><span className="label">ROOM CODE</span>
                    <input className="field tracking-[.4em]" value={code} onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4))} placeholder="KVTR" inputMode="text" autoCapitalize="characters" autoComplete="off" /></label>
                )}
                <label className="flex flex-col gap-1.5"><span className="label">CALL SIGN</span>
                  <input className="field" value={name} maxLength={14} onChange={e => setName(e.target.value)} placeholder="YOUR NAME" autoComplete="nickname" /></label>
                {err && <p role="alert" className="mono text-[12px] text-[#B23A16]">{err}</p>}
                <Key on type="submit" disabled={busy || !name.trim() || (mode === 'join' && code.length !== 4)} className="min-h-12 font-bold tracking-[.16em] text-sm">
                  {busy ? 'CONNECTING' : mode === 'create' ? 'OPEN A CHANNEL' : 'CONNECT'}
                </Key>
              </motion.form>
            )}
          </div>
        </div>
        <motion.div aria-label="The BLEEP console mid-game" initial={{ opacity: 0, y: 24, rotate: -0.6 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
          className="pointer-events-none select-none lg:-mr-24 xl:-mr-40" inert>
          <div className="hidden lg:block"><ConsoleDevice v={demo} /></div>
          {/* the full console stacks too tall on a phone; show its display only */}
          <div className="lg:hidden body p-3"><MainDisplay v={demo} /></div>
        </motion.div>
      </section>

      <section id="how" className="bg-char text-ivory">
        <div className="max-w-[1100px] mx-auto px-5 sm:px-10 py-16 sm:py-24 grid md:grid-cols-2 gap-14">
          <div className="flex flex-col gap-6">
            <h2 className="text-3xl sm:text-4xl font-semibold tracking-[.04em] leading-tight">Four words.<br />Three clues.<br /><span className="text-orange">Someone is listening.</span></h2>
            <p className="text-[17px] leading-relaxed text-[#C9C8C2] max-w-[50ch]">
              Each channel holds four secret keywords, numbered 01 to 04. Every round, one operator gets a three-digit code like 3-1-4 and transmits one clue per digit. Teammates rebuild the code. The other channel hears every clue and tries to break it.
            </p>
            <div className="grid grid-cols-4 gap-2" aria-label="Example keywords">
              {['MOON', 'CLOCK', 'FOREST', 'DIAMOND'].map((w, i) => (
                <div key={w} className="key px-2 py-2.5 min-h-14 flex flex-col justify-between"><span className="mono text-[11px] font-bold opacity-70">0{i + 1}</span><span className="text-[13px] font-semibold truncate">{w}</span></div>
              ))}
            </div>
            <div className="screen p-5 flex flex-col gap-2">
              <div className="screen-text text-[11px] text-[#8A8C8E]">CODE 3-1-4 · ROUND 01 / CHANNEL A</div>
              <div className="screen-text text-2xl">NATURE <span className="text-orange">→</span> NIGHT <span className="text-orange">→</span> EXPENSIVE</div>
              <div className="screen-text text-[11px] text-[#8A8C8E]">FOREST · MOON · DIAMOND</div>
            </div>
          </div>
          <ol className="flex flex-col gap-6 text-[16px] leading-relaxed text-[#C9C8C2]">
            {[
              ['Set up', '4 to 12 players on their own phones, split into two channels of at least two. Put the shared console on a TV or laptop that everyone can see.'],
              ['Encrypt', 'Both encryptors write three clues at once. When one channel seals, the other has 30 seconds of sand left.'],
              ['Decode', 'Channel A\'s clues go public. A\'s teammates lock in a code. From round 2, channel B locks an interception attempt at the same time.'],
              ['Reveal', 'A wrong decode earns a miscommunication token. A correct interception earns an interception token. Then channel B transmits.'],
              ['Win', 'Checked at the end of each round: two interceptions win, two miscommunications lose. Ties and round 8 go to score, then to guessing each other\'s keywords.'],
            ].map(([k, t]) => (
              <li key={k} className="grid grid-cols-[88px_1fr] gap-4"><span className="label !text-orange pt-1">{k}</span><span>{t}</span></li>
            ))}
          </ol>
        </div>
      </section>

      <footer className="max-w-[1400px] mx-auto px-5 sm:px-10 py-10 flex flex-wrap gap-4 items-center justify-between">
        <div className="flex items-center gap-4"><Wordmark className="h-5 text-char" lamp={false} /><span className="label">A FUTILE STUDIO GAME · SYSTEM 004</span></div>
        <a className="label underline underline-offset-4 hover:text-orange" href="https://lab.futile.studio">LAB.FUTILE.STUDIO</a>
        <p className="label w-full">Based on the mechanics of Decrypto by Le Scorpion Masqué. Fan adaptation, not affiliated.</p>
      </footer>
    </main>
  );
}
