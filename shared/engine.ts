import { WORDS } from './words';

export type Team = 0 | 1;
export type Code = number[]; // three distinct digits 1-4
export type Rng = () => number;
export type Phase = 'lobby' | 'encrypt' | 'guess' | 'reveal' | 'tiebreak' | 'over';

export const ROUNDS = 8;
export const SAND_MS = 30_000;
export const MIN_TEAM = 2;

export interface Player { id: string; token: string; name: string; team: Team | null; connected: boolean }

export interface Transmission {
  round: number; team: Team; clues: string[]; code: Code;
  decode: Code; intercept: Code | null; decodeOk: boolean; interceptOk: boolean;
}

export interface Game {
  round: number;
  phase: Phase;
  active: Team;
  keywords: [string[], string[]];
  encryptors: [string, string];
  codes: [Code, Code];
  clues: [string[] | null, string[] | null];
  drafts: [string[], string[]];
  sandEndsAt: number | null;
  decode: Code | null;
  intercept: Code | null;
  tokens: { intercept: [number, number]; miss: [number, number] };
  history: Transmission[];
  tiebreak: [string[] | null, string[] | null];
  result: { winner: Team | null; reason: string; tiebreak?: [number, number] } | null;
}

export interface Room { code: string; host: string | null; players: Player[]; game: Game | null }

export class RuleError extends Error {}
const fail = (msg: string): never => { throw new RuleError(msg); };

const pick = <T>(arr: T[], n: number, rng: Rng): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, n);
};
export const drawCode = (rng: Rng): Code => pick([1, 2, 3, 4], 3, rng);
export const drawKeywords = (rng: Rng): [string[], string[]] => {
  const w = pick(WORDS, 8, rng);
  return [w.slice(0, 4), w.slice(4)];
};

const ROOM_ALPHABET = 'BCDFGHJKLMNPQRSTVWXZ';
export const roomCode = (rng: Rng) => Array.from({ length: 4 }, () => ROOM_ALPHABET[Math.floor(rng() * ROOM_ALPHABET.length)]).join('');

export const members = (room: Room, t: Team) => room.players.filter(p => p.team === t);
const player = (room: Room, id: string) => room.players.find(p => p.id === id) ?? fail('Unknown player.');
const game = (room: Room) => room.game ?? fail('Game has not started.');
const sameCode = (a: Code, b: Code) => a.length === b.length && a.every((d, i) => d === b[i]);

export function validCode(c: unknown): Code {
  if (!Array.isArray(c) || c.length !== 3 || !c.every(d => Number.isInteger(d) && d >= 1 && d <= 4) || new Set(c).size !== 3)
    fail('A code is three different digits from 1 to 4.');
  return c as Code;
}

export function createRoom(code: string): Room { return { code, host: null, players: [], game: null }; }

export function join(room: Room, id: string, token: string, rawName: unknown): Player {
  const name = String(rawName ?? '').trim().toUpperCase().slice(0, 14);
  if (!name) fail('Enter a call sign.');
  if (room.game) fail('Transmission already in progress. Rejoin from the device you started on.');
  if (room.players.length >= 12) fail('Room is full.');
  if (room.players.some(p => p.name === name)) fail('That call sign is taken.');
  const p: Player = { id, token, name, team: null, connected: true };
  room.players.push(p);
  room.host ??= id;
  return p;
}

export function reconnect(room: Room, token: string): Player {
  const p = room.players.find(x => x.token === token) ?? fail('Device not recognised in this room.');
  p.connected = true;
  if (!room.host || !player(room, room.host).connected) room.host = p.id;
  return p;
}

export function disconnect(room: Room, id: string) {
  const p = room.players.find(x => x.id === id);
  if (!p) return;
  p.connected = false;
  if (room.host === id) room.host = room.players.find(x => x.connected)?.id ?? id;
}

/** Lobby seats of devices that never came back are freed; in-game seats are kept for reconnection. */
export function drop(room: Room, id: string) {
  if (room.game || room.players.find(p => p.id === id)?.connected !== false) return;
  room.players = room.players.filter(p => p.id !== id);
  if (room.host === id) room.host = room.players.find(x => x.connected)?.id ?? room.players[0]?.id ?? null;
}

export function setTeam(room: Room, id: string, team: unknown) {
  if (room.game) fail('Channels are locked once the game starts.');
  if (team !== 0 && team !== 1 && team !== null) fail('Pick channel A or B.');
  player(room, id).team = team as Team | null;
}

function startRound(g: Game, room: Room, rng: Rng) {
  const enc = (t: Team) => { const m = members(room, t); return m[(g.round - 1) % m.length].id; };
  Object.assign(g, {
    phase: 'encrypt', active: 0, encryptors: [enc(0), enc(1)], codes: [drawCode(rng), drawCode(rng)],
    clues: [null, null], drafts: [[], []], sandEndsAt: null, decode: null, intercept: null,
  });
}

