import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const PORT = process.env.PORT || 3001;
const DIST = join(fileURLToPath(new URL('.', import.meta.url)), 'dist');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const MAX_PLAYERS = 10000;

// Serves the built client in production; in dev Vite handles it and proxies /ws here.
const http = createServer(async (req, res) => {
  const path = req.url.split('?')[0];
  const full = join(DIST, path === '/' ? 'index.html' : path);
  try {
    if (!normalize(full).startsWith(DIST)) throw new Error('outside dist');
    const file = await readFile(full);
    res.writeHead(200, { 'Content-Type': MIME[extname(path)] || 'application/octet-stream' });
    res.end(file);
  } catch {
    res.writeHead(404).end('Not found');
  }
});

const wss = new WebSocketServer({ server: http, path: '/ws' });
const players = new Map();
const seats = new Map(); // cushion index -> player id
const SEAT_COUNT = 28;
const BURNER_COUNT = 2; // courtyard censer + hall censer
const STICK_LIFE_MS = 90_000; // matches STICK_LIFE on the client
const MAX_STICKS = 60;
let sticks = []; // { b, t }: burner index and the time it was planted
const prune = () => { const now = Date.now(); sticks = sticks.filter((s) => now - s.t < STICK_LIFE_MS).slice(-MAX_STICKS); };
seats.set(3, -1); // cushion 3 belongs to the abbot NPC
let nextId = 1;

const send = (ws, msg) => ws.readyState === 1 && ws.send(JSON.stringify(msg));
const broadcast = (msg, except) => {
  const data = JSON.stringify(msg);
  for (const c of wss.clients) if (c !== except && c.readyState === 1) c.send(data);
};
const freeSeat = (id) => {
  for (const [i, who] of seats) if (who === id) { seats.delete(i); return true; }
  return false;
};
const num = (v, lim) => (Number.isFinite(v) ? Math.max(-lim, Math.min(lim, v)) : 0);

wss.on('connection', (ws) => {
  if (players.size >= MAX_PLAYERS) return ws.close(1013, 'full');
  const id = nextId++;
  const me = { id, x: 0, z: 22, ry: Math.PI, hue: Math.random(), name: `Khách ${id}`, act: null };
  players.set(id, me);
  ws.pid = id;

  prune();
  send(ws, { t: 'init', id, players: [...players.values()], seats: [...seats], sticks: sticks.map((s) => ({ b: s.b, age: Date.now() - s.t })) });
  broadcast({ t: 'join', p: me }, ws);
  broadcast({ t: 'count', n: players.size });

  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (m.t === 'move') {
      me.x = num(m.x, 60); me.z = num(m.z, 60); me.ry = num(m.ry, 10);
      broadcast({ t: 'move', id, x: me.x, z: me.z, ry: me.ry }, ws);
    } else if (m.t === 'act' && (m.a === 'bow' || m.a === 'greet' || m.a === 'incense')) {
      broadcast({ t: 'act', id, a: m.a }, ws);
    } else if (m.t === 'plant') {
      const now = Date.now();
      if (!Number.isInteger(m.b) || m.b < 0 || m.b >= BURNER_COUNT || now - (me.lastPlant || 0) < 3000) return; // one offering per 3s
      me.lastPlant = now;
      sticks.push({ b: m.b, t: now });
      prune();
      broadcast({ t: 'stick', id, b: m.b }, ws);
      send(ws, { t: 'stick', id, b: m.b });
    } else if (m.t === 'sit') {
      const i = m.i;
      if (!Number.isInteger(i) || i < 0 || i >= SEAT_COUNT || (seats.has(i) && seats.get(i) !== id)) return send(ws, { t: 'sitfail' });
      freeSeat(id);
      seats.set(i, id);
      broadcast({ t: 'seat', id, i }, ws);
      send(ws, { t: 'seat', id, i });
    } else if (m.t === 'stand') {
      if (freeSeat(id)) { broadcast({ t: 'seat', id, i: -1 }, ws); send(ws, { t: 'seat', id, i: -1 }); }
    } else if (m.t === 'name' && typeof m.name === 'string') {
      me.name = m.name.slice(0, 16) || me.name;
      broadcast({ t: 'name', id, name: me.name }, ws);
    }
  });

  ws.on('close', () => {
    freeSeat(id);
    players.delete(id);
    broadcast({ t: 'leave', id });
    broadcast({ t: 'count', n: players.size });
  });
});

http.listen(PORT, () => console.log(`TT PTPM server on :${PORT}`));
