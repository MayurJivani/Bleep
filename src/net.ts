import { io } from 'socket.io-client';
import { useEffect, useState } from 'react';
import type { View } from '../shared/engine';

export const socket = io({ autoConnect: true });
export type Reply = { ok?: true; error?: string; room?: string; token?: string };
export const call = (ev: string, p: object) => new Promise<Reply>(r => socket.emit(ev, p, r));
export const act = (type: string, p: object = {}) => call('act', { type, ...p });

export const tokenFor = (room: string) => localStorage.getItem(`bleep:${room}`);
export const saveToken = (room: string, t: string) => localStorage.setItem(`bleep:${room}`, t);
export const go = (path: string) => { history.pushState(null, '', path); dispatchEvent(new PopStateEvent('popstate')); };

export function usePath() {
  const [p, set] = useState(location.pathname);
  useEffect(() => { const f = () => set(location.pathname); addEventListener('popstate', f); return () => removeEventListener('popstate', f); }, []);
  return p;
}

/** Attaches this tab to a room as a seat (token) or as the read-only console, re-attaching after every reconnect. */
export function useRoom(room: string, mode: 'console' | 'seat') {
  const [view, setView] = useState<View | null>(null);
  const [online, setOnline] = useState(socket.connected);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState(() => tokenFor(room));

  useEffect(() => {
    const attach = async () => {
      setOnline(true);
      if (mode === 'console') { const r = await call('watch', { room }); setError(r.error ?? null); return; }
      if (!token) return;
      const r = await call('resume', { room, token });
      if (r.error) { localStorage.removeItem(`bleep:${room}`); setToken(null); setError(r.error); }
    };
    const down = () => setOnline(false);
    socket.on('state', setView);
    socket.on('connect', attach);
    socket.on('disconnect', down);
    if (socket.connected) attach();
    return () => { socket.off('state', setView); socket.off('connect', attach); socket.off('disconnect', down); };
  }, [room, mode, token]);

  const join = async (name: string) => {
    const r = await call('join', { room, name });
    if (r.token) { saveToken(r.room!, r.token); setToken(r.token); setError(null); }
    return r;
  };
  return { view, online, error, token, join };
}