export function start(room: Room, id: string, rng: Rng) {
  if (room.host !== id) fail('Only the host can start.');
  if (room.game) fail('Already started.');
  if (room.players.some(p => p.team === null)) fail('Everyone needs a channel.');
  if (members(room, 0).length < MIN_TEAM || members(room, 1).length < MIN_TEAM) fail(`Each channel needs at least ${MIN_TEAM} operators.`);
  const g = {
    round: 1, keywords: drawKeywords(rng), tokens: { intercept: [0, 0], miss: [0, 0] }, history: [],
    tiebreak: [null, null], result: null,
  } as unknown as Game;
  startRound(g, room, rng);
  room.game = g;
}

const cleanClue = (c: unknown) => String(c ?? '').replace(/\s+/g, ' ').trim().toUpperCase().slice(0, 32);

function lockClues(g: Game, t: Team, clues: string[]) {
  g.clues[t] = clues;
  if (g.clues[0] && g.clues[1]) { g.phase = 'guess'; g.active = 0; g.sandEndsAt = null; }
}

export function submitClues(room: Room, id: string, raw: unknown, now: number) {
  const g = game(room);
  if (g.phase !== 'encrypt') fail('Not accepting clues now.');
  const t = player(room, id).team as Team;
  if (g.encryptors[t] !== id) fail('Only this round\'s encryptor transmits.');
  if (g.clues[t]) fail('Clues already transmitted.');
  if (!Array.isArray(raw) || raw.length !== 3) fail('Transmit exactly three clues.');
  const clues = (raw as unknown[]).map(cleanClue);
  if (clues.some(c => !c)) fail('Every channel needs a clue.');
  if (clues.some(c => g.keywords[t].includes(c))) fail('A clue cannot be one of your keywords.');
  lockClues(g, t, clues);
  if (g.phase === 'encrypt') g.sandEndsAt = now + SAND_MS;
}

export function saveDraft(room: Room, id: string, raw: unknown) {
  const g = game(room);
  const t = player(room, id).team as Team;
  if (g.phase !== 'encrypt' || g.encryptors[t] !== id || g.clues[t] || !Array.isArray(raw)) return;
  g.drafts[t] = raw.slice(0, 3).map(cleanClue);
}

/** Sand ran out: the late encryptor transmits whatever is on the sheet. */
export function expireSand(room: Room, now: number): boolean {
  const g = room.game;
  if (!g || g.phase !== 'encrypt' || g.sandEndsAt === null || now < g.sandEndsAt) return false;
  const t: Team = g.clues[0] ? 1 : 0;
  lockClues(g, t, [0, 1, 2].map(i => (g.keywords[t].includes(g.drafts[t][i]) ? '' : g.drafts[t][i]) || '—'));
  return true;
}

export function takeOver(room: Room, id: string) {
  const g = game(room);
  const t = player(room, id).team as Team;
  if (g.phase !== 'encrypt' || g.clues[t]) fail('Nothing to take over.');
  if (player(room, g.encryptors[t]).connected) fail('Your encryptor is still connected.');
  g.encryptors[t] = id;
}

const needsIntercept = (g: Game) => g.round > 1;

export function submitGuess(room: Room, id: string, raw: unknown) {
  const g = game(room);
  if (g.phase !== 'guess') fail('Not accepting codes now.');
  const t = player(room, id).team as Team;
  const code = validCode(raw);
  if (t === g.active) {
    if (g.encryptors[t] === id) fail('The encryptor stays silent.');
    if (g.decode) fail('Your channel already locked a code.');
    g.decode = code;
  } else {
    if (!needsIntercept(g)) fail('No interceptions in round 1.');
    if (g.intercept) fail('Your channel already locked an interception.');
    g.intercept = code;
  }
  if (g.decode && (g.intercept || !needsIntercept(g))) resolve(g);
}

function resolve(g: Game) {
  const t = g.active, o = (1 - t) as Team, code = g.codes[t];
  const decodeOk = sameCode(g.decode!, code);
  const interceptOk = !!g.intercept && sameCode(g.intercept, code);
  if (interceptOk) g.tokens.intercept[o]++;
  if (!decodeOk) g.tokens.miss[t]++;
  g.history.push({ round: g.round, team: t, clues: g.clues[t]!, code, decode: g.decode!, intercept: g.intercept, decodeOk, interceptOk });
  g.phase = 'reveal';
}

export const stepKey = (g: Game) => `${g.round}.${g.active}.${g.phase}`;

/** Any operator acknowledges the reveal; the key stops a double tap from skipping a step. */
export function advance(room: Room, id: string, key: unknown, rng: Rng) {
  const g = game(room);
  if (player(room, id).team === null) fail('Spectators cannot advance.');
  if (g.phase !== 'reveal' || key !== stepKey(g)) fail('Already advanced.');
  if (g.active === 0) { g.active = 1; g.phase = 'guess'; g.decode = g.intercept = null; return; }
  endRound(g, room, rng);
}

