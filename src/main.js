import * as THREE from 'three';
import { buildWorld, floorY, collide, BOUNDS, CUSHIONS, BURNERS } from './world.js';
import { Incense } from './incense.js';
import { buildPrison } from './prison.js';
import { buildDogWorld } from './dogworld.js';
import { createDogGame } from './dogplay.js';
import { DogAvatar } from './dogavatar.js';
import { inDogZone } from './dogzone.js';
import { buildMeetRoom } from './meetroom.js';
import { createMeeting } from './meeting.js';
import { seatPos } from './meetzone.js';
import { findPath } from './nav.js';
import { Avatar } from './avatar.js';
import { startAudio, bell, toggleMute, moTap, bark, sfx } from './audio.js';

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
const dogWorld = buildDogWorld(scene, camera); // needs the world's lights, so it comes last
const meetRoom = buildMeetRoom(scene, camera);

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

/**
 * A player is a human until they walk into the dog district, where they become a dog.
 * `avatar` is whichever of the two models is currently in the scene; the other is kept (or built on demand).
 */
function makeActor(p, name) {
  const human = new Avatar(p.hue, name);
  human.group.position.set(p.x, floorY(p.x, p.z), p.z);
  human.group.rotation.y = p.ry;
  scene.add(human.group);
  const look = p.look ? { breed: p.look.b || 'ta', acc: p.look.a || [] } : { breed: 'ta', acc: [] };
  return { human, avatar: human, dogAv: null, form: 'human', name, look, hue: p.hue, room: p.room || '' };
}

function setForm(who, toDog) {
  if ((who.form === 'dog') === toDog) return;
  const from = who.avatar;
  if (toDog) {
    if (!who.dogAv) who.dogAv = new DogAvatar(who.name, who.look);
    else who.dogAv.setLook(who.look);
  }
  const to = toDog ? who.dogAv : who.human;
  to.group.position.copy(from.group.position);
  to.group.position.y = toDog ? 0 : floorY(to.group.position.x, to.group.position.z);
  to.group.rotation.y = from.group.rotation.y;
  scene.remove(from.group);
  scene.add(to.group);
  who.avatar = to;
  who.form = toDog ? 'dog' : 'human';
  const p = to.group.position;
  dogWorld.fx.puff(p.x, 0.7, p.z, 16, 0xfff3d0, 1.8);
  dogWorld.fx.stars(p.x, 1.2, p.z);
  sfx('poof', Math.max(0, 1 - camera.position.distanceTo(p) / 40));
}

function renameActor(who, name) {
  who.name = name;
  who.human.setName(name);
  who.dogAv?.setName(name);
}

