import express from 'express';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Server, type Socket } from 'socket.io';
import * as E from '../shared/engine';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = process.env.BLEEP_DATA ?? join(root, 'data');
const FILE = join(DATA, 'rooms.json');
const PORT = Number(process.env.PORT ?? 4410);
const LOBBY_GRACE_MS = Number(process.env.LOBBY_GRACE_MS ?? 20_000);
const ROOM_TTL_MS = 12 * 3600_000;

type Stored = E.Room & { touched: number };
const rooms = new Map<string, Stored>();
mkdirSync(DATA, { recursive: true });
if (existsSync(FILE)) {
  for (const r of JSON.parse(readFileSync(FILE, 'utf8')) as Stored[]) {
    r.players.forEach(p => (p.connected = false)); // sockets died with the old process
    rooms.set(r.code, r);
  }
}

let saveTimer: NodeJS.Timeout | null = null;
const save = () => {
  saveTimer ??= setTimeout(() => {
    saveTimer = null;
    const cutoff = Date.now() - ROOM_TTL_MS;
    for (const [k, r] of rooms) if (r.touched < cutoff) rooms.delete(k);
    writeFileSync(FILE + '.tmp', JSON.stringify([...rooms.values()]));
    renameSync(FILE + '.tmp', FILE);
  }, 250);
};

const app = express();
const server = createServer(app);
const io = new Server(server, { maxHttpBufferSize: 16_000, cors: process.env.NODE_ENV === 'production' ? undefined : { origin: true } });

app.get('/healthz', (_q, s) => { s.json({ ok: true, rooms: rooms.size }); });
const dist = join(root, 'dist');
if (existsSync(dist)) {
  app.use(express.static(dist, { maxAge: '1h', index: false }));
  app.get(/.*/, (_q, s) => s.sendFile(join(dist, 'index.html')));
}

interface Seat { room: string; pid: string | null }
const seat = (s: Socket) => s.data as Seat;

async function broadcast(room: Stored) {
  room.touched = Date.now();
  save();
  armSand(room);
  for (const s of await io.in(room.code).fetchSockets()) s.emit('state', E.view(room, (s.data as Seat).pid));
}

const sandTimers = new Map<string, NodeJS.Timeout>();
function armSand(room: Stored) {
  const at = room.game?.phase === 'encrypt' ? room.game.sandEndsAt : null;
  clearTimeout(sandTimers.get(room.code));
  if (at === null) return void sandTimers.delete(room.code);
  sandTimers.set(room.code, setTimeout(() => { if (E.expireSand(room, Date.now())) broadcast(room); }, Math.max(0, at - Date.now()) + 50));
}
rooms.forEach(armSand);

const newCode = () => { let c; do c = E.roomCode(Math.random); while (rooms.has(c)); return c; };
const clean = (v: unknown) => String(v ?? '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
type Ack = (r: unknown) => void;

io.on('connection', socket => {
  socket.data = { room: '', pid: null } satisfies Seat;

  const handle = (fn: (...a: any[]) => unknown) => (payload: any, ack?: Ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    try { reply({ ok: true, ...(fn(payload ?? {}) as object) }); }
    catch (e) {
      if (e instanceof E.RuleError) return reply({ error: e.message });
      console.error(e);
      reply({ error: 'Device fault. Try again.' });
    }
  };

  const enter = (room: Stored, pid: string | null) => {
    socket.data = { room: room.code, pid } satisfies Seat;
    socket.join(room.code);
    broadcast(room);
  };
  const current = () => rooms.get(seat(socket).room) ?? (() => { throw new E.RuleError('Not connected to a room.'); })();

  socket.on('create', handle(({ name }) => {
    const room: Stored = { ...E.createRoom(newCode()), touched: Date.now() };
    const pid = randomUUID(), token = randomUUID();
    E.join(room, pid, token, name);
    rooms.set(room.code, room);
    enter(room, pid);
    return { room: room.code, token };
  }));

  socket.on('join', handle(({ room: code, name }) => {
    const room = rooms.get(clean(code)) ?? (() => { throw new E.RuleError('No device broadcasting on that code.'); })();
    const pid = randomUUID(), token = randomUUID();
    E.join(room, pid, token, name);
    enter(room, pid);
    return { room: room.code, token };
  }));

  socket.on('resume', handle(({ room: code, token }) => {
    const room = rooms.get(clean(code)) ?? (() => { throw new E.RuleError('That room has closed.'); })();
    const p = E.reconnect(room, String(token));
    enter(room, p.id);
    return { room: room.code };
  }));

  socket.on('watch', handle(({ room: code }) => {
    const room = rooms.get(clean(code)) ?? (() => { throw new E.RuleError('No device broadcasting on that code.'); })();
    enter(room, null);
    return { room: room.code };
  }));

  socket.on('act', handle(({ type, ...a }) => {
    const room = current();
    const pid = seat(socket).pid ?? (() => { throw new E.RuleError('The console is read-only.'); })();
    const now = Date.now();
    switch (type) {
      case 'team': E.setTeam(room, pid, a.team); break;
      case 'start': E.start(room, pid, Math.random); break;
      case 'clues': E.submitClues(room, pid, a.clues, now); break;
      case 'draft': E.saveDraft(room, pid, a.clues); return {}; // private, no broadcast needed
      case 'takeover': E.takeOver(room, pid); break;
      case 'guess': E.submitGuess(room, pid, a.code); break;
      case 'advance': E.advance(room, pid, a.key, Math.random); break;
      case 'tiebreak': E.submitTiebreak(room, pid, a.words); break;
      case 'rematch': E.rematch(room, pid); break;
      case 'leave': E.disconnect(room, pid); E.drop(room, pid); socket.leave(room.code); socket.data = { room: '', pid: null }; break;
      default: throw new E.RuleError('Unknown control.');
    }
    broadcast(room);
    return {};
  }));

  socket.on('disconnect', async () => {
    const { room: code, pid } = seat(socket);
    const room = rooms.get(code);
    if (!room || !pid) return;
    // another tab of the same device may still be attached
    if ((await io.in(code).fetchSockets()).some(s => (s.data as Seat).pid === pid)) return;
    E.disconnect(room, pid);
    broadcast(room);
    if (!room.game) setTimeout(() => { E.drop(room, pid); broadcast(room); }, LOBBY_GRACE_MS);
  });
});

server.listen(PORT, () => console.log(`BLEEP / SYSTEM 004 listening on :${PORT}`));
export { server, io };
