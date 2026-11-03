import * as THREE from 'three';
import { buildWorld, floorY, BOUNDS, OBSTACLES, CUSHIONS, BURNERS } from './world.js';
import { Incense } from './incense.js';
import { buildPrison } from './prison.js';
import { findPath } from './nav.js';
import { Avatar } from './avatar.js';
import { startAudio, bell, toggleMute, moTap } from './audio.js';

const $ = (id) => document.getElementById(id);

// ---------- scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 400);
const ground = buildWorld(scene);
const prison = buildPrison(scene); // after the world so its obstacles join the same list

// Incense: every burner starts with a few ever-burning sticks so the smoke is always there; visitors add more.
const incense = new Incense(scene, BURNERS);
BURNERS.forEach((_, i) => { for (let k = 0; k < 3; k++) incense.addStick(i, 0, true); });
const syncViewport = () => incense.setViewport(renderer.domElement.height, camera.fov);
syncViewport();

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  syncViewport();
});

// ---------- players ----------
const remotes = new Map(); // id -> { avatar, tx, tz, try }
let me = null; // { avatar, id }
let route = []; // click-to-move waypoints
const taken = new Map(); // cushion index -> player id
const SEAT_Y = 0.14;

// ---------- NPCs (same on every client: positions derive from the wall clock, no networking) ----------
const ABBOT_SEAT = 3; // cushion in front of the altar; the server keeps it reserved
taken.set(ABBOT_SEAT, -1);

const abbot = new Avatar(0, 'Thầy trụ trì', 'abbot');
{
  const c = CUSHIONS[ABBOT_SEAT];
  abbot.group.position.set(c.x, floorY(c.x, c.z) + SEAT_Y, c.z);
  abbot.group.rotation.y = Math.PI; // faces the altar
  abbot.onTap = () => {
    const d = camera.position.distanceTo(abbot.group.position);
    moTap(Math.max(0, 1 - d / 40) ** 2);
  };
  scene.add(abbot.group);
}

// Sweepers walk closed loops through courtyard aisles that are clear of ponds, towers, the stele and the burner.
function makeSweeper(avatar, loop, speed) {
  scene.add(avatar.group);
  const legs = loop.map((a, i) => {
    const b = loop[(i + 1) % loop.length];
    return { a, b, len: Math.hypot(b[0] - a[0], b[1] - a[1]) };
  });
  return { avatar, legs, total: legs.reduce((n, l) => n + l.len, 0), speed };
}
const sweepers = [
  makeSweeper(new Avatar(0, 'Sư tiểu', 'sweeper'), [[-5, 12], [5, 12], [5, -0.5], [-5, -0.5]], 1.3), // round the incense burner
  makeSweeper(new Avatar(0.7, 'Mèo Mướp', 'cat'), [[-18, -8], [-18, -18], [-15, -18], [-15, -8]], 1.0), // west of the hall
  makeSweeper(new Avatar(0.2, 'Cún Vàng', 'dog'), [[18, -8], [18, -20], [15, -20], [15, -8]], 1.1), // east of the hall
  makeSweeper(new Avatar(0.2, 'Mèo Cam', 'cat'), [[-22, 14.5], [22, 14.5]], 0.9), // along the front, behind the gate
];

// Prison panel: shown while the player is inside the hall; the clock and daily routine come from real time.
const prisonHud = document.getElementById('prisonHud');
let hudTimer = 0, hudShown = false;
function updatePrisonHud(dt) {
  if (!me) return;
  hudTimer -= dt;
  if (hudTimer > 0) return;
  hudTimer = 0.5;
  const p = me.avatar.group.position;
  const inside = prison.contains(p.x, p.z);
  if (inside !== hudShown) { hudShown = inside; prisonHud.style.display = inside ? 'block' : 'none'; }
  if (inside) {
    const { time, label, residents } = prison.status();
    prisonHud.innerHTML = `🕒 ${time.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} – ${label}<br>👥 Phạm nhân và cán bộ: ${residents}`;
  }
}

function updateNpcs(dt) {
  const now = Date.now() / 1000;
  for (const sw of sweepers) {
    let d = (now * sw.speed) % sw.total;
    for (const l of sw.legs) {
      if (d <= l.len) {
        const k = d / l.len, g = sw.avatar.group;
        g.position.set(l.a[0] + (l.b[0] - l.a[0]) * k, 0, l.a[1] + (l.b[1] - l.a[1]) * k);
        g.rotation.y = Math.atan2(l.b[0] - l.a[0], l.b[1] - l.a[1]);
        break;
      }
      d -= l.len;
    }
    sw.avatar.update(dt, true);
  }
  abbot.update(dt, false);
}
let ws = null;