let lastPos = null; // where the player stood when the connection dropped
function connect(name) {
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  ws.onopen = () => { ws.send(JSON.stringify({ t: 'hello', tok: meeting.tok })); ws.send(JSON.stringify({ t: 'name', name })); };
  ws.onmessage = ({ data }) => {
    const m = JSON.parse(data);
    if (m.t === 'init') {
      if (me) { // reconnected: drop the stale avatars of the previous session
        if (me.form === 'dog') dogGame.end();
        scene.remove(me.avatar.group);
        for (const r of remotes.values()) scene.remove(r.avatar.group);
        remotes.clear(); taken.clear(); taken.set(ABBOT_SEAT, -1);
      }
      const self = m.players.find((p) => p.id === m.id);
      if (lastPos) Object.assign(self, lastPos);
      me = { id: m.id, seat: -1, ...makeActor(self, name || self.name) };
      sentState = '';
      meeting.afterReconnect();
      meeting.onOpen();
      me.human.onPlant = () => { bell(660); send({ t: 'plant', b: me.incenseB }); };
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
      if (r) Object.assign(r, { tx: m.x, tz: m.z, try: m.ry, ty: m.y || 0, st: m.st || '' });
    } else if (m.t === 'look') {
      const r = remotes.get(m.id);
      if (r) { r.look = { breed: m.look.b || 'ta', acc: m.look.a || [] }; r.dogAv?.setLook(r.look); }
    } else if (m.t === 'act') {
      const r = remotes.get(m.id);
      if (!r) return;
      if (r.form === 'dog') remoteDogAct(r, m.a);
      else if (HUMAN_ACTS.has(m.a) && r.avatar.play(m.a) && m.a === 'incense') {
        const b = incense.nearest(r.tx, r.tz, 6);
        if (b >= 0) r.try = bearingTo(r.tx, r.tz, b);
      }
    } else if (m.t === 'stick') {
      incense.addStick(m.b);
      if (m.id === me?.id) $('sticks').textContent = ++sticksLit;
    }
    else if (m.t === 'name') { const r = remotes.get(m.id); if (r) renameActor(r, m.name); }
    else if (m.t === 'seat') applySeat(m.id, m.i);
    else if (m.t === 'sitfail') flash('Chỗ này đã có người ngồi');
    else if (m.t === 'chat') { const r = remotes.get(m.id); if (r && !r.room && !meeting.inRoom) r.avatar.say(m.text); }
    else if (m.t === 'room') { const r = remotes.get(m.id); if (r) r.room = m.code; }
    else if (m.t === 'm') meeting.onMsg(m);
    else if (m.t === 'count') $('count').textContent = m.n;
  };
  ws.onclose = () => {
    if (!me) return;
    const p = me.avatar.group.position;
    lastPos = { x: p.x, z: p.z, ry: me.avatar.group.rotation.y };
    meeting.reconnect();
    $('hint').textContent = 'Mất kết nối. Đang kết nối lại…';
    setTimeout(() => connect(name), 2000);
  };
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
  if (!me || me.form === 'dog') return;
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
  remotes.set(p.id, { ...makeActor(p, p.name), tx: p.x, tz: p.z, try: p.ry, ty: p.y || 0, st: p.st || '', seat: -1 });
}

const HUMAN_ACTS = new Set(['bow', 'greet', 'incense']);

/** Another player's dog action: play the animation and, for barks and bites, the sound at the right distance. */
function remoteDogAct(r, a) {
  if (a === 'wag') return r.avatar.wag(3);
  if (!r.avatar.play(a)) return;
  const vol = Math.max(0, 1 - camera.position.distanceTo(r.avatar.group.position) / 45) ** 2;
  if (a === 'bark') bark(vol);
  else if (a === 'bite') bark(vol * 0.6, 0.8);
  else if (a === 'dig' || a === 'eat' || a === 'sniff') sfx(a === 'dig' ? 'dig' : a === 'eat' ? 'munch' : 'sniff', vol * 0.6);
}

const send = (msg) => ws?.readyState === 1 && ws.send(JSON.stringify(msg));

const dogGame = createDogGame({
  scene, camera, world: dogWorld, send,
  remoteDogs: () => [...remotes.values()].filter((r) => r.form === 'dog').map((r) => ({ x: r.avatar.group.position.x, z: r.avatar.group.position.z, ry: r.avatar.group.rotation.y })),
});

const actorOf = (pid) => (pid === me?.id ? me : remotes.get(pid));
const meeting = createMeeting({
  room: meetRoom, send, actor: actorOf, toast: (t) => flash(t),
  place(x, z, yaw, view) {
    if (!me) return;
    if (view) { // entering a meeting: look down at the room from across the table
      Object.assign(cam, { yaw, pitch: 1.0, dist: 11 });
      Object.assign(camS, { yaw, pitch: 1.0, dist: 11 });
    }
    const g = me.avatar.group;
    g.position.set(x, floorY(x, z), z); g.rotation.y = yaw;
    route = []; vel.set(0, 0, 0); sentState = '';
    camS.x = x; camS.z = z;
  },
  onState(code) {
    if (me) me.room = code;
    $('chat').placeholder = code ? 'Chat trong phòng họp (Enter)…' : 'Nhấn Enter để chat…';
    $('bar').style.display = code ? 'none' : 'flex';
    $('hint').textContent = code ? 'E ngồi/đứng · M micro · H giơ tay · kéo chuột để xoay · cuộn để zoom' : 'WASD / chạm để di chuyển · E để ngồi lên đệm · kéo chuột để xoay · cuộn để zoom';
  },
});

