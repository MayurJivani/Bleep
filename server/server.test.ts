import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { View } from '../shared/engine';

process.env.PORT = '4499';
process.env.BLEEP_DATA = mkdtempSync(join(tmpdir(), 'bleep-'));
process.env.LOBBY_GRACE_MS = '200';
const URL = 'http://localhost:4499';

let srv: typeof import('./index');
const clients: Socket[] = [];
beforeAll(async () => { srv = await import('./index'); });
afterAll(() => { clients.forEach(c => c.close()); srv.io.close(); srv.server.close(); });

class Device {
  s: Socket; v!: View; token = ''; room = '';
  private waiters: ((v: View) => void)[] = [];
  constructor() {
    this.s = connect(URL, { transports: ['websocket'], forceNew: true });
    clients.push(this.s);
    this.s.on('state', (v: View) => { this.v = v; this.waiters.splice(0).forEach(w => w(v)); });
  }
  call(ev: string, p: object): Promise<any> { return new Promise(r => this.s.emit(ev, p, r)); }
  act(type: string, p: object = {}) { return this.call('act', { type, ...p }); }
  next() { return new Promise<View>(r => this.waiters.push(r)); }
  async until(f: (v: View) => boolean) { while (!this.v || !f(this.v)) await this.next(); return this.v; }
}

async function lobby() {
  const host = new Device();
  const r = await host.call('create', { name: 'host' });
  host.token = r.token; host.room = r.room;
  const others = [new Device(), new Device(), new Device()];
  for (const [i, d] of others.entries()) { const j = await d.call('join', { room: r.room.toLowerCase(), name: `op${i}` }); d.token = j.token; d.room = r.room; }
  const all = [host, ...others];
  for (const [i, d] of all.entries()) expect(await d.act('team', { team: i % 2 })).toEqual({ ok: true });
  return all;
}

describe('multiplayer over sockets', () => {
  it('plays a transmission with private state isolated per device', async () => {
    const all = await lobby();
    const screen = new Device();
    await screen.call('watch', { room: all[0].room });
    expect(await all[1].act('start')).toMatchObject({ error: /host/ });
    expect(await all[0].act('start')).toEqual({ ok: true });
    const views = await Promise.all(all.map(d => d.until(v => v.phase === 'encrypt')));
    await screen.until(v => v.phase === 'encrypt');

    const kwA = views[0].secret!.keywords, kwB = views[1].secret!.keywords;
    expect(views[2].secret!.keywords).toEqual(kwA);
    const enc = (t: number) => all.find(d => d.v.me!.id === d.v.encryptors![t])!;
    const encA = enc(0), encB = enc(1);
    const code = encA.v.secret!.code!;
    expect(code).toHaveLength(3);
    for (const d of all.filter(d => d !== encA)) expect(d.v.secret!.code).not.toEqual(code);
    for (const d of all.filter(d => d.v.me!.team === 1)) for (const w of kwA) expect(JSON.stringify(d.v)).not.toContain(`"${w}"`);
    for (const w of [...kwA, ...kwB]) expect(JSON.stringify(screen.v)).not.toContain(`"${w}"`);
    expect(await screen.act('start')).toMatchObject({ error: /read-only/ });

    expect(await encA.act('clues', { clues: ['night', 'nature', 'value'] })).toEqual({ ok: true });
    expect(await encB.act('clues', { clues: ['x', 'y', 'z'] })).toEqual({ ok: true });
    await screen.until(v => v.phase === 'guess');
    expect(screen.v.live).toEqual(['NIGHT', 'NATURE', 'VALUE']);

    // two teammates press submit at the same instant: exactly one lands
    const mates = all.filter(d => d.v.me!.team === 0 && d !== encA);
    const extra = new Device();
    extra.s.emit('resume', { room: mates[0].room, token: mates[0].token }, () => {});
    await extra.until(v => v.phase === 'guess');
    const res = await Promise.all([mates[0].act('guess', { code }), extra.act('guess', { code })]);
    expect(res.filter(r => r.ok)).toHaveLength(1);
    expect(res.filter(r => r.error)).toHaveLength(1);
    const after = await screen.until(v => v.phase === 'reveal');
    expect(after.history[0]).toMatchObject({ code, decodeOk: true });
    expect(await screen.act('advance', { key: after.stepKey })).toMatchObject({ error: /read-only/ });
  });

  it('reconnects a dropped device to its seat and secrets', async () => {
    const all = await lobby();
    await all[0].act('start');
    await all[3].until(v => v.phase === 'encrypt');
    const before = all[3].v;
    all[3].s.close();
    await all[0].until(v => v.players.find(p => p.id === before.me!.id)!.connected === false);
    const back = new Device();
    const r = await back.call('resume', { room: all[3].room, token: all[3].token });
    expect(r).toMatchObject({ ok: true });
    const v = await back.until(v => v.me?.id === before.me!.id);
    expect(v.secret!.keywords).toEqual(before.secret!.keywords);
    expect(await new Device().call('resume', { room: all[3].room, token: 'forged' })).toMatchObject({ error: /not recognised/ });
  });

  it('frees a lobby seat after the grace period and moves host', async () => {
    const all = await lobby();
    const hostId = all[0].v.me!.id;
    all[0].s.close();
    const v = await all[1].until(v => !v.players.some(p => p.id === hostId));
    expect(v.host).toBe(v.players[0].id);
  });
});