function endRound(g: Game, room: Room, rng: Rng) {
  const { intercept, miss } = g.tokens;
  const wins = ([0, 1] as Team[]).filter(t => intercept[t] >= 2 || miss[1 - t] >= 2);
  if (wins.length === 1) {
    const w = wins[0];
    g.phase = 'over';
    g.result = { winner: w, reason: intercept[w] >= 2 ? 'intercept' : 'miscommunication' };
  } else if (wins.length === 2 || g.round >= ROUNDS) {
    const score = (t: Team) => intercept[t] - miss[t];
    if (score(0) !== score(1)) { g.phase = 'over'; g.result = { winner: score(0) > score(1) ? 0 : 1, reason: 'score' }; }
    else g.phase = 'tiebreak';
  } else {
    g.round++;
    startRound(g, room, rng);
  }
}

export function submitTiebreak(room: Room, id: string, raw: unknown) {
  const g = game(room);
  if (g.phase !== 'tiebreak') fail('No tiebreak in progress.');
  const t = player(room, id).team ?? fail('Spectators cannot guess.');
  if (g.tiebreak[t]) fail('Your channel already submitted.');
  if (!Array.isArray(raw) || raw.length !== 4) fail('Guess all four keywords.');
  g.tiebreak[t] = (raw as unknown[]).map(cleanClue);
  if (g.tiebreak[0] && g.tiebreak[1]) {
    const hits = ([0, 1] as Team[]).map(x => g.tiebreak[x]!.filter((w, i) => w === g.keywords[1 - x][i]).length) as [number, number];
    g.phase = 'over';
    g.result = { winner: hits[0] === hits[1] ? null : hits[0] > hits[1] ? 0 : 1, reason: 'tiebreak', tiebreak: hits };
  }
}

export function rematch(room: Room, id: string) {
  if (room.host !== id) fail('Only the host can reset the device.');
  if (room.game?.phase !== 'over') fail('Game still running.');
  room.game = null;
}

// ---------- Serialization: the only way state leaves the server ----------

export type Role = 'encryptor' | 'decoder' | 'interceptor' | 'waiting' | 'console';

export interface View {
  room: string; phase: Phase; host: string | null; me: { id: string; name: string; team: Team | null; role: Role } | null;
  players: { id: string; name: string; team: Team | null; connected: boolean }[];
  round: number; active: Team; stepKey: string;
  encryptors: [string, string] | null; transmitted: [boolean, boolean]; sandEndsAt: number | null;
  live: string[] | null; // clues of the transmission being decoded
  locked: { decode: boolean; intercept: boolean };
  needsIntercept: boolean;
  tokens: Game['tokens'];
  history: Transmission[];
  result: Game['result']; tiebreakIn: [boolean, boolean];
  secret: { keywords: string[]; code: Code | null; draft: string[]; myClues: string[] | null; teamGuess: Code | null } | null;
  reveal: [string[], string[]] | null;
}

export function view(room: Room, id: string | null): View {
  const g = room.game;
  const me = id ? room.players.find(p => p.id === id) ?? null : null;
  const t = me?.team ?? null;
  let role: Role = 'console';
  if (me) {
    role = 'waiting';
    if (g?.phase === 'encrypt' && t !== null && g.encryptors[t] === me.id && !g.clues[t]) role = 'encryptor';
    if (g?.phase === 'guess' && t !== null) {
      if (t === g.active && g.encryptors[t] !== me.id) role = 'decoder';
      if (t !== g.active && needsIntercept(g)) role = 'interceptor';
    }
  }
  const showLive = g && (g.phase === 'guess' || g.phase === 'reveal');
  const isEnc = !!(g && t !== null && g.encryptors[t] === me?.id);
  // The encryptor holds the card until it is revealed in history.
  const codeHidden = g && t !== null && g.history.some(h => h.round === g.round && h.team === t);
  return {
    room: room.code, phase: g?.phase ?? 'lobby', host: room.host,
    me: me ? { id: me.id, name: me.name, team: t, role } : null,
    players: room.players.map(({ id, name, team, connected }) => ({ id, name, team, connected })),
    round: g?.round ?? 0, active: g?.active ?? 0, stepKey: g ? stepKey(g) : '',
    encryptors: g ? [...g.encryptors] as [string, string] : null,
    transmitted: g ? [!!g.clues[0], !!g.clues[1]] : [false, false],
    sandEndsAt: g?.sandEndsAt ?? null,
    live: showLive ? [...g.clues[g.active]!] : null,
    locked: { decode: !!g?.decode, intercept: !!g?.intercept },
    needsIntercept: !!g && needsIntercept(g),
    tokens: g ? structuredClone(g.tokens) : { intercept: [0, 0], miss: [0, 0] },
    history: g ? structuredClone(g.history) : [],
    result: g?.result ?? null,
    tiebreakIn: g ? [!!g.tiebreak[0], !!g.tiebreak[1]] : [false, false],
    secret: g && t !== null ? {
      keywords: [...g.keywords[t]],
      code: isEnc && !codeHidden ? [...g.codes[t]] : null,
      draft: isEnc && g.phase === 'encrypt' ? [...g.drafts[t]] : [],
      myClues: isEnc && g.clues[t] ? [...g.clues[t]!] : null,
      teamGuess: g.phase === 'guess' ? (t === g.active ? g.decode : g.intercept) : null,
    } : null,
    reveal: g?.phase === 'over' ? [[...g.keywords[0]], [...g.keywords[1]]] : null,
  };
}
