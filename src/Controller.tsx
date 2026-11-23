import { motion, AnimatePresence } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { Team, View } from '../shared/engine';
import { MIN_TEAM } from '../shared/engine';
import { act, go, useRoom } from './net';
import { CH, ChBadge, Key, Led, Seg, SegRow, SoundToggle, Ticker, Wordmark, chColor, Signature } from './ui';
import { HowTo } from './Landing';
import { Boot, LiveClues, Log, NoteKeys, Notice, Tokens, TopStrip, pad, statusLine, useEventSounds, useSandSeconds } from './Console';

export function Seat({ room }: { room: string }) {
  const { view, online, error, token, join } = useRoom(room, 'seat');
  useEventSounds(view);
  if (!token) return <JoinForm room={room} join={join} error={error} />;
  if (!view) return <Notice text={error ?? 'ESTABLISHING CONNECTION'} />;
  return (
    <main className="min-h-dvh sm:p-6 lg:py-10">
      <Boot>{view.phase === 'lobby' ? <Lobby v={view} online={online} /> : <Controller v={view} online={online} />}</Boot>
    </main>
  );
}

function JoinForm({ room, join, error }: { room: string; join: (n: string) => Promise<{ error?: string }>; error: string | null }) {
  const [name, setName] = useState(localStorage.getItem('bleep:name') ?? '');
  const [err, setErr] = useState(error);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    localStorage.setItem('bleep:name', name);
    const r = await join(name); setBusy(false);
    if (r.error) setErr(r.error);
  };
  return (
    <Notice text={`ROOM ${room} DETECTED`}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label className="label" htmlFor="callsign">CALL SIGN</label>
        <input id="callsign" className="field" maxLength={14} value={name} onChange={e => setName(e.target.value)} placeholder="YOUR NAME" autoFocus autoComplete="nickname" />
        {err && <p role="alert" className="mono text-[12px] text-[#B23A16]">{err}</p>}
        <Key on className="min-h-12 font-bold tracking-[.16em] text-sm" type="submit" disabled={busy || !name.trim()}>{busy ? 'CONNECTING' : 'CONNECT DEVICE'}</Key>
        <button type="button" className="label underline underline-offset-4 min-h-11" onClick={() => go('/')}>BACK TO HOME</button>
      </form>
    </Notice>
  );
}

const Shell = ({ v, online, children, wide }: { v: View; online: boolean; children: React.ReactNode; wide?: boolean }) => (
  <div className={`body sm:rounded-[28px] rounded-none min-h-dvh sm:min-h-0 mx-auto p-4 sm:p-6 pb-[max(1rem,env(safe-area-inset-bottom))] flex flex-col gap-4 ${wide ? 'max-w-4xl' : 'max-w-md'}`}>
    <div className="flex items-center gap-3">
      <TopStrip v={v} online={online} compact />
    </div>
    {children}
    <details className="panel p-3 mt-auto">
      <summary className="label cursor-pointer min-h-11 flex items-center">HOW TO PLAY</summary>
      <HowTo className="gap-4 pt-3 text-[14px]" />
    </details>
    <div className="flex items-center justify-between pt-2"><Signature /><SoundToggle /></div>
  </div>
);

// ---------------- Lobby ----------------

