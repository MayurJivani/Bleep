// Full game through the real UI: 4 phone contexts + 1 shared console, separate browser contexts (separate storage).
import { chromium, type Page } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const PORT = 20000 + Math.floor(Math.random() * 20000), BASE = `http://localhost:${PORT}`, SHOTS = 'e2e/shots';
mkdirSync(SHOTS, { recursive: true });
const server = spawn('node_modules/.bin/tsx', ['server/index.ts'], { env: { ...process.env, PORT: String(PORT), BLEEP_DATA: mkdtempSync(join(tmpdir(), 'bleep-e2e-')) }, stdio: 'inherit', detached: true });
await new Promise(r => setTimeout(r, 1500));

const browser = await chromium.launch({ args: ['--disable-gpu', '--js-flags=--max-old-space-size=96'] }); // fits the hub's 768 MB container
const phone = async () => (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true })).newPage();
const shot = (p: Page, n: string, full = false) => p.screenshot({ path: `${SHOTS}/${n}.png`, fullPage: full });
const errors: string[] = [];

try {
  const land = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  land.on('pageerror', e => errors.push(String(e)));
  await land.goto(BASE);
  await land.waitForTimeout(900);
  await shot(land, '01-landing-desktop');
  await shot(land, '01b-landing-full', true);
  await land.context().close();

  const names = ['IRIS', 'JUNE', 'TOMAS', 'OLLIE'];
  const pages: Page[] = [];
  for (let i = 0; i < 4; i++) { const p = await phone(); p.on('pageerror', e => errors.push(String(e))); pages.push(p); }
  const [host] = pages;
  await host.goto(BASE);
  await host.waitForTimeout(1000);
  await shot(host, '02-landing-mobile', true);
  await host.getByRole('button', { name: 'CREATE ROOM' }).click();
  await host.getByPlaceholder('YOUR NAME').fill(names[0]);
  await host.getByRole('button', { name: 'OPEN A CHANNEL' }).click();
  await host.waitForURL(/\/[A-Z]{4}$/);
  const room = new URL(host.url()).pathname.slice(1);

  for (let i = 1; i < 4; i++) {
    await pages[i].goto(`${BASE}/${room}`);
    await pages[i].getByPlaceholder('YOUR NAME').fill(names[i]);
    await pages[i].getByRole('button', { name: 'CONNECT DEVICE' }).click();
  }
  const screen = await (await browser.newContext({ viewport: { width: 1440, height: 960 } })).newPage();
  screen.on('pageerror', e => errors.push(String(e)));
  await screen.goto(`${BASE}/${room}/console`);

  // even index -> A, odd -> B
  for (const [i, p] of pages.entries()) await p.getByRole('button', { name: `PATCH INTO ${i % 2 ? 'B' : 'A'}` }).click();
  await host.getByRole('button', { name: 'START TRANSMISSION' }).waitFor();
  await shot(host, '03-lobby-mobile', true);
  await host.getByRole('button', { name: 'START TRANSMISSION' }).click();

  const team = (i: number) => i % 2;
  const findRole = async (label: string, t: number) => {
    for (let n = 0; n < 60; n++) {
      for (const [i, p] of pages.entries()) if (team(i) === t && await p.getByRole('button', { name: label }).isVisible()) return p;
      await host.waitForTimeout(100);
    }
    throw new Error(`No ${label} on channel ${t}`);
  };
  const keywords = async (p: Page) => p.locator('[aria-label="Note sheets"] .key').evaluateAll(els => els.slice(0, 4).map(e => e.lastElementChild!.textContent!));

  // Privacy on the rendered pages.
  await screen.getByText('ENCODING').first().waitFor();
  const kwA = await keywords(pages[0]), kwB = await keywords(pages[1]);
  assert.equal(new Set([...kwA, ...kwB]).size, 8);
  const consoleHtml = await screen.content();
  for (const w of [...kwA, ...kwB]) assert(!consoleHtml.includes(`>${w}<`), `console leaks ${w}`);
  for (const w of kwA) assert(!(await pages[1].content()).includes(`>${w}<`), `channel B sees ${w}`);

  // plan: r1 B miscommunicates; r2 B intercepts A, A misses interception; r3 B intercepts again -> B wins
  const plan = [
    { decode: [true, false], intercept: [null, null] },
    { decode: [true, true], intercept: [true, false] },
    { decode: [true, true], intercept: [true, false] },
  ];
  const wrong = (c: number[]) => [c[1], c[0], c[2]];
  for (const [r, step] of plan.entries()) {
    const codes: number[][] = [];
    for (const t of [0, 1]) {
      const enc = await findRole('REVIEW TRANSMISSION', t);
      const label = await enc.locator('[aria-label^="Your code"]').getAttribute('aria-label');
      codes[t] = label!.replace('Your code ', '').split(' ').map(Number);
      // the other channel's encryptor shows its own code, which can equal this one by chance
      for (const other of pages) if (other !== enc && !(await other.getByRole('button', { name: 'REVIEW TRANSMISSION' }).count())) assert(!(await other.content()).includes(label!), 'code leaked to another seat');
      assert(!(await screen.content()).includes(label!), 'code leaked to console');
      const inputs = enc.locator('input.field');
      for (let i = 0; i < 3; i++) await inputs.nth(i).fill(`r${r}c${t}x${i}`.replace(/\d/g, d => 'ZYXWVUTSRQ'[+d]));
      if (r === 0 && t === 0) await shot(enc, '04-encryptor', true);
      await enc.getByRole('button', { name: 'REVIEW TRANSMISSION' }).click();
      await enc.getByRole('button', { name: 'TRANSMIT' }).click();
    }
    for (const t of [0, 1]) {
      const code = codes[t];
      if (step.intercept[t] !== null) {
        const ic = await findRole('LOCK INTERCEPT', 1 - t);
        for (const d of step.intercept[t] ? code : wrong(code)) await ic.keyboard.press(String(d));
        if (r === 1 && t === 0) await shot(ic, '06-interceptor', true);
        await ic.getByRole('button', { name: 'LOCK INTERCEPT' }).click();
      }
      const dc = await findRole('LOCK CODE', t);
      if (r === 0 && t === 0) { await screen.waitForTimeout(1200); await shot(screen, '07-console-transmission'); }
      const digits = step.decode[t] ? code : wrong(code);
      await dc.locator('[aria-label="Note sheets"] .key').first().waitFor();
      for (const d of digits) await dc.getByRole('button', { name: new RegExp(`^0${d}`) }).first().click();
      if (r === 0 && t === 0) await shot(dc, '05-decoder', true);
      // a second click on the same instant from a teammate device is covered in server tests
      await dc.getByRole('button', { name: 'LOCK CODE' }).click();
      const next = t === 0 ? 'CONTINUE · CHANNEL B' : 'END ROUND';
      await host.getByRole('button', { name: next }).waitFor();
      if (r === 1 && t === 0) { await shot(host, '08-reveal-intercepted'); await shot(screen, '09-console-reveal'); }
      if (r === 2 && t === 1) break; // game ends after this reveal acknowledgement below
      await pages[3].getByRole('button', { name: next }).click();
    }
    if (r === 0) {
      // reconnect: reload a phone mid-game, it must return to its seat with its keywords
      const before = await keywords(pages[2]);
      await pages[2].reload();
      await pages[2].locator('[aria-label="Note sheets"] .key').first().waitFor();
      assert.deepEqual(await keywords(pages[2]), before);
    }
  }
  await pages[3].getByRole('button', { name: 'END ROUND' }).click();
  await screen.getByText('CHANNEL B WINS').waitFor();
  await screen.waitForTimeout(900);
  await shot(screen, '10-console-victory');
  await pages[1].getByText('SIGNAL SUCCESSFULLY INTERCEPTED').waitFor();
  await shot(pages[1], '11-phone-victory');
  await shot(pages[0], '12-phone-defeat');
  const tokens = await screen.locator('[aria-label^="Interceptions"]').evaluateAll(e => e.map(x => x.getAttribute('aria-label')));
  assert.deepEqual(tokens, ['Interceptions 0 of 2', 'Interceptions 2 of 2']);
  assert.deepEqual(await screen.locator('[aria-label^="Miscommunications"]').evaluateAll(e => e.map(x => x.getAttribute('aria-label'))), ['Miscommunications 0 of 2', 'Miscommunications 1 of 2']);
  assert.deepEqual(errors, []);
  console.log(`E2E PASS room ${room}`);
} catch (e) {
  console.error('E2E FAIL', e, errors);
  process.exitCode = 1;
} finally {
  await browser.close();
  process.kill(-server.pid!); // tsx forks node; kill the group

}
