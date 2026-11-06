// Server side of the "Te Nít" tennis court (module TNS): seats, ball physics, line calls and scoring. The server is the only
// authority on the ball and the score: clients send where they stand (through the normal 'move' message) and swing intents.
// An empty seat is filled by a bot, so one visitor can always play.
import { TEN, C, KINDS, sideSign, flyStep, launch, noise, strokeVelocity, newScore, addPoint, serverOf, serveCourt, serveSetup, inBox, inCourt, inTennis } from './src/tennisrules.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const num = (v, d = 0) => (Number.isFinite(v) ? v : d);
const r2 = (v) => Math.round(v * 100) / 100;
const BOT_NAMES = ['Máy Te Nít', 'Cô Bóng Vàng'];

export function createTennis({ players, sendTo }) {
  const seats = [null, null]; // { id } for a human, { bot: true, x, z, ry, name } for the bot
  const watchers = new Set();
  let G = null;
  let last = Date.now(), sendT = 0, checkT = 0;

  const humanCount = () => seats.filter((s) => s && !s.bot).length;
  const sideOf = (id) => seats.findIndex((s) => s && !s.bot && s.id === id);
  const pos = (side) => {
    const s = seats[side];
    if (!s) return { x: 0, z: sideSign(side) * C.halfL };
    if (s.bot) return s;
    const p = players.get(s.id);
    return p ? { x: p.x - TEN.cx, z: p.z - TEN.cz } : { x: 0, z: sideSign(side) * C.halfL };
  };
  const nameOf = (side) => {
    const s = seats[side];
    if (!s) return '';
    return s.bot ? s.name : players.get(s.id)?.name || 'Người chơi';
  };

  function newGame(fmt = G?.score.fmt || 'short') {
    const score = newScore(fmt);
    G = {
      score, ph: 'serve', t: 0, msg: 'Chuẩn bị giao bóng', rally: 0, longest: 0, faults: 0, ev: [], cool: [0, 0], since: Date.now(),
      stats: [0, 1].map(() => ({ ace: 0, df: 0, win: 0, err: 0, pts: 0 })),
      ball: { x: 0, y: 1, z: 0, vx: 0, vy: 0, vz: 0, bounces: 0, lastHit: -1, serving: false, hits: 0, live: false },
    };
    setupServe();
  }

  function setupServe() {
    const sc = G.score;
    G.server = serverOf(sc);
    G.setup = serveSetup(G.server, serveCourt(sc));
    G.ph = 'serve'; G.t = 0; G.rally = 0;
    G.msg = G.faults ? 'Giao bóng lần 2' : 'Chuẩn bị giao bóng';
    Object.assign(G.ball, { live: false, bounces: 0, lastHit: -1, serving: false, hits: 0, vx: 0, vy: 0, vz: 0 });
    parkBall();
  }
  function parkBall() { // the ball rests in the server's hand
    const p = pos(G.server);
    Object.assign(G.ball, { x: p.x, y: 1.1, z: p.z + sideSign(G.server) * -0.3 });
  }

  function assign(side, seat) {
    seats[side] = seat;
    refill();
  }
  function refill() {
    if (!humanCount()) { seats[0] = seats[1] = null; G = null; return; }
    for (const s of [0, 1]) if (!seats[s]) seats[s] = { bot: true, name: BOT_NAMES[s], x: 0, z: sideSign(s) * (C.halfL + 0.5), ry: s === 0 ? Math.PI : 0 };
    newGame();
  }

  function join(id) {
    const p = players.get(id);
    if (!p || !inTennis(p.x, p.z) || sideOf(id) >= 0) return;
    let side = seats.findIndex((s) => !s);
    if (side < 0) side = seats.findIndex((s) => s?.bot);
    if (side < 0) return sendTo(id, { t: 'tn', full: 1 });
    assign(side, { id });
    sendTo(id, { t: 'tn', you: side });
    broadcast(true);
  }
  function leave(id) {
    watchers.delete(id);
    const side = sideOf(id);
    if (side < 0) return;
    seats[side] = null;
    sendTo(id, { t: 'tn', you: -1 });
    refill();
    broadcast(true);
  }

  // ---------- point flow ----------

  function endPoint(winner, why, kind) {
    const b = G.ball, loser = 1 - winner;
    b.live = false;
    const st = G.stats[winner];
    st.pts++;
    if (kind === 'ace') st.ace++;
    else if (kind === 'df') G.stats[loser].df++;
    else if (kind === 'winner') st.win++;
    else if (kind === 'error') G.stats[loser].err++;
    G.longest = Math.max(G.longest, G.rally);
    const res = addPoint(G.score, winner);
    G.faults = 0;
    G.ph = res === 'set' ? 'over' : 'point';
    G.t = 0;
    G.msg = `${why} — điểm cho ${nameOf(winner)}${res === 'game' ? ' · Game!' : ''}${res === 'set' ? ' · Chiến thắng!' : ''}`;
    G.ev.push({ k: 'point', s: winner, r: kind, g: res });
  }

  function fault(why) {
    G.ball.live = false;
    G.faults++;
    G.ev.push({ k: 'fault' });
    if (G.faults >= 2) return endPoint(1 - G.server, `Lỗi kép (${why})`, 'df');
    G.ph = 'point'; G.t = 0; G.msg = `Lỗi giao bóng: ${why}`; G.retry = true;
  }

  function doServe(side, ax, ad, errMul = 1) {
    if (G.ph !== 'serve' || G.server !== side) return false;
    const p = pos(side), b = G.ball, box = G.setup.box;
    if (p.z * sideSign(side) < 7) { sendHint(side, 'Hãy lùi ra sau vạch cuối sân để giao bóng'); return false; }
    const second = G.faults > 0;
    const cx = (box.x0 + box.x1) / 2, half = (box.x1 - box.x0) / 2 - 0.35;
    const sd = (second ? 0.4 : 0.75) * errMul;
    const tx = cx + clamp(ax, -1, 1) * half * 0.9 + noise() * sd;
    const depth = (second ? 3.8 : 4.6) + clamp(ad, 0, 1) * (second ? 1.6 : 1.9) + noise() * sd;
    const tz = box.zSign * depth;
    Object.assign(b, { x: p.x, y: 2.5, z: p.z });
    const dist = Math.hypot(tx - b.x, tz - b.z);
    Object.assign(b, launch(b.x, b.y, b.z, tx, tz, dist / (second ? 21 : 27)));
    Object.assign(b, { live: true, serving: true, lastHit: side, bounces: 0, hits: 1 });
    G.ph = 'rally'; G.t = 0; G.rally = 1; G.msg = '';
    G.ev.push({ k: 'hit', s: side, c: 's' });
    return true;
  }

  function sendHint(side, text) {
    const s = seats[side];
    if (s && !s.bot) sendTo(s.id, { t: 'tn', hint: text });
  }

  function tryHit(side, kind, ax, ad, errMul = 1) {
    const b = G.ball;
    if (G.cool[side] > 0) return false;
    G.cool[side] = 0.4;
    G.ev.push({ k: 'swing', s: side, c: kind });
    if (!b.live || b.serving || b.lastHit === side) return false;
    if (b.z * sideSign(side) < -0.35) return false; // the ball is still on the other side
    const p = pos(side), d = Math.hypot(b.x - p.x, b.z - p.z);
    if (d > C.reach || b.y > 3.4) return false;
    const v = strokeVelocity(b, side, kind, ax, ad, d / C.reach, errMul);
    Object.assign(b, { vx: v.vx, vy: v.vy, vz: v.vz, lastHit: side, bounces: 0, hits: b.hits + 1 });
    G.rally++;
    G.ev.push({ k: 'hit', s: side, c: kind });
    return true;
  }

  function onBounce() {
    const b = G.ball, hitter = b.lastHit;
    b.bounces++;
    G.ev.push({ k: 'bounce' });
    if (b.serving) { // the first bounce of a serve must land in the diagonal service box
      if (inBox(G.setup.box, b.x, b.z)) { b.serving = false; return; }
      return fault(b.z * sideSign(hitter) > 0 ? 'chạm sân mình' : 'ra ngoài ô giao bóng');
    }
    if (b.bounces === 1) {
      if (!inCourt(-sideSign(hitter), b.x, b.z)) endPoint(1 - hitter, 'Bóng ra ngoài', 'error');
    } else endPoint(hitter, b.hits === 1 ? 'Ace!' : 'Cú đánh thắng điểm', b.hits === 1 ? 'ace' : 'winner');
  }

  function stepBall(dt) {
    const b = G.ball, pz = b.z, py = b.y;
    flyStep(b, dt);
    if (pz * b.z < 0 || (pz !== 0 && b.z === 0)) { // crossing the net plane
      const k = pz / (pz - b.z), yc = py + (b.y - py) * k;
      if (yc < C.netH) {
        if (b.serving) { b.live = false; b.vx = b.vz = 0; return fault('chạm lưới'); }
        b.live = false; b.vx = b.vz = 0;
        G.ev.push({ k: 'net' });
        return endPoint(1 - b.lastHit, 'Bóng vào lưới', 'error');
      }
    }
    if (b.y < C.R && b.vy < 0) {
      b.y = C.R; b.vy = -b.vy * 0.72; b.vx *= 0.88; b.vz *= 0.88;
      onBounce();
    }
    if (b.live && (Math.abs(b.x) > 40 || Math.abs(b.z) > 45)) endPoint(1 - b.lastHit, 'Bóng ra ngoài', 'error');
  }

  // ---------- bot ----------

  function predict(side) { // where will the ball be when it is about knee-to-waist high on my side?
    const b = G.ball, s = { ...b };
    let bounces = b.bounces;
    for (let i = 0; i < 240; i++) {
      flyStep(s, 1 / 60);
      if (s.y < C.R && s.vy < 0) { s.y = C.R; s.vy = -s.vy * 0.72; s.vx *= 0.88; s.vz *= 0.88; bounces++; }
      if (s.z * sideSign(side) > 0 && bounces >= 1 && s.y < 1.3 && s.vy < 0.2 && !(b.serving && bounces < 1)) return { x: s.x, z: s.z };
      if (s.z * sideSign(side) > 0 && s.y < 2 && Math.abs(s.z) < 6 && bounces === 0 && !b.serving) return { x: s.x, z: s.z }; // volley near the net
    }
    return { x: s.x, z: clamp(s.z, -C.halfL - 3, C.halfL + 3) };
  }

  function botTick(side, dt) {
    const bot = seats[side];
    if (!bot?.bot) return;
    const b = G.ball, sg = sideSign(side), foe = pos(1 - side);
    let tx = clamp(b.x * 0.35, -3, 3), tz = sg * (C.halfL + 0.4);
    if (G.ph === 'serve' && G.server === side) {
      tx = G.setup.x; tz = G.setup.z;
      if (G.t > 1.6 && Math.hypot(bot.x - tx, bot.z - tz) < 0.6) doServe(side, (Math.random() - 0.5) * 1.6, 0.4 + Math.random() * 0.6, 1.3);
    } else if (G.ph === 'serve') { // receiver waits near the baseline, towards the box
      tx = -G.setup.x * 0.6;
    } else if (G.ph === 'rally' && b.live && b.lastHit !== side) {
      const t = predict(side);
      tx = clamp(t.x, -6.5, 6.5); tz = sg * clamp(t.z * sg, 0.8, C.halfL + 4);
      const d = Math.hypot(b.x - bot.x, b.z - bot.z);
      const ready = b.z * sg > 0 && !b.serving && (b.bounces >= 1 || (b.y < 2.1 && Math.abs(b.z) < 7));
      if (ready && d < 1.9 && b.y < 2.4 && b.y > 0.25) {
        const kind = b.y > 2.0 ? 's' : Math.abs(bot.z) < 4 ? 'v' : bot.x * sg > b.x * sg ? 'b' : 'f';
        tryHit(side, kind, clamp(-foe.x / 4 + (Math.random() - 0.5) * 1.5, -1, 1) * 0.85, 0.45 + Math.random() * 0.5, 1.25);
      }
    }
    const dx = tx - bot.x, dz = tz - bot.z, d = Math.hypot(dx, dz), v = Math.min(d, 5.4 * dt);
    bot.moving = d > 0.15;
    if (d > 0.01) { bot.x += (dx / d) * v; bot.z += (dz / d) * v; bot.ry = Math.atan2(dx, dz); }
    // face the net/ball while hitting
    if (!bot.moving) bot.ry = side === 0 ? Math.PI : 0;
  }

  // ---------- main loop and messages ----------

  function tick() {
    const now = Date.now(), dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!G) return;
    G.t += dt;
    G.cool[0] -= dt; G.cool[1] -= dt;

    checkT -= dt;
    if (checkT <= 0) { // players who walked away from the court give up their seat
      checkT = 0.5;
      for (const s of [0, 1]) {
        const seat = seats[s];
        if (seat && !seat.bot) { const p = players.get(seat.id); if (!p || !inTennis(p.x, p.z)) return leave(seat.id); }
      }
    }
    for (const s of [0, 1]) botTick(s, dt);

    if (G.ph === 'serve') parkBall();
    else if (G.ph === 'rally') {
      const n = Math.ceil(dt * 90);
      for (let i = 0; i < n && G.ph === 'rally'; i++) stepBall(dt / n);
      if (G.ph === 'rally' && G.t > 40) endPoint(1 - G.ball.lastHit, 'Quá thời gian', 'error');
    } else {
      coast(dt);
      if (G.ph === 'point' && G.t > 2.4) { G.retry = false; setupServe(); }
      else if (G.ph === 'over' && G.t > 9) newGame(G.score.fmt);
    }

    sendT -= dt;
    if (sendT <= 0 || G.ev.length) broadcast(false);
  }

  /** After a point the ball keeps rolling and dropping for show; nothing is judged any more. */
  function coast(dt) {
    const b = G.ball;
    if (b.y <= C.R + 0.001 && Math.abs(b.vy) < 0.5 && Math.hypot(b.vx, b.vz) < 0.2) { b.y = C.R; b.vx = b.vy = b.vz = 0; return; }
    flyStep(b, dt);
    if (b.y < C.R && b.vy < 0) { b.y = C.R; b.vy = -b.vy * 0.5; b.vx *= 0.8; b.vz *= 0.8; }
    if (Math.hypot(b.vx, b.vz) < 0.3) b.vx = b.vz = 0;
  }

  function snapshot() {
    if (!G) return { t: 'tn', ph: 'idle', sd: [null, null] };
    const b = G.ball, sc = G.score;
    return {
      t: 'tn', ph: G.ph, srv: G.server, msg: G.msg, fl: G.faults, rl: G.rally, lg: G.longest, since: G.since,
      b: [r2(b.x), r2(b.y), r2(b.z), r2(b.vx), r2(b.vy), r2(b.vz)], live: b.live ? 1 : 0, ser: b.serving ? 1 : 0,
      sd: seats.map((s, i) => s && (s.bot ? { bot: 1, n: s.name, x: r2(s.x), z: r2(s.z), ry: r2(s.ry), mv: s.moving ? 1 : 0 } : { id: s.id, n: nameOf(i) })),
      sc: { p: sc.pts, g: sc.games, tb: sc.tb ? 1 : 0, fmt: sc.fmt, over: sc.over ? 1 : 0, w: sc.winner },
      box: G.ph === 'serve' || G.retry ? G.setup : undefined, st: G.stats, ev: G.ev,
    };
  }
  function broadcast(force) {
    sendT = 0.05;
    const msg = JSON.stringify(snapshot());
    if (G) G.ev = [];
    for (const id of watchers) sendTo(id, msg, true);
    void force;
  }

  function message(id, m) {
    if (m.t === 'tn_watch') {
      if (m.on) { watchers.add(id); sendTo(id, JSON.stringify({ ...snapshot(), you: sideOf(id) }), true); } else leave(id);
    } else if (m.t === 'tn_join') join(id);
    else if (m.t === 'tn_leave') leave(id);
    else if (m.t === 'tn_fmt' && G && sideOf(id) >= 0 && m.f in { short: 1, full: 1 } && (G.ph === 'serve' || G.ph === 'over') && G.score.pts[0] + G.score.pts[1] + G.score.games[0] + G.score.games[1] === 0) newGame(m.f);
    else if (m.t === 'tn_swing') {
      const side = sideOf(id);
      if (side < 0 || !G) return;
      const kind = KINDS[m.k] ? m.k : 'f', ax = clamp(num(m.ax), -1, 1), ad = clamp(num(m.ad, 0.6), 0, 1);
      if (G.ph === 'serve') { if (G.server === side) doServe(side, ax, ad); }
      else if (G.ph === 'rally') tryHit(side, kind, ax, ad);
    }
  }

  return { message, leave, tick, watchers };
}