function Lobby({ v, online }: { v: View; online: boolean }) {
  const me = v.me!;
  const isHost = v.host === me.id;
  const host = v.players.find(p => p.id === v.host);
  const counts = ([0, 1] as Team[]).map(t => v.players.filter(p => p.team === t).length);
  const unassigned = v.players.filter(p => p.team === null);
  const blocker = unassigned.length ? `${unassigned.length} OPERATOR${unassigned.length > 1 ? 'S' : ''} UNPATCHED` : counts.some(c => c < MIN_TEAM) ? `EACH CHANNEL NEEDS ${MIN_TEAM}+ OPERATORS` : null;
  const [msg, setMsg] = useState<string | null>(null);
  const link = `${location.origin}/${v.room}`;
  const invite = async () => {
    if (navigator.share) { try { await navigator.share({ title: 'BLEEP', text: `Join room ${v.room}`, url: link }); return; } catch { /* dismissed */ } }
    await navigator.clipboard?.writeText(link); setMsg('LINK COPIED');
  };
  const run = async (type: string, p = {}) => { const r = await act(type, p); setMsg(r.error ?? null); };

  return (
    <Shell v={v} online={online} wide>
      <div className="screen p-5 flex flex-col sm:flex-row sm:items-end gap-4 justify-between">
        <div>
          <div className="screen-text text-[11px] text-[#8A8C8E]"><Ticker text={online ? 'CONNECTION ESTABLISHED' : 'NO CARRIER'} /></div>
          <div className="screen-text text-[11px] text-[#8A8C8E] mt-3">ROOM CODE</div>
          <div className="screen-text text-6xl sm:text-7xl text-orange leading-none tracking-[.2em]" aria-label={`Room code ${v.room.split('').join(' ')}`}>{v.room}</div>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <span className="screen-text text-[11px] text-[#8A8C8E]">{location.host}/{v.room}</span>
          <div className="flex gap-2">
            <Key dark className="min-h-11 px-4 text-[11px] font-bold tracking-[.14em]" onClick={invite}>INVITE</Key>
            <Key dark className="min-h-11 px-4 text-[11px] font-bold tracking-[.14em]" onClick={() => open(`/${v.room}/console`, '_blank')}>SHARED CONSOLE</Key>
          </div>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {([0, 1] as Team[]).map(t => {
          const ops = v.players.filter(p => p.team === t);
          return (
            <section key={t} className="panel p-4 flex flex-col gap-3" aria-label={`Channel ${CH[t]}`}>
              <header className="flex items-center gap-3">
                <ChBadge t={t} size="lg" />
                <div className="flex-1"><div className="font-bold tracking-[.14em] text-sm">CHANNEL {CH[t]}</div><div className="label">{ops.length} / {MIN_TEAM}+ OPERATORS</div></div>
                <Led c={ops.length >= MIN_TEAM ? chColor(t) : undefined} label={ops.length >= MIN_TEAM ? 'channel ready' : 'channel not ready'} />
              </header>
              <ul className="flex flex-col gap-1.5 min-h-[76px]">
                <AnimatePresence initial={false}>
                  {ops.map(p => <OperatorRow key={p.id} p={p} me={me.id} host={v.host} />)}
                </AnimatePresence>
                {!ops.length && <li className="label py-2">NO OPERATORS PATCHED</li>}
              </ul>
              <Key on={me.team === t} className="min-h-12 text-[12px] font-bold tracking-[.16em]" onClick={() => run('team', { team: me.team === t ? null : t })}>
                {me.team === t ? 'PATCHED IN · TAP TO UNPATCH' : `PATCH INTO ${CH[t]}`}
              </Key>
            </section>
          );
        })}
      </div>

      {unassigned.length > 0 && (
        <div className="panel p-3 flex flex-wrap items-center gap-3">
          <span className="label">UNPATCHED</span>
          {unassigned.map(p => <span key={p.id} className="mono text-[11px] flex items-center gap-1.5"><Led c={p.connected ? 'green' : undefined} />{p.name}{p.id === me.id && ' (YOU)'}</span>)}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <div className="flex-1 mono text-[12px]" role="status">
          {msg ?? (blocker ?? (isHost ? 'ALL CHANNELS READY' : `WAITING FOR HOST ${host?.name ?? ''}`))}
        </div>
        <Key className="min-h-12 px-5 text-[12px] font-bold tracking-[.14em]" onClick={async () => { await act('leave'); go('/'); }}>LEAVE</Key>
        {isHost && <Key on className="min-h-12 px-6 text-[13px] font-bold tracking-[.16em]" disabled={!!blocker} onClick={() => run('start')}>START TRANSMISSION</Key>}
      </div>
    </Shell>
  );
}

function OperatorRow({ p, me, host }: { p: View['players'][0]; me: string; host: string | null }) {
  return (
    <motion.li layout initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }} className="flex items-center gap-2 mono text-[12px]">
      <Led c={p.connected ? 'green' : undefined} label={p.connected ? 'online' : 'offline'} />
      <span className={p.connected ? '' : 'opacity-50'}>{p.name}</span>
      {p.id === me && <span className="label">YOU</span>}
      {p.id === host && <span className="label !text-orange">HOST</span>}
    </motion.li>
  );
}

// ---------------- In game ----------------

