import { describe, it, expect } from 'vitest';
import * as E from './engine';
import { WORDS } from './words';

const seeded = (s = 7): E.Rng => () => ((s = (s * 16807) % 2147483647) / 2147483647);

function setup(perTeam = 2) {
  const room = E.createRoom('TEST');
  for (let i = 0; i < perTeam * 2; i++) {
    E.join(room, `p${i}`, `tok${i}`, `op${i}`);
    E.setTeam(room, `p${i}`, (i % 2) as E.Team);
  }
  E.start(room, 'p0', seeded());
  return room;
}
const g = (r: E.Room) => r.game!;
const teammate = (r: E.Room, t: E.Team) => E.members(r, t).find(p => p.id !== g(r).encryptors[t])!.id;
const wrong = (c: E.Code): E.Code => [c[1], c[0], c[2]];
const encryptBoth = (r: E.Room, now = 0) => ([0, 1] as E.Team[]).forEach(t => E.submitClues(r, g(r).encryptors[t], [`a${t}`, `b${t}`, `c${t}`], now));

/** Play one half-round. decodeOk / intercept decide what is guessed. */
function half(r: E.Room, decodeOk: boolean, interceptOk: boolean | null) {
  const t = g(r).active, code = g(r).codes[t];
  if (interceptOk !== null) E.submitGuess(r, E.members(r, (1 - t) as E.Team)[0].id, interceptOk ? code : wrong(code));
  E.submitGuess(r, teammate(r, t), decodeOk ? code : wrong(code));
  expect(g(r).phase).toBe('reveal');
  E.advance(r, 'p0', E.stepKey(g(r)), seeded());
}
const round = (r: E.Room, d: [boolean, boolean], i: [boolean | null, boolean | null]) => { encryptBoth(r); half(r, d[0], i[0]); half(r, d[1], i[1]); };

describe('setup', () => {
  it('assigns teams and requires two operators per channel', () => {
    const room = E.createRoom('X');
    E.join(room, 'a', 't1', 'ann'); E.join(room, 'b', 't2', 'bob'); E.join(room, 'c', 't3', 'cy');
    expect(() => E.join(room, 'd', 't4', 'ANN')).toThrow(/taken/);
    expect(room.host).toBe('a');
    E.setTeam(room, 'a', 0); E.setTeam(room, 'b', 1);
    expect(() => E.start(room, 'a', seeded())).toThrow(/channel/);
    E.setTeam(room, 'c', 0);
    expect(() => E.start(room, 'a', seeded())).toThrow(/at least 2/);
    expect(() => E.start(room, 'b', seeded())).toThrow(/host/);
    E.join(room, 'd', 't4', 'dee'); E.setTeam(room, 'd', 1);
    E.start(room, 'a', seeded());
    expect(() => E.setTeam(room, 'a', 1)).toThrow(/locked/);
    expect(() => E.join(room, 'e', 't5', 'eve')).toThrow(/in progress/);
  });

  it('draws 8 distinct curated keywords and valid codes', () => {
    for (let s = 1; s < 50; s++) {
      const [a, b] = E.drawKeywords(seeded(s));
      expect(new Set([...a, ...b]).size).toBe(8);
      [...a, ...b].forEach(w => expect(WORDS).toContain(w));
      expect(() => E.validCode(E.drawCode(seeded(s)))).not.toThrow();
    }
    expect(new Set(WORDS).size).toBe(WORDS.length);
  });

  it('rotates encryptors each round through the channel', () => {
    const r = setup(3);
    const first = [...g(r).encryptors];
    expect(first).toEqual([E.members(r, 0)[0].id, E.members(r, 1)[0].id]);
    round(r, [true, true], [null, null]);
    expect(g(r).encryptors).toEqual([E.members(r, 0)[1].id, E.members(r, 1)[1].id]);
  });
});

