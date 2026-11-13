# BLEEP

Think alike. Speak in code. A Futile Studio game.

A multiplayer web adaptation of the mechanics of Decrypto (Le Scorpion Masqué). Two channels, four secret keywords each, three clues per transmission, and an opposing channel trying to intercept. Fan adaptation, not affiliated.

## Play

- `/` landing page: create or join a room.
- `/ROOM` private controller for each player's phone.
- `/ROOM/console` shared console for a TV or laptop. It never receives private data.

4 to 12 players, at least 2 per channel.

## Run

```sh
npm install --include=dev
npm run dev        # server :4410 + vite :5180
npm run build && npm start   # production on :4410 (PORT to change)
```

State persists to `data/rooms.json` (`BLEEP_DATA` to move it). Rooms expire after 12 hours idle.

## Test

```sh
npm test           # rules engine + real Socket.IO clients
npm run typecheck
npm run e2e        # full game in 5 headless Chromium contexts, screenshots in e2e/shots
```

`npm run e2e` needs a Playwright Chromium (`npx playwright-core install chromium-headless-shell`).

## Rules implemented

- Round 1: no interceptions. From round 2, the opposing channel locks an interception at the same time as the decode.
- Channel A transmits and reveals first, then channel B.
- 30-second sand timer once the first encryptor seals; the late encryptor's draft is sent as is.
- Encryptor rotates through each channel every round. If the encryptor disconnects, a teammate can take over.
- Wrong decode: miscommunication token. Correct interception: interception token.
- Checked at round end: 2 interceptions win, 2 miscommunications lose. Both, or round 8: score (interceptions minus miscommunications), then a keyword-guessing tiebreak.

## Privacy

The server is authoritative. `shared/engine.ts` `view()` builds each device's payload: the code goes only to the encryptor, keywords only to their own channel, and the console gets the public state only. Tests in `shared/engine.test.ts` and `server/server.test.ts` check this.