function Controller({ v, online }: { v: View; online: boolean }) {
  const me = v.me!, t = me.team as Team, o = (1 - t) as Team;
  const [msg, setMsg] = useState<string | null>(null);
  const run = async (type: string, p = {}) => { const r = await act(type, p); setMsg(r.error ?? null); return r; };
  useEffect(() => setMsg(null), [v.stepKey]);
  const enc = (x: Team) => v.players.find(p => p.id === v.encryptors?.[x]);

  return (
    <Shell v={v} online={online}>
      <div className="flex items-center gap-3">
        <ChBadge t={t} size="lg" />
        <div className="flex-1">
          <div className="text-sm font-bold tracking-[.14em]">{me.name} · CHANNEL {CH[t]}</div>
          <div className="label">{roleLabel(v)}</div>
        </div>
        <Tokens v={v} t={t} />
      </div>

      {me.role === 'encryptor' && <Encryptor v={v} run={run} />}
      {(me.role === 'decoder' || me.role === 'interceptor') && <CodeEntry v={v} run={run} key={v.stepKey} />}
      {me.role === 'waiting' && v.phase !== 'reveal' && v.phase !== 'tiebreak' && v.phase !== 'over' && <Waiting v={v} run={run} encName={enc(t)?.name} />}
      {v.phase === 'reveal' && <Reveal v={v} run={run} />}
      {v.phase === 'tiebreak' && <Tiebreak v={v} run={run} />}
      {v.phase === 'over' && <Over v={v} run={run} />}
      {msg && <p role="alert" className="mono text-[12px] text-[#B23A16]">{msg}</p>}

      <section className="flex flex-col gap-3 pt-2" aria-label="Note sheets">
        {/* the keypad above already is this sheet while decoding / intercepting */}
        {me.role !== 'decoder' && <>
          <div className="flex items-center gap-2"><ChBadge t={t} /><span className="label">YOUR KEYWORDS · PRIVATE</span></div>
          <NoteKeys v={v} t={t} words={v.secret?.keywords} />
        </>}
        {me.role !== 'interceptor' && <>
          <div className="flex items-center gap-2 pt-2"><ChBadge t={o} /><span className="label">CHANNEL {CH[o]} · INTERCEPTED CLUES</span></div>
          <NoteKeys v={v} t={o} words={v.reveal?.[o]} />
        </>}
        <div className="panel p-3 mt-2"><div className="label mb-2">TRANSMISSION LOG</div><Log v={v} /></div>
      </section>
    </Shell>
  );
}

function roleLabel(v: View) {
  const r = v.me!.role;
  if (r === 'encryptor') return 'ENCRYPTOR · EYES ONLY';
  if (r === 'decoder') return 'DECODER · RECONSTRUCT THE CODE';
  if (r === 'interceptor') return 'INTERCEPTOR · BREAK THEIR CODE';
  return statusLine(v);
}

type Run = (type: string, p?: object) => Promise<{ error?: string }>;