describe('transmission', () => {
  it('only the encryptor transmits, once, three non-keyword clues', () => {
    const r = setup();
    const [e0] = g(r).encryptors;
    expect(() => E.submitClues(r, teammate(r, 0), ['a', 'b', 'c'], 0)).toThrow(/encryptor/);
    expect(() => E.submitClues(r, e0, ['a', 'b'], 0)).toThrow(/three/);
    expect(() => E.submitClues(r, e0, ['a', ' ', 'c'], 0)).toThrow(/needs a clue/);
    expect(() => E.submitClues(r, e0, ['a', g(r).keywords[0][1].toLowerCase(), 'c'], 0)).toThrow(/keywords/);
    E.submitClues(r, e0, ['night', 'nature', 'value'], 1000);
    expect(g(r).clues[0]).toEqual(['NIGHT', 'NATURE', 'VALUE']);
    expect(g(r).sandEndsAt).toBe(1000 + E.SAND_MS);
    expect(() => E.submitClues(r, e0, ['x', 'y', 'z'], 0)).toThrow(/already/);
    expect(() => E.submitGuess(r, teammate(r, 0), g(r).codes[0])).toThrow(/Not accepting/);
  });

  it('sand timer transmits the late draft', () => {
    const r = setup();
    E.submitClues(r, g(r).encryptors[0], ['a', 'b', 'c'], 0);
    E.saveDraft(r, g(r).encryptors[1], ['river', '']);
    expect(E.expireSand(r, E.SAND_MS - 1)).toBe(false);
    expect(E.expireSand(r, E.SAND_MS)).toBe(true);
    expect(g(r).clues[1]).toEqual(['RIVER', '—', '—']);
    expect(g(r).phase).toBe('guess');
  });

  it('a teammate can take over from a disconnected encryptor only', () => {
    const r = setup();
    const mate = teammate(r, 0);
    expect(() => E.takeOver(r, mate)).toThrow(/still connected/);
    E.disconnect(r, g(r).encryptors[0]);
    E.takeOver(r, mate);
    expect(g(r).encryptors[0]).toBe(mate);
    expect(E.view(r, mate).secret!.code).toEqual(g(r).codes[0]);
  });
});

describe('decoding and interception', () => {
  it('round 1: no interceptions, decode alone resolves', () => {
    const r = setup();
    encryptBoth(r);
    expect(() => E.submitGuess(r, E.members(r, 1)[0].id, g(r).codes[0])).toThrow(/round 1/);
    expect(() => E.submitGuess(r, g(r).encryptors[0], g(r).codes[0])).toThrow(/silent/);
    expect(() => E.submitGuess(r, teammate(r, 0), [1, 1, 2])).toThrow(/different/);
    expect(() => E.submitGuess(r, teammate(r, 0), [0, 1, 2])).toThrow(/1 to 4/);
    E.submitGuess(r, teammate(r, 0), g(r).codes[0]);
    expect(g(r).phase).toBe('reveal');
    expect(g(r).history[0]).toMatchObject({ decodeOk: true, interceptOk: false, intercept: null });
  });

  it('correct decode: no token; wrong decode: miscommunication', () => {
    const r = setup();
    round(r, [true, false], [null, null]);
    expect(g(r).tokens).toEqual({ intercept: [0, 0], miss: [0, 1] });
  });

  it('round 2+: both guesses needed; correct intercept scores, wrong one is free', () => {
    const r = setup();
    round(r, [true, true], [null, null]);
    encryptBoth(r);
    E.submitGuess(r, teammate(r, 0), g(r).codes[0]);
    expect(g(r).phase).toBe('guess'); // waiting on interception
    E.submitGuess(r, E.members(r, 1)[0].id, g(r).codes[0]);
    expect(g(r).tokens.intercept).toEqual([0, 1]);
    E.advance(r, 'p1', E.stepKey(g(r)), seeded());
    half(r, true, false);
    expect(g(r).tokens).toEqual({ intercept: [0, 1], miss: [0, 0] });
  });

  it('duplicate submissions and stale advances are rejected', () => {
    const r = setup();
    encryptBoth(r);
    const [m] = [teammate(r, 0)];
    E.submitGuess(r, m, g(r).codes[0]);
    expect(() => E.submitGuess(r, m, g(r).codes[0])).toThrow();
    const key = E.stepKey(g(r));
    E.advance(r, 'p0', key, seeded());
    expect(() => E.advance(r, 'p1', key, seeded())).toThrow(/Already/);
    expect(g(r).active).toBe(1);
  });
});