const RADIUS = 0.5;

/** Pushes the avatar out of walls, ponds and buildings. */
function collide(p) {
  for (const o of OBSTACLES) {
    if (o.r !== undefined) {
      const dx = p.x - o.x, dz = p.z - o.z, min = o.r + RADIUS, d = Math.hypot(dx, dz);
      if (d < min) { const k = min / (d || 1); p.x = o.x + (d ? dx * k : min); p.z = o.z + (d ? dz * k : 0); }
    } else {
      const x0 = o.x0 - RADIUS, x1 = o.x1 + RADIUS, z0 = o.z0 - RADIUS, z1 = o.z1 + RADIUS;
      if (p.x <= x0 || p.x >= x1 || p.z <= z0 || p.z >= z1) continue;
      const push = [p.x - x0, x1 - p.x, p.z - z0, z1 - p.z];
      const m = Math.min(...push);
      if (m === push[0]) p.x = x0; else if (m === push[1]) p.x = x1; else if (m === push[2]) p.z = z0; else p.z = z1;
    }
  }
}

function spawn(p) {
  const avatar = new Avatar(p.hue, p.name);
  avatar.group.position.set(p.x, floorY(p.x, p.z), p.z);
  avatar.group.rotation.y = p.ry;
  scene.add(avatar.group);
  return avatar;
}

function connect(name) {
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  ws.onopen = () => ws.send(JSON.stringify({ t: 'name', name }));
  ws.onmessage = ({ data }) => {
    const m = JSON.parse(data);
    if (m.t === 'init') {
      const self = m.players.find((p) => p.id === m.id);
      me = { id: m.id, avatar: spawn({ ...self, name: name || self.name }) };
      me.seat = -1;
      me.avatar.onPlant = () => { bell(660); send({ t: 'plant', b: me.incenseB }); };
      for (const s of m.sticks || []) incense.addStick(s.b, s.age / 1000);
      for (const p of m.players) if (p.id !== m.id) addRemote(p);
      for (const [i, id] of m.seats) applySeat(id, i);
      $('count').textContent = m.players.length;
    } else if (m.t === 'join') addRemote(m.p);
    else if (m.t === 'leave') {
      const r = remotes.get(m.id);
      if (r) { scene.remove(r.avatar.group); remotes.delete(m.id); }
    } else if (m.t === 'move') {
      const r = remotes.get(m.id);
      if (r) Object.assign(r, { tx: m.x, tz: m.z, try: m.ry });
    } else if (m.t === 'act') {
      const r = remotes.get(m.id);
      if (r?.avatar.play(m.a) && m.a === 'incense') {
        const b = incense.nearest(r.tx, r.tz, 6);
        if (b >= 0) r.try = bearingTo(r.tx, r.tz, b);
      }
    } else if (m.t === 'stick') {
      incense.addStick(m.b);
      if (m.id === me?.id) $('sticks').textContent = ++sticksLit;
    }
    else if (m.t === 'name') remotes.get(m.id)?.avatar.setName(m.name);
    else if (m.t === 'seat') applySeat(m.id, m.i);
    else if (m.t === 'sitfail') flash('Chỗ này đã có người ngồi');
    else if (m.t === 'chat') remotes.get(m.id)?.avatar.say(m.text);
    else if (m.t === 'count') $('count').textContent = m.n;
  };
  ws.onclose = () => { $('hint').textContent = 'Mất kết nối. Tải lại trang để vào lại.'; };
}

function flash(text) {
  const h = $('hint'), old = h.textContent;
  h.textContent = text;
  setTimeout(() => { if (h.textContent === text) h.textContent = old; }, 2000);
}

/** Seats a player (i >= 0) or stands them up (i = -1). The server is the authority on who holds a cushion. */
function applySeat(id, i) {
  for (const [k, who] of taken) if (who === id) taken.delete(k);
  if (i >= 0) taken.set(i, id);
  const who = id === me?.id ? me : remotes.get(id);
  if (!who) return;
  who.seat = i;
  who.avatar.setSeated(i >= 0);
  if (i < 0) return;
  const c = CUSHIONS[i], g = who.avatar.group;
  if (who === me) { g.position.x = c.x; g.position.z = c.z; g.rotation.y = Math.PI; route = []; }
  else Object.assign(who, { tx: c.x, tz: c.z, try: Math.PI });
}

function toggleSit() {
  if (!me) return;
  if (me.seat >= 0) return stand();
  const p = me.avatar.group.position;
  let best = -1, bd = 2.5;
  CUSHIONS.forEach((c, i) => {
    const d = Math.hypot(c.x - p.x, c.z - p.z);
    if (d < bd && !taken.has(i)) { bd = d; best = i; }
  });
  if (best < 0) return flash('Hãy đến gần một chiếc đệm trống để ngồi');
  send({ t: 'sit', i: best });
}