function Encryptor({ v, run }: { v: View; run: Run }) {
  const code = v.secret!.code!, words = v.secret!.keywords;
  const [clues, setClues] = useState<string[]>(() => [0, 1, 2].map(i => v.secret!.draft[i] ?? ''));
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const sand = useSandSeconds(v);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const edit = (i: number, s: string) => {
    const next = clues.map((c, j) => (j === i ? s.toUpperCase() : c));
    setClues(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => act('draft', { clues: next }), 300);
  };
  const ready = clues.every(c => c.trim());
  const transmit = async () => { setBusy(true); const r = await run('clues', { clues }); setBusy(false); if (r.error) setReview(false); };

  return (
    <div className="flex flex-col gap-4">
      <div className="screen p-5 flex flex-col gap-3">
        <div className="flex justify-between screen-text text-[11px] text-[#8A8C8E]"><span>ENCRYPTION TERMINAL</span><span>{v.transmitted[1 - v.me!.team!] ? 'OTHER CHANNEL SEALED' : 'EYES ONLY'}</span></div>
        <div className="flex items-center justify-between">
          <SegRow text={code.join('')} className="h-20" label={`Your code ${code.join(' ')}`} />
          {sand !== null && <div className="flex flex-col items-end gap-1"><span className="screen-text text-[10px] text-yellow">SAND</span><SegRow text={pad(sand)} color="var(--color-yellow)" className="h-9" /></div>}
        </div>
        <div className="screen-text text-[11px] text-[#8A8C8E]">ONE CLUE PER DIGIT, IN ORDER. YOUR TEAM HEARS EVERYTHING. SO DO THEY.</div>
      </div>
      <AnimatePresence mode="wait" initial={false}>
        {!review ? (
          <motion.form key="edit" className="flex flex-col gap-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onSubmit={e => { e.preventDefault(); if (ready) setReview(true); }}>
            {code.map((d, i) => (
              <label key={i} className="flex flex-col gap-1.5">
                <span className="flex justify-between"><span className="label">CHANNEL {pad(i + 1)}</span><span className="label">KEY {pad(d)} · <b className="text-char">{words[d - 1]}</b></span></span>
                <input className="field" value={clues[i]} maxLength={32} onChange={e => edit(i, e.target.value)} placeholder="CLUE" autoComplete="off" enterKeyHint={i < 2 ? 'next' : 'done'} />
              </label>
            ))}
            <Key on type="submit" disabled={!ready} className="min-h-13 py-3.5 font-bold tracking-[.16em] text-sm">REVIEW TRANSMISSION</Key>
          </motion.form>
        ) : (
          <motion.div key="review" className="flex flex-col gap-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <ol className="panel p-4 flex flex-col gap-2">
              {code.map((d, i) => (
                <li key={i} className="grid grid-cols-[auto_1fr_auto] gap-3 items-baseline">
                  <span className="label">CH {pad(i + 1)}</span><span className="mono font-bold text-[15px] break-all">{clues[i].trim()}</span><span className="label">{words[d - 1]}</span>
                </li>
              ))}
            </ol>
            <div className="grid grid-cols-[1fr_2fr] gap-3">
              <Key className="min-h-13 py-3.5 font-bold tracking-[.14em] text-[12px]" onClick={() => setReview(false)}>EDIT</Key>
              <Key on className="min-h-13 py-3.5 font-bold tracking-[.16em] text-sm" disabled={busy} onClick={transmit}>{busy ? 'TRANSMITTING' : 'TRANSMIT'}</Key>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CodeEntry({ v, run }: { v: View; run: Run }) {
  const me = v.me!, intercept = me.role === 'interceptor';
  const sheet = (intercept ? 1 - me.team! : me.team!) as Team;
  const locked = v.secret?.teamGuess;
  const [digits, setDigits] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const press = (d: number) => setDigits(x => (x.length < 3 && !x.includes(d) ? [...x, d] : x));
  const back = () => setDigits(x => x.slice(0, -1));
  const submit = async () => { if (digits.length !== 3 || busy) return; setBusy(true); await run('guess', { code: digits }); setBusy(false); };
  const keys = useRef({ press, back, submit }); keys.current = { press, back, submit };
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (/^[1-4]$/.test(e.key)) keys.current.press(Number(e.key));
      else if (e.key === 'Backspace') keys.current.back();
      else if (e.key === 'Enter') keys.current.submit();
    };
    addEventListener('keydown', f); return () => removeEventListener('keydown', f);
  }, []);
  const shown = locked ?? digits;

  return (
    <div className="flex flex-col gap-4">
      <div className="screen p-5 flex flex-col gap-4">
        <div className="flex justify-between screen-text text-[11px]">
          <span className={intercept ? 'text-orange' : 'text-blue'}>{intercept ? `SIGNAL DETECTED · CH ${CH[v.active]}` : 'INCOMING · YOUR CHANNEL'}</span>
          <span className="text-[#8A8C8E]">{locked ? 'CODE LOCKED' : intercept ? 'INTERCEPT' : 'DECODE'}</span>
        </div>
        <LiveClues v={v} />
        <div className="flex items-center gap-4 border-t border-[#2C2F32] pt-4">
          <span className="screen-text text-[11px] text-[#8A8C8E] w-14">{locked ? 'LOCKED' : 'INPUT'}</span>
          <SegRow text={[0, 1, 2].map(i => shown[i] ?? '_').join('')} className="h-14" color={locked ? 'var(--color-blue)' : undefined} label={`Entered ${shown.join(' ') || 'nothing'}`} />
        </div>
      </div>
      {locked ? (
        <div className="panel p-4 mono text-[12px] flex items-center gap-3"><Led c="orange" pulse />YOUR CHANNEL LOCKED {locked.join('-')}. WAITING FOR THE OTHER CHANNEL.</div>
      ) : (
        <>
          <div className="label">{intercept ? `TAP THE KEY EACH CLUE POINTS TO. THEIR PAST CLUES ARE UNDER EACH KEY.` : 'TAP THE KEYWORD EACH CLUE POINTS TO, IN ORDER. KEYS 1–4 WORK TOO.'}</div>
          <NoteKeys v={v} t={sheet} words={intercept ? null : v.secret?.keywords} onKey={press} picked={digits} />
          <p className="label">ONE LOCK PER CHANNEL. AGREE OUT LOUD BEFORE YOU PRESS.</p>
          {/* pinned to the bottom edge on phones so the lock stays under the thumb while scrolling the sheets */}
          <div className="grid grid-cols-[1fr_2fr] gap-3 sticky bottom-0 z-10 -mx-4 sm:mx-0 px-4 sm:px-0 pt-3 pb-[max(.75rem,env(safe-area-inset-bottom))] bg-ivory/95 border-t border-[#D2D1CB] sm:border-0 sm:static">
            <Key dark className="min-h-13 py-3.5 font-bold tracking-[.14em] text-[12px]" onClick={back} disabled={!digits.length}>BACK</Key>
            <Key on className="min-h-13 py-3.5 font-bold tracking-[.16em] text-sm" onClick={submit} disabled={digits.length !== 3 || busy}>
              {busy ? 'PROCESSING' : intercept ? 'LOCK INTERCEPT' : 'LOCK CODE'}
            </Key>
          </div>
        </>
      )}
    </div>
  );
}

function Waiting({ v, run, encName }: { v: View; run: Run; encName?: string }) {
  const me = v.me!, t = me.team as Team;
  const isEnc = v.encryptors?.[t] === me.id;
  const encOffline = v.players.find(p => p.id === v.encryptors?.[t])?.connected === false;
  const sand = useSandSeconds(v);
  let line = '';
  if (v.phase === 'encrypt') line = v.transmitted[t] ? (isEnc ? 'CLUES SEALED. WAITING FOR THE OTHER CHANNEL.' : 'YOUR CLUES ARE SEALED.') : `${encName} IS ENCODING YOUR TRANSMISSION.`;
  if (v.phase === 'guess') line = isEnc && v.active === t ? 'STAY SILENT. NO FACES, NO HINTS.' : !v.needsIntercept ? `LISTENING TO CHANNEL ${CH[v.active]}. NO INTERCEPTION IN ROUND 01.` : 'STANDING BY.';
  return (
    <div className="flex flex-col gap-3">
      <div className="screen p-5 flex flex-col gap-4">
        <div className="flex justify-between screen-text text-[11px] text-[#8A8C8E]"><Ticker text={statusLine(v)} className="text-orange" /><span>ROUND {pad(v.round)}</span></div>
        {v.secret?.code && (
          <div className="flex items-center gap-4"><span className="screen-text text-[11px] text-[#8A8C8E]">YOUR CODE</span><SegRow text={v.secret.code.join('')} className="h-10" /></div>
        )}
        {v.phase === 'guess' && v.live && <LiveClues v={v} />}
        {sand !== null && !v.transmitted[t] && <div className="flex items-center gap-3"><span className="screen-text text-[11px] text-yellow">SAND</span><SegRow text={pad(sand)} color="var(--color-yellow)" className="h-8" /></div>}
        <p className="screen-text text-sm">{line}</p>
      </div>
      {v.phase === 'encrypt' && encOffline && !v.transmitted[t] && (
        <Key on className="min-h-12 font-bold tracking-[.14em] text-[12px]" onClick={() => run('takeover')}>ENCRYPTOR OFFLINE · TAKE OVER</Key>
      )}
    </div>
  );
}

function Reveal({ v, run }: { v: View; run: Run }) {
  const h = v.history.at(-1)!, mine = h.team === v.me!.team;
  const verdict = h.interceptOk ? 'SIGNAL INTERCEPTED' : h.decodeOk ? 'COMMUNICATION SECURED' : 'SIGNAL COMPROMISED';
  return (
    <div className="flex flex-col gap-3">
      <motion.div className="screen p-5 flex flex-col gap-4" initial={{ scale: 0.98 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 20 }}>
        <div className="flex justify-between screen-text text-[11px] text-[#8A8C8E]"><span>CHANNEL {CH[h.team]} · CODE REVEALED</span><span>RND {pad(h.round)}</span></div>
        <div className="flex gap-1.5">{h.code.map((d, i) => <motion.div key={i} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.12 }}><Seg ch={String(d)} className="h-16" /></motion.div>)}</div>
        <motion.div className={`screen-text text-2xl ${h.interceptOk ? 'text-orange' : h.decodeOk ? 'text-blue' : 'text-yellow'}`}
          animate={h.interceptOk ? { opacity: [0, 1, 0.2, 1, 0.2, 1] } : { opacity: [0, 1] }} transition={{ duration: 0.7 }}>{verdict}</motion.div>
        <div className="screen-text text-[11px] flex flex-col gap-1">
          <span className={h.decodeOk ? 'text-blue' : 'text-yellow'}>{mine ? 'YOUR' : `CH ${CH[h.team]}`} DECODE {h.decode.join('-')} {h.decodeOk ? '· MATCH' : '· MISCOMMUNICATION TOKEN'}</span>
          {h.intercept && <span className={h.interceptOk ? 'text-orange' : 'text-[#8A8C8E]'}>{mine ? `CH ${CH[1 - h.team]}` : 'YOUR'} INTERCEPT {h.intercept.join('-')} {h.interceptOk ? '· INTERCEPTION TOKEN' : '· NO LOCK'}</span>}
        </div>
      </motion.div>
      <Key on className="min-h-13 py-3.5 font-bold tracking-[.16em] text-sm" onClick={() => run('advance', { key: v.stepKey })}>
        {v.active === 0 ? `CONTINUE · CHANNEL ${CH[1]}` : 'END ROUND'}
      </Key>
    </div>
  );
}

