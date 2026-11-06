import * as THREE from 'three';
import { buildTennis } from './tennisworld.js';
import { Avatar } from './avatar.js';
import { TEN, C, KINDS, sideSign, flyStep, inTennis, pointLabels } from './tennisrules.js';
import { sfx } from './audio.js';

// Client side of the "Te Nít" court (module TNS). The server owns the ball and the score and streams snapshots (20/s) to everyone
// standing near the court; this file draws them, plays the sounds, shows the HUD/score boards and sends swing intents.

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const KEYMAP = { KeyJ: 'f', KeyK: 'b', KeyL: 'v', KeyU: 's', KeyI: 'l', KeyO: 'd', Space: 'f' };
const REASON = { ace: 'Ace', winner: 'Winner', error: 'Lỗi', df: 'Lỗi kép' };

export function createTennisGame({ scene, camera, send, actor, myId, camYaw, placeMe, flash }) {
  const W = buildTennis(scene);
  const bg = W.board.g;
  let S = null; // latest snapshot
  let you = -1; // my side (0 or 1) or -1
  let inside = false;
  let swingCd = 0;
  const bots = [null, null];
  const racketed = new Set();
  const ball = { x: 0, y: 1, z: 0, vx: 0, vy: 0, vz: 0, init: false };
  const mouse = { x: 0, y: 0 };
  addEventListener('mousemove', (e) => { mouse.x = (e.clientX / innerWidth) * 2 - 1; mouse.y = (e.clientY / innerHeight) * 2 - 1; });

  const vol = (x, z) => Math.max(0, 1 - Math.hypot(camera.position.x - (TEN.cx + x), camera.position.z - (TEN.cz + z)) / 45) ** 2;
  const seatAvatar = (s) => {
    const d = S?.sd?.[s];
    if (!d) return null;
    return d.bot ? bots[s] : actor(d.id)?.avatar || null;
  };

  // ---------- snapshots ----------
  function onMsg(m) {
    if (m.hint) flash(m.hint);
    if (m.full) flash('Sân đã đủ người chơi');
    if (m.you !== undefined && m.you !== you) {
      you = m.you;
      if (you >= 0) {
        const s = sideSign(you);
        placeMe(TEN.cx, TEN.cz + s * (C.halfL + 1.2), you === 0 ? Math.PI : 0, you === 0 ? 0 : Math.PI);
        flash('Bạn vào sân! Giữ chuột để chọn hướng, J/K để đánh, nhấn Y để rời sân.');
      }
      render();
    }
    if (m.ph === undefined) return;
    S = m;
    if (m.ph === 'idle') { syncSeats(); render(); return; }
    for (const e of m.ev || []) onEvent(e);
    syncSeats();
    syncBall();
    drawBoard();
    render();
  }

  function onEvent(e) {
    const b = S.b;
    if (e.k === 'hit' || e.k === 'swing') {
      if (e.s !== you) seatAvatar(e.s)?.swing(e.c);
      if (e.k === 'hit') sfx('racket', vol(b[0], b[2]));
    } else if (e.k === 'bounce') sfx('bounce', vol(b[0], b[2]) * 0.8);
    else if (e.k === 'net') sfx('net', vol(b[0], b[2]));
    else if (e.k === 'point' || e.k === 'fault') sfx('whistle', 0.35);
  }

  function syncSeats() {
    const now = new Set();
    for (let s = 0; s < 2; s++) {
      const d = S.sd[s];
      if (d?.bot) {
        if (!bots[s]) {
          bots[s] = new Avatar(0.25 + s * 0.5, d.n);
          bots[s].setRacket(true);
          bots[s].group.position.set(TEN.cx + d.x, 0, TEN.cz + d.z);
          scene.add(bots[s].group);
        }
        bots[s].target = d;
      } else if (bots[s]) { scene.remove(bots[s].group); bots[s] = null; }
      if (d && !d.bot) {
        now.add(d.id);
        if (!racketed.has(d.id)) { actor(d.id)?.avatar.setRacket(true); racketed.add(d.id); }
      }
    }
    for (const id of [...racketed]) if (!now.has(id)) { actor(id)?.avatar.setRacket(false); racketed.delete(id); }
  }

  function syncBall() {
    const [x, y, z, vx, vy, vz] = S.b;
    const far = Math.hypot(x - ball.x, y - ball.y, z - ball.z) > 2;
    if (!ball.init || far || S.ph === 'serve') Object.assign(ball, { x, y, z, init: true });
    else { ball.x += (x - ball.x) * 0.5; ball.y += (y - ball.y) * 0.5; ball.z += (z - ball.z) * 0.5; }
    Object.assign(ball, { vx, vy, vz });
  }

  // ---------- score boards and HUD ----------
  function drawBoard() {
    const c = W.board.c;
    bg.fillStyle = '#0d2a44'; bg.fillRect(0, 0, c.width, c.height);
    bg.fillStyle = '#ffd23c'; bg.fillRect(0, 0, c.width, 8);
    bg.textBaseline = 'middle';
    const lab = pointLabels({ pts: S.sc.p, tb: S.sc.tb });
    bg.font = 'bold 22px system-ui, sans-serif'; bg.fillStyle = '#7fb4e0'; bg.textAlign = 'center';
    bg.fillText('GAME', 740, 30); bg.fillText(S.sc.tb ? 'TIE-BREAK' : 'ĐIỂM', 910, 30);
    for (let s = 0; s < 2; s++) {
      const y = 100 + s * 78, d = S.sd[s];
      bg.fillStyle = S.srv === s && S.ph !== 'idle' ? '#ffd23c' : '#0d2a44';
      bg.beginPath(); bg.arc(44, y, 14, 0, 7); bg.fill();
      bg.fillStyle = '#fff'; bg.textAlign = 'left'; bg.font = 'bold 54px system-ui, sans-serif';
      bg.fillText((d?.n || '—').slice(0, 14), 76, y);
      bg.textAlign = 'center'; bg.font = 'bold 64px system-ui, sans-serif';
      bg.fillStyle = '#fff'; bg.fillText(S.sc.g[s], 740, y);
      bg.fillStyle = '#ffd23c'; bg.fillText(lab[s], 910, y);
    }
    W.board.tex.needsUpdate = true;
  }

  const hud = $('tnHud'), prompt = $('tnPrompt'), bar = $('tnBar');
  function render() {
    const playing = S && S.ph !== 'idle';
    hud.style.display = inside && playing ? 'block' : 'none';
    if (inside && playing) {
      const lab = pointLabels({ pts: S.sc.p, tb: S.sc.tb });
      const row = (s) => {
        const d = S.sd[s];
        return `<div class="tnrow${you === s ? ' me' : ''}"><i>${S.srv === s ? '🎾' : ''}</i><b>${esc(d?.n || '—')}${d?.bot ? ' 🤖' : ''}</b><span>${S.sc.g[s]}</span><em>${lab[s]}</em></div>`;
      };
      let extra = S.msg ? `<div class="tnmsg">${esc(S.msg)}</div>` : '';
      if (S.ph === 'rally' && S.rl > 2) extra = `<div class="tnmsg">Rally: ${S.rl} cú đánh</div>`;
      if (S.fl) extra += '<div class="tnmsg">Lỗi giao bóng lần 1</div>';
      if (S.ph === 'over') {
        const w = S.sc.w, st = S.st;
        extra = `<div class="tnmsg win">🏆 ${esc(S.sd[w]?.n || '')} thắng ${S.sc.g[w]}–${S.sc.g[1 - w]}!</div>
          <table class="tnst"><tr><td>${st[0].ace}</td><th>Ace</th><td>${st[1].ace}</td></tr><tr><td>${st[0].df}</td><th>Lỗi kép</th><td>${st[1].df}</td></tr>
          <tr><td>${st[0].win}</td><th>Cú thắng điểm</th><td>${st[1].win}</td></tr><tr><td>${st[0].err}</td><th>Lỗi đánh</th><td>${st[1].err}</td></tr>
          <tr><td>${st[0].pts}</td><th>Tổng điểm</th><td>${st[1].pts}</td></tr></table>
          <div class="tnmsg">Rally dài nhất: ${S.lg} · Ván mới sau ít giây…</div>`;
      }
      hud.innerHTML = `<div class="tnfmt">${S.sc.fmt === 'full' ? 'Set 6 game' : 'Set rút gọn 4 game'}</div>${row(0)}${row(1)}${extra}`;
    }
    let p = '';
    if (inside) {
      if (you < 0) p = S?.ph && S.ph !== 'idle' ? 'Nhấn <b>Y</b> để vào sân (thay thế máy) · hoặc đứng xem' : 'Nhấn <b>Y</b> để chơi Te Nít với máy hoặc người khác';
      else if (S?.ph === 'serve' && S.srv === you) p = 'Đến sau vạch cuối sân, <b>chỉ chuột</b> vào ô giao bóng rồi nhấn <b>J</b> để giao bóng';
    }
    prompt.innerHTML = p;
    prompt.style.display = p ? 'block' : 'none';
    bar.querySelector('[data-key="KeyY"]').textContent = you >= 0 ? '🚪 Rời sân (Y)' : '🎾 Vào sân (Y)';
  }
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- input ----------
  function aim() {
    const yaw = camYaw();
    return { ax: clamp(mouse.x * Math.cos(yaw) * 1.3, -1, 1), ad: clamp(0.5 - mouse.y * 0.7, 0, 1) };
  }

  function key(code) {
    if (!inside) return false;
    if (code === 'KeyY') { send({ t: you >= 0 ? 'tn_leave' : 'tn_join' }); return true; }
    const kind = KEYMAP[code];
    if (!kind || you < 0) return false;
    if (swingCd > 0) return true;
    swingCd = 0.35;
    const { ax, ad } = aim();
    send({ t: 'tn_swing', k: kind, ax, ad });
    actor(myId())?.avatar.swing(S?.ph === 'serve' ? 's' : kind);
    return true;
  }

  // ---------- per frame ----------
  function update(dt, p) {
    swingCd -= dt;
    const now = !!p && inTennis(p.x, p.z);
    if (now !== inside) {
      inside = now;
      send({ t: 'tn_watch', on: inside });
      if (!inside) leaveZone();
      render();
    }
    // ball
    const show = inside && S && S.ph !== 'idle';
    W.ball.visible = W.shadow.visible = !!show;
    if (show) {
      if (S.ph !== 'serve') {
        flyStep(ball, dt);
        if (ball.y < C.R && ball.vy < 0) { ball.y = C.R; ball.vy = -ball.vy * 0.7; ball.vx *= 0.88; ball.vz *= 0.88; }
        if (!S.live && Math.hypot(ball.vx, ball.vz) < 0.3) ball.vx = ball.vz = 0;
      }
      W.ball.position.set(ball.x, ball.y, ball.z);
      W.shadow.position.set(ball.x, 0.06, ball.z);
      W.shadow.scale.setScalar(Math.max(0.4, 1.4 - ball.y * 0.18));
    }
    // service box highlight and aim ring
    const bx = show && S.ph === 'serve' && S.box;
    W.boxHi.visible = !!bx;
    if (bx) {
      const w = bx.box.x1 - bx.box.x0;
      W.boxHi.scale.set(w, C.svc, 1);
      W.boxHi.position.set(bx.box.x0 + w / 2, 0.065, (bx.box.zSign * C.svc) / 2);
    }
    W.ring.visible = !!(show && you >= 0 && S.ph !== 'point' && S.ph !== 'over');
    if (W.ring.visible) {
      const { ax, ad } = aim(), K = KINDS.f;
      W.ring.position.set(ax * (C.halfW - 0.45), 0.07, -sideSign(you) * (K.depth[0] + (K.depth[1] - K.depth[0]) * ad));
    }
    // bots
    for (const s of [0, 1]) {
      const b = bots[s];
      if (!b) continue;
      const t = b.target, g = b.group, k = 1 - Math.exp(-dt * 12);
      const tx = TEN.cx + t.x, tz = TEN.cz + t.z, dx = tx - g.position.x, dz = tz - g.position.z;
      g.position.x += dx * k; g.position.z += dz * k;
      let d = t.ry - g.rotation.y;
      d = ((d + Math.PI) % (Math.PI * 2)) - Math.PI; if (d < -Math.PI) d += Math.PI * 2;
      g.rotation.y += d * k;
      b.update(dt, Math.hypot(dx, dz) > 0.08);
    }
  }

  function leaveZone() {
    S = null; you = -1;
    for (const id of racketed) actor(id)?.avatar.setRacket(false);
    racketed.clear();
    for (let s = 0; s < 2; s++) if (bots[s]) { scene.remove(bots[s].group); bots[s] = null; }
    ball.init = false;
  }

  return {
    onMsg,
    key,
    update,
    get inside() { return inside; },
    get playing() { return you >= 0; },
    /** Reconnected: the server forgot everything about us. */
    reset() { leaveZone(); inside = false; render(); },
    /** Yaw the camera should hold while playing (behind my baseline), or null. */
    cameraYaw: () => (you >= 0 ? (you === 0 ? 0 : Math.PI) : null),
    /** Keeps a player who has a seat on their own half of the court. */
    clamp(p) {
      if (you < 0) return;
      const s = sideSign(you);
      p.x = TEN.cx + clamp(p.x - TEN.cx, -9, 9);
      p.z = TEN.cz + s * clamp((p.z - TEN.cz) * s, 1.0, C.fenceZ - 1.2);
    },
  };
}