function stand() {
  if (!me || me.seat < 0) return;
  me.seat = -1;
  me.avatar.setSeated(false);
  taken.forEach((who, k) => who === me.id && taken.delete(k));
  send({ t: 'stand' });
}

function addRemote(p) {
  remotes.set(p.id, { avatar: spawn(p), tx: p.x, tz: p.z, try: p.ry, seat: -1 });
}

const send = (msg) => ws?.readyState === 1 && ws.send(JSON.stringify(msg));

// ---------- input ----------
const keys = new Set();
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); keys.clear(); chatInput.focus(); return; } // Enter opens the chat box
  keys.add(e.code);
  if (e.code === 'KeyB') doAction('bow');
  if (e.code === 'KeyG') doAction('greet');
  if (e.code === 'KeyT') doAction('incense');
  if (e.code === 'KeyE') toggleSit();
});
addEventListener('keyup', (e) => keys.delete(e.code));

// Chat: Enter to open, Enter to send, Esc to cancel. Messages show above the sender's head for 15 seconds.
const chatInput = $('chat');
let lastChat = 0;
function sendChat() {
  const text = chatInput.value.replace(/\s+/g, ' ').trim().slice(0, 120);
  chatInput.value = '';
  chatInput.blur();
  const now = performance.now();
  if (!me || !text || now - lastChat < 800) return;
  lastChat = now;
  me.avatar.say(text);
  send({ t: 'chat', text });
}
chatInput.addEventListener('keydown', (e) => {
  if (e.isComposing) return; // Vietnamese IME uses Enter to commit a syllable
  if (e.key === 'Enter') { e.preventDefault(); sendChat(); }
  else if (e.key === 'Escape') chatInput.blur();
});
$('chatSend').onclick = sendChat;

let bows = 0, sticksLit = 0;
const bearingTo = (x, z, b) => Math.atan2(incense.spec(b).x - x, incense.spec(b).z - z); // yaw that faces burner b

function doAction(a) {
  if (!me) return;
  let burner = -1;
  if (a === 'incense') {
    const p = me.avatar.group.position;
    burner = incense.nearest(p.x, p.z, 4.5);
    if (burner < 0) return flash('Hãy lại gần lư hương để thắp nhang');
  }
  if (!me.avatar.play(a)) return;
  route = [];
  if (burner >= 0) { // turn to face the burner for the offering
    me.incenseB = burner;
    const p = me.avatar.group.position;
    me.avatar.group.rotation.y = bearingTo(p.x, p.z, burner);
  }
  send({ t: 'act', a });
  if (a === 'bow') {
    bell(523);
    $('bows').textContent = Math.min(++bows, 108);
  }
}
$('bow').onclick = () => doAction('bow');
$('greet').onclick = () => doAction('greet');
$('incense').onclick = () => doAction('incense');
$('sit').onclick = toggleSit;
$('mute').onclick = () => { $('mute').textContent = toggleMute() ? '🔕 Im lặng' : '🔔 Âm thanh'; };

// Camera orbit: drag to rotate, wheel to zoom. A short press without movement is a click-to-move.
const cam = { yaw: 0, pitch: 0.55, dist: 14 }; // targets set by input
const camS = { yaw: 0, pitch: 0.55, dist: 14, x: 0, y: 2, z: 22, init: false }; // eased values actually used
const ray = new THREE.Raycaster();
let drag = null;
const el = renderer.domElement;
el.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, moved: 0 }; el.setPointerCapture(e.pointerId); });
el.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  drag.moved += Math.abs(dx) + Math.abs(dy);
  drag.x = e.clientX; drag.y = e.clientY;
  cam.yaw -= dx * 0.006;
  cam.pitch = THREE.MathUtils.clamp(cam.pitch + dy * 0.004, 0.15, 1.3);
});
el.addEventListener('pointerup', (e) => {
  if (drag && drag.moved < 6 && me) {
    ray.setFromCamera(new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1), camera);
    const hit = ray.intersectObjects(scene.children, true).find((h) => h.object.userData.walk && h.face?.normal.y > 0.5);
    if (hit) {
      const p = me.avatar.group.position;
      if (me.seat >= 0) stand();
      route = findPath(p.x, p.z, hit.point.x, hit.point.z);
    }
  }
  drag = null;
});
el.addEventListener('wheel', (e) => { cam.dist = THREE.MathUtils.clamp(cam.dist + e.deltaY * 0.01, 5, 32); }, { passive: true });

