// Minimal local Nostr relay, used only by the Playwright tests so the
// two-player test exercises the real Trystero + WebRTC path without depending
// on public relays. Run standalone with `npm run relay`.
import { WebSocketServer } from 'ws';

const port = Number(process.env.RELAY_PORT || 7447);
const wss = new WebSocketServer({ port });
const clients = new Map(); // ws -> Map<subId, filters[]>

const matches = (f, ev) => {
  if (f.kinds && !f.kinds.includes(ev.kind)) return false;
  if (f.since && ev.created_at < f.since - 5) return false;
  for (const k of Object.keys(f)) {
    if (k[0] !== '#') continue;
    const want = f[k];
    const tag = k.slice(1);
    if (!ev.tags?.some((t) => t[0] === tag && want.includes(t[1]))) return false;
  }
  return true;
};

wss.on('connection', (ws) => {
  const subs = new Map();
  clients.set(ws, subs);
  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    const [type, a, ...rest] = msg;
    if (type === 'REQ') {
      subs.set(a, rest);
      ws.send(JSON.stringify(['EOSE', a]));
    } else if (type === 'CLOSE') {
      subs.delete(a);
    } else if (type === 'EVENT') {
      ws.send(JSON.stringify(['OK', a.id, true, '']));
      for (const [peer, peerSubs] of clients) {
        if (peer.readyState !== 1) continue;
        for (const [subId, filters] of peerSubs) {
          if (filters.some((f) => matches(f, a))) peer.send(JSON.stringify(['EVENT', subId, a]));
        }
      }
    }
  });
  ws.on('close', () => clients.delete(ws));
});

wss.on('listening', () => console.log(`relay listening on ws://localhost:${port}`));