function Tiebreak({ v, run }: { v: View; run: Run }) {
  const t = v.me!.team!, o = (1 - t) as Team;
  const [w, setW] = useState(['', '', '', '']);
  const done = v.tiebreakIn[t];
  return (
    <form className="flex flex-col gap-3" onSubmit={e => { e.preventDefault(); run('tiebreak', { words: w }); }}>
      <div className="screen p-5 screen-text text-sm">{done ? 'GUESS SEALED. WAITING FOR CHANNEL ' + CH[o] + '.' : `SCORES LEVEL. AGREE ON CHANNEL ${CH[o]}'S FOUR KEYWORDS. EXACT WORD MATCHES COUNT.`}</div>
      {!done && <>
        {w.map((x, i) => (
          <label key={i} className="flex items-center gap-3"><span className="label w-14">KEY {pad(i + 1)}</span>
            <input className="field" value={x} onChange={e => setW(w.map((y, j) => (j === i ? e.target.value.toUpperCase() : y)))} placeholder="KEYWORD" /></label>
        ))}
        <Key on type="submit" disabled={w.some(x => !x.trim())} className="min-h-13 py-3.5 font-bold tracking-[.16em] text-sm">SEAL GUESS</Key>
      </>}
    </form>
  );
}

function Over({ v, run }: { v: View; run: Run }) {
  const r = v.result!, t = v.me!.team!;
  const won = r.winner === t;
  return (
    <div className="flex flex-col gap-3">
      <motion.div className="screen p-6 flex flex-col gap-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <Wordmark className="h-6 text-ivory" />
        <motion.div className={`screen-text text-3xl leading-tight ${won ? 'text-orange' : 'text-ivory'}`} initial={{ letterSpacing: '0.3em' }} animate={{ letterSpacing: '0.06em' }} transition={{ duration: 0.6 }}>
          {r.winner === null ? 'DEADLOCK' : won ? (r.reason === 'intercept' ? 'SIGNAL SUCCESSFULLY INTERCEPTED' : 'COMMUNICATION CHANNEL SECURED') : 'SIGNAL COMPROMISED'}
        </motion.div>
        <div className="screen-text text-[11px] text-[#8A8C8E]">{r.winner === null ? 'NO CHANNEL PREVAILS' : `CHANNEL ${CH[r.winner]} WINS`}</div>
      </motion.div>
      {v.host === v.me!.id
        ? <Key on className="min-h-13 py-3.5 font-bold tracking-[.16em] text-sm" onClick={() => run('rematch')}>RESET DEVICE · NEW GAME</Key>
        : <p className="label">THE HOST CAN RESET THE DEVICE FOR ANOTHER GAME.</p>}
    </div>
  );
}