// ---------- input ----------
const keys = new Set();
addEventListener('keydown', (e) => {
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
  if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); keys.clear(); chatInput.focus(); return; } // Enter opens the chat box
  keys.add(e.code);
  if (me && me.form !== 'dog' && !e.repeat && meeting.key(e.code)) { e.preventDefault(); return; }
  if (me?.form === 'dog') { // dog controls: see dogplay.js
    if (e.code === 'Space') e.preventDefault();
    if (!e.repeat && dogGame.key(e.code)) e.preventDefault();
    return;
  }
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
  if (meeting.inRoom) meeting.sendChat(text); else send({ t: 'chat', text });
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
  if (!me || me.form === 'dog') return;
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
$('mtBtn').onclick = () => meeting.openLobby();
const toggleSound = () => { const label = toggleMute() ? '🔕 Im lặng' : '🔔 Âm thanh'; $('mute').textContent = label; $('dogMute').textContent = label; };
$('mute').onclick = toggleSound;
$('dogMute').onclick = toggleSound;
$('dogBar').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-key]');
  if (!b) return;
  dogGame.key(b.dataset.key);
  b.blur(); // so Space (jump) doesn't re-press the button
});

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
      meeting.stand();
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
  const dog = me.form === 'dog';
  dir.set(
    (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0),
    0,
    (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0),
  );
  const chair = dog ? null : meeting.mySeat();
  if (dir.lengthSq() > 0) {
    route = [];
    if (!dog) { stand(); if (chair) meeting.stand(); }
    dir.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), camS.yaw);
  } else if (route.length && me.seat < 0) {
    const w = route[0];
    dir.set(w.x - a.group.position.x, 0, w.z - a.group.position.z);
    const left = dir.length();
    if (left < 0.35) { route.shift(); dir.set(0, 0, 0); }
    else dir.normalize().multiplyScalar(route.length === 1 ? Math.max(0.35, Math.min(1, left / 1.5)) : 1); // slow into the last waypoint
  }
  const p = a.group.position;
  if (dog) dogGame.control(dt, dir, keys); // dogs have their own physics: run, jump, swim, stats
  else {
    const canMove = !a.action && me.seat < 0 && !chair;
    const want = canMove ? dir.multiplyScalar(SPEED) : dir.set(0, 0, 0);
    vel.lerp(want, ease(dt, canMove && want.lengthSq() > 0 ? 9 : 12));
    const speed = vel.length();
    const moving = speed > 0.5;
    if (speed > 0.01) {
      p.x = THREE.MathUtils.clamp(p.x + vel.x * dt, -BOUNDS, BOUNDS);
      p.z = THREE.MathUtils.clamp(p.z + vel.z * dt, -BOUNDS, BOUNDS);
      collide(p);
    }
    if (moving) a.group.rotation.y = lerpAngle(a.group.rotation.y, Math.atan2(vel.x, vel.z), ease(dt, 12));
    if (chair) { p.x = chair.x; p.z = chair.z; a.group.rotation.y = chair.yaw; vel.set(0, 0, 0); }
    p.y += (floorY(p.x, p.z) + (me.seat >= 0 ? SEAT_Y : 0) - p.y) * ease(dt, 12);
    a.update(dt, moving && !chair);
  }

  // Walking into the dog district turns the visitor into a dog; walking out turns them back.
  if (inDogZone(p.x, p.z) !== dog) switchMe(!dog);

  const now = performance.now();
  const state = `${p.x.toFixed(2)},${p.z.toFixed(2)},${a.group.rotation.y.toFixed(2)},${p.y.toFixed(2)},${dogGame.netState}`;
  if (state !== sentState && now - lastSent > 80) {
    sentState = state; lastSent = now;
    send({ t: 'move', x: p.x, z: p.z, ry: a.group.rotation.y, y: me.form === 'dog' ? p.y : 0, st: me.form === 'dog' ? dogGame.netState : '' });
  }

  // Camera: orbit angles, zoom and the follow point all ease toward their targets
  if (!camS.init) { Object.assign(camS, { x: p.x, y: p.y + 1.4, z: p.z, init: true }); }
  const ko = ease(dt, 10), kf = ease(dt, 14);
  camS.yaw += (cam.yaw - camS.yaw) * ko;
  camS.pitch += (cam.pitch - camS.pitch) * ko;
  camS.dist += (cam.dist - camS.dist) * ko;
  const lookH = me.form === 'dog' ? 0.8 : 1.4;
  camS.x += (p.x - camS.x) * kf; camS.y += (p.y + lookH - camS.y) * kf; camS.z += (p.z - camS.z) * kf;
  const c = Math.cos(camS.pitch) * camS.dist;
  camera.position.set(camS.x + Math.sin(camS.yaw) * c, camS.y + 0.2 + Math.sin(camS.pitch) * camS.dist, camS.z + Math.cos(camS.yaw) * c);
  camera.lookAt(camS.x, camS.y, camS.z);
}