// ---------- loop ----------
const SPEED = 6;
const vel = new THREE.Vector3(); // eased velocity: avatars accelerate and brake instead of snapping
const ease = (dt, rate) => 1 - Math.exp(-dt * rate); // frame-rate independent smoothing factor
let lastSent = 0, sentState = '';
const clock = new THREE.Clock();
const dir = new THREE.Vector3();

function updateMe(dt) {
  const a = me.avatar;
  dir.set(
    (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0),
    0,
    (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0),
  );
  if (dir.lengthSq() > 0) {
    route = [];
    stand();
    dir.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), camS.yaw);
  } else if (route.length && me.seat < 0) {
    const w = route[0];
    dir.set(w.x - a.group.position.x, 0, w.z - a.group.position.z);
    const left = dir.length();
    if (left < 0.35) { route.shift(); dir.set(0, 0, 0); }
    else dir.normalize().multiplyScalar(route.length === 1 ? Math.max(0.35, Math.min(1, left / 1.5)) : 1); // slow into the last waypoint
  }
  const canMove = !a.action && me.seat < 0;
  const want = canMove ? dir.multiplyScalar(SPEED) : dir.set(0, 0, 0);
  vel.lerp(want, ease(dt, canMove && want.lengthSq() > 0 ? 9 : 12));
  const speed = vel.length();
  const moving = speed > 0.5;
  const p = a.group.position;
  if (speed > 0.01) {
    p.x = THREE.MathUtils.clamp(p.x + vel.x * dt, -BOUNDS, BOUNDS);
    p.z = THREE.MathUtils.clamp(p.z + vel.z * dt, -BOUNDS, BOUNDS);
    collide(p);
  }
  if (moving) a.group.rotation.y = lerpAngle(a.group.rotation.y, Math.atan2(vel.x, vel.z), ease(dt, 12));
  p.y += (floorY(p.x, p.z) + (me.seat >= 0 ? SEAT_Y : 0) - p.y) * ease(dt, 12);
  a.update(dt, moving);

  const now = performance.now();
  const state = `${p.x.toFixed(2)},${p.z.toFixed(2)},${a.group.rotation.y.toFixed(2)}`;
  if (state !== sentState && now - lastSent > 80) {
    sentState = state; lastSent = now;
    send({ t: 'move', x: p.x, z: p.z, ry: a.group.rotation.y });
  }

  // Camera: orbit angles, zoom and the follow point all ease toward their targets
  if (!camS.init) { Object.assign(camS, { x: p.x, y: p.y + 1.4, z: p.z, init: true }); }
  const ko = ease(dt, 10), kf = ease(dt, 14);
  camS.yaw += (cam.yaw - camS.yaw) * ko;
  camS.pitch += (cam.pitch - camS.pitch) * ko;
  camS.dist += (cam.dist - camS.dist) * ko;
  camS.x += (p.x - camS.x) * kf; camS.y += (p.y + 1.4 - camS.y) * kf; camS.z += (p.z - camS.z) * kf;
  const c = Math.cos(camS.pitch) * camS.dist;
  camera.position.set(camS.x + Math.sin(camS.yaw) * c, camS.y + 0.2 + Math.sin(camS.pitch) * camS.dist, camS.z + Math.cos(camS.yaw) * c);
  camera.lookAt(camS.x, camS.y, camS.z);
}

function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function updateRemotes(dt) {
  for (const r of remotes.values()) {
    const g = r.avatar.group;
    const dx = r.tx - g.position.x, dz = r.tz - g.position.z;
    const moving = Math.hypot(dx, dz) > 0.05 && r.seat < 0;
    g.position.x += dx * ease(dt, 10);
    g.position.z += dz * ease(dt, 10);
    g.position.y += (floorY(g.position.x, g.position.z) + (r.seat >= 0 ? SEAT_Y : 0) - g.position.y) * ease(dt, 12);
    g.rotation.y = lerpAngle(g.rotation.y, r.try, ease(dt, 10));
    r.avatar.update(dt, moving);
  }
}

// Idle orbit behind the title screen until the visitor enters.
function tick() {
  const dt = Math.min(clock.getDelta(), 0.1);
  updateNpcs(dt);
  prison.update(dt);
  updatePrisonHud(dt);
  incense.update(dt);
  if (me) { updateMe(dt); updateRemotes(dt); }
  else {
    const t = clock.elapsedTime * 0.08;
    camera.position.set(Math.sin(t) * 30, 12, Math.cos(t) * 30);
    camera.lookAt(0, 4, -8);
  }
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();

$('enter').onclick = () => {
  const name = $('name').value.trim();
  $('start').remove();
  startAudio();
  connect(name);
};