describe('end of game', () => {
  it('two interceptions win at the end of the round', () => {
    const r = setup();
    round(r, [true, true], [null, null]);
    round(r, [true, true], [true, false]);
    round(r, [true, true], [true, false]);
    expect(g(r).result).toEqual({ winner: 1, reason: 'intercept' });
  });

  it('checks only after both halves of the round', () => {
    const r = setup();
    round(r, [true, true], [null, null]);
    round(r, [true, true], [true, false]);
    encryptBoth(r); half(r, true, true);
    expect(g(r).phase).toBe('guess');
    half(r, true, false);
    expect(g(r).phase).toBe('over');
  });

  it('two miscommunications lose', () => {
    const r = setup();
    round(r, [false, true], [null, null]);
    round(r, [false, true], [false, false]);
    expect(g(r).result).toEqual({ winner: 1, reason: 'miscommunication' });
  });

  it('both channels winning goes to score, then keyword tiebreak', () => {
    const r = setup();
    round(r, [true, true], [null, null]);
    round(r, [true, true], [true, true]);
    round(r, [true, true], [true, true]);
    expect(g(r).phase).toBe('tiebreak');
    expect(() => E.submitTiebreak(r, 'p0', ['a'])).toThrow(/four/);
    E.submitTiebreak(r, 'p0', [...g(r).keywords[1].slice(0, 2), 'x', 'y']);
    expect(() => E.submitTiebreak(r, 'p2', ['a', 'b', 'c', 'd'])).toThrow(/already/);
    E.submitTiebreak(r, 'p1', [g(r).keywords[0][0], 'x', 'y', 'z']);
    expect(g(r).result).toEqual({ winner: 0, reason: 'tiebreak', tiebreak: [2, 1] });
  });

  it('a channel with 2 interceptions and 2 misses in one round goes to tiebreak', () => {
    const r = setup();
    round(r, [true, true], [null, null]);
    round(r, [false, true], [false, true]);
    round(r, [false, true], [false, true]);
    expect(g(r).tokens).toEqual({ intercept: [2, 0], miss: [2, 0] });
    expect(g(r).phase).toBe('tiebreak');
  });

  it('after round 8 with no winner, higher score wins', () => {
    const r = setup();
    round(r, [true, true], [null, null]);
    round(r, [true, true], [true, false]);
    for (let i = 3; i <= 8; i++) round(r, [true, true], [false, false]);
    expect(g(r).result).toEqual({ winner: 1, reason: 'score' });
  });
});

describe('privacy', () => {
  it('views never carry secrets to unauthorised seats', () => {
    const r = setup();
    const [e0, e1] = g(r).encryptors;
    const mate0 = teammate(r, 0);
    const codes = g(r).codes, kw = g(r).keywords;
    const leaks = (v: E.View, words: string[], code: E.Code | null) => {
      const s = JSON.stringify(v);
      return words.some(w => s.includes(`"${w}"`)) || (!!code && s.includes(JSON.stringify(code)));
    };
    const consoleView = E.view(r, null);
    expect(consoleView.secret).toBeNull();
    expect(leaks(consoleView, [...kw[0], ...kw[1]], null)).toBe(false);
    expect(E.view(r, e0).secret!.code).toEqual(codes[0]);
    expect(E.view(r, mate0).secret!.code).toBeNull();
    expect(E.view(r, mate0).secret!.keywords).toEqual(kw[0]);
    expect(leaks(E.view(r, e1), kw[0], null)).toBe(false);
    expect(E.view(r, e1).secret!.code).toEqual(codes[1]);
    // channel B's clues stay hidden while A is decoded
    E.submitClues(r, e0, ['a', 'b', 'c'], 0);
    E.submitClues(r, e1, ['zulu', 'yank', 'xray'], 0);
    for (const id of [null, 'p0', 'p2']) expect(JSON.stringify(E.view(r, id))).not.toContain('ZULU');
    expect(E.view(r, null).live).toEqual(['A', 'B', 'C']);
    // tokens/guess drafts of the other channel stay hidden
    E.submitGuess(r, mate0, codes[0]);
    expect(E.view(r, 'p1').locked.decode).toBe(true);
    expect(E.view(r, 'p1').secret!.teamGuess).toBeNull();
  });

  it('reconnect restores the seat by token and recovers host', () => {
    const r = setup();
    E.disconnect(r, 'p0');
    expect(r.host).not.toBe('p0');
    expect(() => E.reconnect(r, 'nope')).toThrow();
    expect(E.reconnect(r, 'tok0').id).toBe('p0');
    expect(r.players.find(p => p.id === 'p0')!.connected).toBe(true);
  });

  it('lobby drop frees seats only for devices still gone', () => {
    const r = E.createRoom('L');
    E.join(r, 'a', 'ta', 'ann'); E.join(r, 'b', 'tb', 'bob');
    E.disconnect(r, 'a');
    expect(r.host).toBe('b');
    E.reconnect(r, 'ta'); E.drop(r, 'a');
    expect(r.players).toHaveLength(2);
    E.disconnect(r, 'a'); E.drop(r, 'a');
    expect(r.players.map(p => p.id)).toEqual(['b']);
  });
});