/** Swaps the local player between human and dog form and the matching controls and panels. */
function switchMe(toDog) {
  if (!toDog) dogGame.end(); // while the dog model is still in the scene
  stand();
  vel.set(0, 0, 0);
  route = [];
  setForm(me, toDog);
  $('bar').style.display = toDog ? 'none' : 'flex';
  $('dogBar').style.display = toDog ? 'flex' : 'none';
  $('hint').style.bottom = toDog ? '128px' : '';
  $('hint').textContent = toDog ? 'WASD di chuyển · Shift chạy · Space nhảy · Q sủa · V đánh hơi · X đào · F ăn/uống · P hồ sơ chó' : 'WASD / chạm để di chuyển · E để ngồi lên đệm · kéo chuột để xoay · cuộn để zoom';
  if (toDog) dogGame.begin(me);
  else flash('Bạn đã trở lại làm người.');
}

function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function updateRemotes(dt) {
  for (const r of remotes.values()) {
    setForm(r, inDogZone(r.tx, r.tz));
    const inMine = (r.room || '') === meeting.code;
    const ms = inMine && meeting.code ? meeting.seatOf(r.id) : -1;
    if (ms >= 0) { const s = seatPos(ms); Object.assign(r, { tx: s.x, tz: s.z, try: s.yaw }); }
    r.avatar.group.visible = inMine; // people in another meeting room (or outside it) are not shown
    const g = r.avatar.group;
    const dx = r.tx - g.position.x, dz = r.tz - g.position.z;
    const moving = Math.hypot(dx, dz) > 0.05 && r.seat < 0 && r.st !== 'sleep' && ms < 0;
    g.position.x += dx * ease(dt, 10);
    g.position.z += dz * ease(dt, 10);
    if (r.form === 'dog') { // dogs follow the sender's height (jumps, swimming) and pose
      const swim = dogWorld.inWater(g.position.x, g.position.z);
      g.position.y += ((swim ? -0.06 : r.ty) - g.position.y) * ease(dt, 14);
      Object.assign(r.avatar, { swim, gait: Math.hypot(dx, dz) * 10 > 5.5 ? 2 : 1, air: !swim && g.position.y > 0.08 ? (r.ty > g.position.y ? 3 : -3) : 0 });
      r.avatar.setLay(r.st === 'sleep' ? 'sleep' : '');
    } else g.position.y += (floorY(g.position.x, g.position.z) + (r.seat >= 0 ? SEAT_Y : 0) - g.position.y) * ease(dt, 12);
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
  dogWorld.update(dt, { pos: me ? me.avatar.group.position : null, player: me?.form === 'dog' ? dogGame.info : null });
  dogGame.update(dt);
  meeting.update(dt, me ? me.avatar.group.position : null);
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
