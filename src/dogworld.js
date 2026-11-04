import * as THREE from 'three';
import { Parts } from './parts.js';
import { Avatar } from './avatar.js';
import { DogAvatar } from './dogavatar.js';
import { OBSTACLES, collide } from './world.js';
import { findPath } from './nav.js';
import { DOG, inDogZone } from './dogzone.js';
import { sfx, growl, bark, yelp } from './audio.js';

// The dog district: a street with traffic, a park with a pond, two houses, three shops, a pound of rules for strays and
// a population of people and dogs. Also owns the day/night cycle, weather and particle effects. All static scenery is
// built in district-local coordinates inside `root`; anything the gameplay layer talks to is exposed in world coordinates.

const { lerp, clamp, smoothstep } = THREE.MathUtils;
const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra });
const Box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const Cyl = (rt, rb, h, seg = 12) => new THREE.CylinderGeometry(rt, rb, h, seg);
const Cone = (r, h, seg = 12) => new THREE.ConeGeometry(r, h, seg);
const Sph = (r, w = 12, h = 8) => new THREE.SphereGeometry(r, w, h);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const WINDOW = std(0x9fd0f0, { emissive: 0xffd27a, emissiveIntensity: 0, roughness: 0.3 });
const LAMP = std(0xfff2cc, { emissive: 0xffd27a, emissiveIntensity: 0.1 });
const MAT = {
  asphalt: std(0x45484f), sidewalk: std(0xcfcabf), curb: std(0xa9a49a), lawn: std(0x8fd16a), dirt: std(0x8a6a45),
  white: std(0xf4f4f0), yellow: std(0xf2c230), wood: std(0x8a5a30), woodLight: std(0xc9a46a), floor: std(0xd8b98a),
  fence: std(0xeadfc2), trunk: std(0x6b4a2b), leaf: std(0x4f9a46), leaf2: std(0x6fb04a), stone: std(0x9a9a98),
  metal: std(0x7c8087, { metalness: 0.4, roughness: 0.5 }), red: std(0xd9453a), blue: std(0x3f78c4), green: std(0x3f9b55),
  orange: std(0xf0883a), pink: std(0xf27aa8), black: std(0x2a2a2e), meat: std(0xc4524a), sausage: std(0xb04a3a),
  cream: std(0xf3ead2), purple: std(0x8a4fd8), brown: std(0x6a4630), glass: WINDOW, lamp: LAMP,
  flowerA: std(0xf26a8a), flowerB: std(0xf2d24a), flowerC: std(0xffffff), rug: std(0xb85a4a), bed: std(0x5a7fc4),
};

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function signBoard(text, w, h, bg = '#1f4e79', fg = '#fff') {
  const tex = canvasTex(640, Math.round(640 * (h / w)), (g, cw, ch) => {
    g.fillStyle = bg; g.fillRect(0, 0, cw, ch);
    g.strokeStyle = '#f2b616'; g.lineWidth = 10; g.strokeRect(10, 10, cw - 20, ch - 20);
    g.fillStyle = fg; g.font = `bold ${ch * 0.5}px system-ui, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, cw / 2, ch / 2 + 4, cw - 40);
  });
  const face = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 });
  const m = new THREE.Mesh(Box(w, h, 0.2), [MAT.wood, MAT.wood, MAT.wood, MAT.wood, face, face]);
  m.castShadow = true;
  return m;
}

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- particles ----------

const glyphTex = (draw) => canvasTex(64, 64, (g) => { g.clearRect(0, 0, 64, 64); draw(g); });
let TEX;
function textures() {
  return TEX ||= {
    heart: glyphTex((g) => { g.font = '48px serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('❤️', 32, 36); }),
    puff: glyphTex((g) => { const r = g.createRadialGradient(32, 32, 2, 32, 32, 30); r.addColorStop(0, 'rgba(255,255,255,.95)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); }),
    glow: glyphTex((g) => { const r = g.createRadialGradient(32, 32, 1, 32, 32, 30); r.addColorStop(0, 'rgba(120,240,255,1)'); r.addColorStop(0.4, 'rgba(80,200,255,.6)'); r.addColorStop(1, 'rgba(80,200,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); }),
    star: glyphTex((g) => { g.font = '44px serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('⭐', 32, 36); }),
    drop: glyphTex((g) => { g.fillStyle = '#9fd4ff'; g.beginPath(); g.arc(32, 32, 14, 0, 7); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 3; g.stroke(); }),
    ring: glyphTex((g) => { g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 4; g.beginPath(); g.arc(32, 32, 24, 0, 7); g.stroke(); }),
    bone: glyphTex((g) => { g.font = '44px serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('🦴', 32, 36); }),
    paw: glyphTex((g) => { g.font = '44px serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('🐾', 32, 36); }),
  };
}

class Fx {
  constructor(scene) {
    this.scene = scene;
    this.free = [];
    this.live = [];
    this.texts = [];
    for (let i = 0; i < 160; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
      s.visible = false;
      s.renderOrder = 9;
      scene.add(s);
      this.free.push(s);
    }
  }

  /** Emits one sprite particle. */
  emit(tex, x, y, z, { v = [0, 0, 0], life = 1, size = 0.5, grow = 0, g = 0, color = 0xffffff, opacity = 1 } = {}) {
    const s = this.free.pop();
    if (!s) return;
    s.material.map = textures()[tex];
    s.material.color.set(color);
    s.material.needsUpdate = true;
    s.position.set(x, y, z);
    s.scale.setScalar(size);
    s.visible = true;
    this.live.push({ s, v: new THREE.Vector3(...v), life, max: life, size, grow, g, opacity });
  }

  hearts(x, y, z, n = 6) { for (let i = 0; i < n; i++) this.emit('heart', x + rand(-0.4, 0.4), y, z + rand(-0.4, 0.4), { v: [rand(-0.3, 0.3), rand(0.8, 1.4), rand(-0.3, 0.3)], life: rand(1.4, 2.2), size: rand(0.35, 0.6) }); }
  puff(x, y, z, n = 10, color = 0xffffff, spread = 1.2) { for (let i = 0; i < n; i++) this.emit('puff', x + rand(-0.3, 0.3), y + rand(0, 0.5), z + rand(-0.3, 0.3), { v: [rand(-spread, spread), rand(0.2, 1.2), rand(-spread, spread)], life: rand(0.6, 1.1), size: 0.6, grow: 1.4, color, opacity: 0.8 }); }
  dirt(x, y, z) { this.puff(x, y, z, 3, 0x8a6a45, 1.6); }
  splash(x, z) { for (let i = 0; i < 6; i++) this.emit('drop', x + rand(-0.4, 0.4), 0.2, z + rand(-0.4, 0.4), { v: [rand(-1, 1), rand(1.5, 3), rand(-1, 1)], life: 0.7, size: 0.18, g: 9 }); this.emit('ring', x, 0.1, z, { life: 1.1, size: 0.4, grow: 2.2 }); }
  stars(x, y, z) { for (let i = 0; i < 5; i++) this.emit('star', x, y, z, { v: [rand(-1.5, 1.5), rand(0.5, 2), rand(-1.5, 1.5)], life: 0.9, size: 0.4 }); }

  /** Floating label such as "+10 XP". */
  text(str, x, y, z, color = '#fff') {
    const tex = canvasTex(256, 64, (g, w, h) => {
      g.font = 'bold 34px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,.65)'; g.strokeText(str, w / 2, h / 2);
      g.fillStyle = color; g.fillText(str, w / 2, h / 2);
    });
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    s.scale.set(2.4, 0.6, 1);
    s.position.set(x, y, z);
    s.renderOrder = 12;
    this.scene.add(s);
    this.texts.push({ s, life: 1.8 });
  }

  update(dt) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];
      p.life -= dt;
      if (p.life <= 0) { p.s.visible = false; this.free.push(p.s); this.live.splice(i, 1); continue; }
      p.v.y -= p.g * dt;
      p.s.position.addScaledVector(p.v, dt);
      p.size += p.grow * dt;
      p.s.scale.setScalar(p.size);
      p.s.material.opacity = Math.min(1, p.life / (p.max * 0.5)) * p.opacity;
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt;
      t.s.position.y += dt * 0.9;
      t.s.material.opacity = Math.min(1, t.life);
      if (t.life <= 0) { this.scene.remove(t.s); t.s.material.map.dispose(); t.s.material.dispose(); this.texts.splice(i, 1); }
    }
  }
}

// ---------- people ----------

/** An NPC that follows waypoints (A* over the shared obstacle map) or walks straight at a point. */
export class Walker {
  constructor(scene, avatar, x, z, face = 0) {
    this.avatar = avatar;
    avatar.group.position.set(x, 0, z);
    avatar.group.rotation.y = face;
    scene.add(avatar.group);
    this.path = [];
    this.speed = 1.4;
    this.moving = false;
    this.yaw = face;
  }
  get pos() { return this.avatar.group.position; }
  get idle() { return this.path.length === 0; }
  goTo(x, z, speed = 1.4, usePath = true) {
    this.speed = speed;
    const route = usePath ? findPath(this.pos.x, this.pos.z, x, z) : [];
    this.path = route.length ? route : [{ x, z }];
  }
  stop() { this.path = []; }
  face(x, z) { this.yaw = Math.atan2(x - this.pos.x, z - this.pos.z); }
  update(dt) {
    const p = this.pos;
    let moving = false;
    if (this.path.length) {
      const w = this.path[0], dx = w.x - p.x, dz = w.z - p.z, d = Math.hypot(dx, dz);
      if (d < 0.3) this.path.shift();
      else {
        const s = Math.min(d, this.speed * dt);
        p.x += (dx / d) * s; p.z += (dz / d) * s;
        this.yaw = Math.atan2(dx, dz);
        moving = true;
        collide(p, 0.35);
      }
    }
    const g = this.avatar.group;
    let d = this.yaw - g.rotation.y;
    d = ((d + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    g.rotation.y += d * (1 - Math.exp(-dt * 10));
    this.moving = moving;
    this.avatar.update(dt, moving);
  }
}

/** A stray or neighbourhood dog. Temper decides how it reacts to the player. */
class StrayDog {
  constructor(scene, { name, breed, temper, home, range = 7, acc = [], scale = 1 }) {
    this.name = name;
    this.temper = temper; // friendly | shy | grumpy | female
    this.av = new DogAvatar(name, { breed, acc }, scale);
    this.home = home;
    this.range = range;
    this.av.group.position.set(home[0], 0, home[1]);
    scene.add(this.av.group);
    this.mode = 'idle';
    this.timer = rand(1, 4);
    this.goal = null;
    this.yaw = rand(0, 6);
    this.pause = 0;
    this.affinity = 0; // how well the player has befriended it
    this.hp = temper === 'grumpy' ? 40 : 20;
    this.heat = 0; // seconds until it can mate again
    this.biteCd = 0;
    this.growlCd = 0;
    this.fled = 0;
    this.lookAt = null;
    this.stuck = 0;
  }
  get pos() { return this.av.group.position; }
  say(t, s = 2.5) { this.av.say(t, s); }

  /** Holds still for a moment, optionally turning toward a point. */
  hold(sec, toward) { this.pause = sec; this.mode = 'idle'; this.goal = null; if (toward) this.yaw = Math.atan2(toward.x - this.pos.x, toward.z - this.pos.z); }

  update(dt, player, night) {
    const av = this.av, p = this.pos;
    this.timer -= dt; this.biteCd -= dt; this.growlCd -= dt; this.heat = Math.max(0, this.heat - dt); this.fled = Math.max(0, this.fled - dt);
    const dx = player ? player.x - p.x : 1e9, dz = player ? player.z - p.z : 1e9, dist = Math.hypot(dx, dz);
    let speed = 0, gait = 1;
    if (this.pause > 0) this.pause -= dt;
    else {
      // reactions to the player, then ordinary wandering
      if (this.fled > 0 && player) { this.goal = [p.x - dx / (dist || 1) * 6, p.z - dz / (dist || 1) * 6]; speed = 5; gait = 2; this.mode = 'flee'; }
      else if (this.temper === 'grumpy' && dist < 5.5 && this.hp > 0) {
        this.yaw = Math.atan2(dx, dz);
        if (dist < 2.2 && this.biteCd <= 0 && player.hit) { this.biteCd = 3; av.play('bite'); player.hit(8, this); }
        else if (this.growlCd <= 0) { this.growlCd = 3; growl(clamp(1 - dist / 12, 0.1, 1)); this.say('Grrr...', 2); }
        speed = dist < 3.4 && dist > 1.4 ? 1.8 : 0;
      } else if (this.temper === 'shy' && dist < 4.5 && player.running) { this.goal = [p.x - dx / (dist || 1) * 6, p.z - dz / (dist || 1) * 6]; speed = 4.5; gait = 2; this.mode = 'flee'; }
      else if ((this.temper === 'friendly' || (this.temper === 'female' && this.affinity > 0)) && dist < 9 && dist > 2.4 && player.calm) { this.goal = [player.x, player.z]; speed = 2.4; this.mode = 'approach'; }
      else if (this.mode === 'idle' && this.timer <= 0) {
        if (night && Math.random() < 0.4) { av.setLay('sleep'); this.timer = rand(8, 20); }
        else { av.setLay(''); if (Math.random() < 0.3) av.play('sniff'); this.mode = 'walk'; this.goal = this.pickGoal(); this.timer = rand(6, 12); }
      } else if (this.mode === 'walk' || this.mode === 'approach' || this.mode === 'flee') {
        if (!this.goal || this.timer <= 0 || Math.hypot(this.goal[0] - p.x, this.goal[1] - p.z) < 0.6 || (this.mode === 'approach' && dist <= 2.4)) {
          this.mode = 'idle'; this.goal = null; this.timer = rand(2, 7);
        } else { speed = this.mode === 'flee' ? 5 : this.mode === 'approach' ? 2.4 : 1.5; gait = speed > 3 ? 2 : 1; }
      }
      if (this.mode === 'approach' && dist <= 2.4) { this.yaw = Math.atan2(dx, dz); av.wag(1.5); }
    }
    if (this.goal && speed > 0) {
      const gx = this.goal[0] - p.x, gz = this.goal[1] - p.z, gd = Math.hypot(gx, gz) || 1;
      const nx = p.x + (gx / gd) * speed * dt, nz = p.z + (gz / gd) * speed * dt;
      const ox = p.x, oz = p.z;
      p.x = nx; p.z = nz;
      collide(p, 0.4);
      if (!inDogZone(p.x, p.z) || Math.hypot(p.x - ox, p.z - oz) < speed * dt * 0.3) { this.stuck += dt; p.x = ox; p.z = oz; if (this.stuck > 0.6) { this.stuck = 0; this.timer = 0; this.goal = null; this.mode = 'idle'; } }
      else this.stuck = 0;
      this.yaw = Math.atan2(gx, gz);
    }
    if (speed > 0.2) av.setLay('');
    const g = av.group;
    let d = this.yaw - g.rotation.y;
    d = ((d + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    g.rotation.y += d * (1 - Math.exp(-dt * 8));
    av.gait = gait;
    av.update(dt, speed > 0.2);
  }

  pickGoal() {
    for (let i = 0; i < 8; i++) {
      const x = this.home[0] + rand(-this.range, this.range), z = this.home[1] + rand(-this.range, this.range);
      if (isFree(x, z)) return [x, z];
    }
    return this.home;
  }
}

/** True when a dog-sized body fits at the world position (inside the district, not in an obstacle). */
function isFree(x, z, r = 0.5) {
  if (!inDogZone(x, z)) return false;
  for (const o of OBSTACLES) {
    if (o.r !== undefined) { if (Math.hypot(x - o.x, z - o.z) < o.r + r) return false; }
    else if (x > o.x0 - r && x < o.x1 + r && z > o.z0 - r && z < o.z1 + r) return false;
  }
  return true;
}

// ---------- the world ----------

const DAY_SEC = 720; // one full day lasts 12 real minutes
const PARK = { x0: -24, x1: -4, z0: -28, z1: -1 };
const POND = { x: -14, z: -14, r: 5.2 };

export function buildDogWorld(scene, camera) {
  const root = new THREE.Group();
  root.position.set(DOG.cx, 0, DOG.cz);
  scene.add(root);
  const fx = new Fx(scene);
  const obsBox = (lx, lz, w, d) => OBSTACLES.push({ x0: DOG.cx + lx - w / 2, x1: DOG.cx + lx + w / 2, z0: DOG.cz + lz - d / 2, z1: DOG.cz + lz + d / 2 });
  const obsCircle = (lx, lz, r) => OBSTACLES.push({ x: DOG.cx + lx, z: DOG.cz + lz, r });
  const slab = (geo, mat, x, y, z, walk = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.receiveShadow = true;
    if (walk) m.userData.walk = true;
    root.add(m);
    return m;
  };

  const world = {
    root, fx, items: [], buildings: [], dogs: [], people: [], cars: [], buried: [], marks: [], decals: [],
    pond: { x: DOG.cx + POND.x, z: DOG.cz + POND.z, r: POND.r },
    clock: { hour: 8, daylight: 1, night: 0, weather: 'clear', rain: 0, cloud: 0 },
    blend: 0,
  };

  // ---- ground, street, sidewalks ----
  slab(Box(103, 0.08, 6), MAT.asphalt, 15.5, 0.04, 6);
  for (const z of [1.5, 10.5]) slab(Box(48, 0.1, 3), MAT.sidewalk, 0, 0.05, z);
  slab(Box(19.6, 0.06, 26.6), MAT.lawn, -14, 0.03, -14.5);
  slab(Box(9, 0.05, 11), MAT.dirt, 19, 0.025, -22);
  {
    const P = new Parts(MAT);
    for (let x = -34; x <= 66; x += 4) P.add('yellow', Box(2, 0.01, 0.15), { p: [x, 0.085, 6] });
    for (let k = 0; k < 10; k++) P.add('white', Box(0.5, 0.01, 5.6), { p: [-3 + k, 0.086, 6] });
    for (const z of [3.05, 8.95]) P.add('curb', Box(48, 0.14, 0.2), { p: [0, 0.07, z] });
    for (const [x, z, d] of [[6, -2.3, 4.4], [18, -2.3, 4.4], [14, 13.4, 3.2], [1, 13.4, 3.2], [-12, 13.4, 3.2]]) P.add('stone', Box(2.2, 0.07, d), { p: [x, 0.04, z] });
    const r = rng(7);
    for (let i = 0; i < 70; i++) { // flowers in the lawn
      const x = PARK.x0 + 1 + r() * 18, z = PARK.z0 + 1 + r() * 25;
      if (Math.hypot(x - POND.x, z - POND.z) < POND.r + 1) continue;
      P.add(['flowerA', 'flowerB', 'flowerC'][i % 3], Sph(0.1, 6, 5), { p: [x, 0.12, z] });
    }
    root.add(P.build({ castShadow: false, receiveShadow: true }));
  }

  // ---- perimeter fence and the gate ----
  {
    const P = new Parts(MAT);
    const run = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 2.4)), alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
      for (let i = 0; i <= n; i++) P.add('fence', Box(0.18, 1.1, 0.18), { p: [x0 + ((x1 - x0) * i) / n, 0.55, z0 + ((z1 - z0) * i) / n] });
      for (const y of [0.35, 0.85]) P.add('fence', alongX ? Box(len, 0.1, 0.05) : Box(0.05, 0.1, len), { p: [(x0 + x1) / 2, y, (z0 + z1) / 2] });
      obsBox((x0 + x1) / 2, (z0 + z1) / 2, alongX ? len : 0.3, alongX ? 0.3 : len);
    };
    run(-24, -28, 24, -28); run(-24, 28, 24, 28);
    run(24, -28, 24, 2.2); run(24, 9.8, 24, 28);
    run(-24, -28, -24, 2.2); run(-24, 9.8, -24, 28);
    for (const sx of [-1, 1]) for (const z of [2.2, 9.8]) { // gate pillars
      P.add('stone', Box(1, 5, 1), { p: [sx * 24, 2.5, z] });
      P.add('stone', Box(1.3, 0.3, 1.3), { p: [sx * 24, 5.1, z] });
      obsBox(sx * 24, z, 1.1, 1.1);
    }
    // a giant bone on top of each gate
    for (const sx of [-1, 1]) {
      P.add('cream', Cyl(0.15, 0.15, 2.8, 8), { p: [sx * 24, 5.9, 6], r: [Math.PI / 2, 0, 0] });
      for (const z of [4.6, 7.4]) for (const dz of [-0.17, 0.17]) P.add('cream', Sph(0.25, 8, 6), { p: [sx * 24, 5.9, z + dz] });
    }
    root.add(P.build({ castShadow: true }));
    for (const sx of [-1, 1]) {
      const s = signBoard('🐕 THẾ GIỚI CHÓ 🐕', 8.6, 1.5, '#7a4a1e', '#ffe9b0');
      s.rotation.y = Math.PI / 2;
      s.position.set(sx * 24, 4.25, 6);
      root.add(s);
    }
    const portal = new THREE.Mesh(Box(0.25, 0.02, 6), new THREE.MeshBasicMaterial({ color: 0x7ad6ff, transparent: true, opacity: 0.6 }));
    portal.position.set(24, 0.1, 6);
    root.add(portal);
    world.portal = portal;
  }

  // ---- trees, furniture, lamps ----
  const trees = [[-21, -22], [-7, -24], [-21, -4.5], [-6, -12], [-9, -20.5], [-20.5, -13], [3, -21], [11, -23], [-23, 24], [22, 25]];
  const lampSpots = [[-18, 2.6], [-6, 2.6], [6, 2.6], [18, 2.6]];
  const lampLights = [];
  {
    const P = new Parts(MAT);
    for (const [x, z] of trees) {
      const s = rand(0.9, 1.3);
      P.add('trunk', Cyl(0.2 * s, 0.3 * s, 2.4 * s, 8), { p: [x, 1.2 * s, z] });
      P.add('leaf', Sph(1.5 * s, 10, 8), { p: [x, 3.1 * s, z] });
      P.add('leaf2', Sph(1.1 * s, 10, 8), { p: [x + 0.7 * s, 3.8 * s, z - 0.3 * s] });
      P.add('leaf2', Sph(1.0 * s, 10, 8), { p: [x - 0.8 * s, 3.5 * s, z + 0.4 * s] });
      obsCircle(x, z, 0.45);
      world.marks.push({ x: DOG.cx + x, z: DOG.cz + z, kind: 'tree' });
    }
    const bench = (x, z, rot) => {
      const r = rot ? Math.PI / 2 : 0;
      P.add('wood', Box(1.8, 0.1, 0.5), { p: [x, 0.5, z], r: [0, r, 0] });
      P.add('wood', Box(1.8, 0.5, 0.08), { p: [x + (rot ? -0.22 : 0), 0.8, z + (rot ? 0 : -0.22)], r: [0, r, 0] });
      for (const s of [-0.7, 0.7]) P.add('metal', Box(0.08, 0.5, 0.4), { p: [x + (rot ? 0 : s), 0.25, z + (rot ? s : 0)] });
      obsBox(x, z, rot ? 0.6 : 1.9, rot ? 1.9 : 0.6);
    };
    bench(-10, -3.2, false); bench(-8.5, -21, false); bench(-22, -17, true); bench(-5.5, -17, true);
    world.benches = [[-10, -3.2], [-8.5, -21], [-22, -17], [-5.5, -17]].map(([x, z]) => [DOG.cx + x, DOG.cz + z]);
    // picnic table
    P.add('woodLight', Box(2.2, 0.1, 1.1), { p: [-6, 0.8, -8] });
    for (const s of [-1, 1]) P.add('wood', Box(2.2, 0.08, 0.4), { p: [-6, 0.45, -8 + s * 0.95] });
    for (const s of [-0.9, 0.9]) P.add('wood', Box(0.1, 0.8, 1.0), { p: [-6 + s, 0.4, -8] });
    obsBox(-6, -8, 2.4, 2.4);
    // playground: slide, swings, seesaw
    P.add('red', Box(0.9, 0.12, 3.2), { p: [-21, 1.0, -25], r: [0.55, 0, 0] });
    P.add('yellow', Box(1.4, 0.12, 1.2), { p: [-21, 1.9, -26.7] });
    for (const s of [-0.6, 0.6]) P.add('metal', Box(0.08, 2.0, 0.08), { p: [-21 + s, 1.0, -27.1] });
    obsBox(-21, -25.8, 1.6, 3.8);
    for (const s of [-2, 2]) P.add('metal', Box(0.1, 2.6, 0.1), { p: [-9 + s, 1.3, -26], r: [0, 0, 0] });
    P.add('metal', Box(4.4, 0.1, 0.1), { p: [-9, 2.6, -26] });
    for (const s of [-1, 1]) { P.add('metal', Box(0.03, 1.8, 0.03), { p: [-9 + s, 1.7, -26] }); P.add('blue', Box(0.6, 0.06, 0.3), { p: [-9 + s, 0.75, -26] }); }
    obsBox(-9, -26, 4.4, 0.5);
    P.add('green', Box(3, 0.1, 0.4), { p: [-16, 0.6, -25], r: [0, 0, 0.12] });
    P.add('metal', Cyl(0.15, 0.2, 0.55, 8), { p: [-16, 0.28, -25] });
    // street furniture: lamps, hydrants, bins
    for (const [x, z] of lampSpots) {
      P.add('metal', Cyl(0.07, 0.1, 4.2, 8), { p: [x, 2.1, z] });
      P.add('metal', Box(0.9, 0.08, 0.08), { p: [x, 4.2, z + 0.4] });
      P.add('lamp', Box(0.5, 0.18, 0.3), { p: [x, 4.1, z + 0.75] });
      obsCircle(x, z, 0.2);
      world.marks.push({ x: DOG.cx + x, z: DOG.cz + z, kind: 'lamp' });
      const l = new THREE.PointLight(0xffd9a0, 0, 20, 1.3);
      l.position.set(x, 3.9, z + 0.75);
      root.add(l);
      lampLights.push(l);
    }
    for (const [x, z] of [[-10, 2.6], [20, 10.4], [-21, 10.4]]) {
      P.add('red', Cyl(0.14, 0.17, 0.6, 8), { p: [x, 0.3, z] });
      P.add('red', Sph(0.15, 8, 6), { p: [x, 0.65, z] });
      obsCircle(x, z, 0.25);
      world.marks.push({ x: DOG.cx + x, z: DOG.cz + z, kind: 'hydrant' });
    }
    for (const [x, z] of [[-19, 11.2], [21, 0.8], [-12, -3.5]]) {
      P.add('green', Cyl(0.35, 0.3, 0.9, 10), { p: [x, 0.45, z] });
      P.add('black', Cyl(0.38, 0.38, 0.1, 10), { p: [x, 0.95, z] });
      obsCircle(x, z, 0.4);
    }
    // alley dumpster
    P.add('green', Box(2.6, 1.3, 1.3), { p: [-4, 0.65, 26.5] });
    P.add('black', Box(2.7, 0.12, 1.4), { p: [-4, 1.36, 26.5] });
    obsBox(-4, 26.5, 2.8, 1.5);
    // doghouse behind the owner's home
    P.add('wood', Box(1.6, 1.0, 1.6), { p: [2, 0.5, -20] });
    P.add('red', Box(1.9, 0.12, 1.1), { p: [2, 1.2, -20.4], r: [0.7, 0, 0] });
    P.add('red', Box(1.9, 0.12, 1.1), { p: [2, 1.2, -19.6], r: [-0.7, 0, 0] });
    P.add('black', Box(0.7, 0.75, 0.1), { p: [2, 0.38, -19.18] });
    obsBox(2, -20, 1.8, 1.8);
    root.add(P.build({ castShadow: true, receiveShadow: false }));
    world.doghouse = [DOG.cx + 2, DOG.cz - 18.3];
    // pond
    const water = new THREE.Mesh(new THREE.CircleGeometry(POND.r, 32), new THREE.MeshStandardMaterial({ color: 0x4aa8d8, transparent: true, opacity: 0.85, roughness: 0.15, metalness: 0.1 }));
    water.rotation.x = -Math.PI / 2;
    water.position.set(POND.x, 0.08, POND.z);
    root.add(water);
    world.water = water;
    const R = new Parts(MAT);
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      R.add('stone', Box(0.9, 0.3, 0.5), { p: [POND.x + Math.cos(a) * (POND.r + 0.25), 0.15, POND.z + Math.sin(a) * (POND.r + 0.25)], r: [0, -a + Math.PI / 2, 0] });
    }
    for (let i = 0; i < 6; i++) R.add('green', Cyl(0.35, 0.35, 0.02, 10), { p: [POND.x + Math.cos(i * 1.1) * 3, 0.1, POND.z + Math.sin(i * 1.7) * 2.5] });
    root.add(R.build({ castShadow: false }));
  }

  // ---- buildings ----
  /** A one-room building. f = +1: door in the +z wall, f = -1: door in the -z wall. The roof hides while a dog is inside. */
  function building({ name, x, z, w, d, f, wall, roof, doorW = 2.2, H = 3.4, sign, awning }) {
    const mats = { ...MAT, wall: std(wall, { side: THREE.DoubleSide }), roof: std(roof) };
    const P = new Parts(mats), R = new Parts(mats), T = 0.25;
    const fz = z + f * (d / 2), bz = z - f * (d / 2), segW = (w - doorW) / 2;
    P.add('wall', Box(w, H, T), { p: [x, H / 2, bz] });
    for (const s of [-1, 1]) P.add('wall', Box(T, H, d), { p: [x + (s * w) / 2, H / 2, z] });
    for (const s of [-1, 1]) P.add('wall', Box(segW, H, T), { p: [x + s * (doorW / 2 + segW / 2), H / 2, fz] });
    P.add('wall', Box(doorW, H - 2.4, T), { p: [x, 2.4 + (H - 2.4) / 2, fz] });
    for (const s of [-1, 1]) P.add('wood', Box(0.14, 2.4, 0.32), { p: [x + s * (doorW / 2), 1.2, fz] });
    for (const s of [-1, 1]) {
      P.add('glass', Box(1.1, 0.9, 0.06), { p: [x + s * (doorW / 2 + segW / 2), 1.7, fz + f * 0.1] });
      P.add('glass', Box(0.06, 0.9, 1.2), { p: [x + (s * w) / 2, 1.7, z] });
    }
    // gable triangles + two roof slabs
    const a = 0.42, run = d / 2 + 0.7, rise = run * Math.tan(a), len = run / Math.cos(a);
    const tri = new THREE.Shape([new THREE.Vector2(-d / 2, 0), new THREE.Vector2(d / 2, 0), new THREE.Vector2(0, rise - 0.05)]);
    for (const s of [-1, 1]) P.add('wall', new THREE.ShapeGeometry(tri), { p: [x + (s * w) / 2, H, z], r: [0, Math.PI / 2, 0] });
    for (const s of [-1, 1]) R.add('roof', Box(w + 1.4, 0.16, len), { p: [x, H + rise / 2, z + (s * run) / 2], r: [s * a, 0, 0] });
    R.add('roof', Box(w + 1.5, 0.22, 0.3), { p: [x, H + rise, z] });
    root.add(P.build({ castShadow: true, receiveShadow: true }));
    // floor
    slab(Box(w - T, 0.03, d - T), MAT.floor, x, 0.03, z);
    // collision
    obsBox(x, bz, w, T);
    for (const s of [-1, 1]) obsBox(x + (s * w) / 2, z, T, d);
    for (const s of [-1, 1]) obsBox(x + s * (doorW / 2 + segW / 2), fz, segW, T);
    const b = {
      name, x: DOG.cx + x, z: DOG.cz + z, f, w, d, roof: R.build({ castShadow: true }),
      rect: { x0: DOG.cx + x - w / 2 + T, x1: DOG.cx + x + w / 2 - T, z0: DOG.cz + z - d / 2 + T, z1: DOG.cz + z + d / 2 - T },
      door: [DOG.cx + x, DOG.cz + fz + f * 1.0],
      local: { x, z, fz, bz },
    };
    if (sign) {
      const s = signBoard(sign, Math.min(w - 1, 4.4), 0.8, awning || '#1f4e79');
      s.position.set(x, 2.95, fz + f * 0.2);
      root.add(s);
    }
    root.add(b.roof);
    world.buildings.push(b);
    return b;
  }

  const home = building({ name: 'Nhà của chủ', x: 6, z: -9, w: 9, d: 9, f: 1, wall: 0xf1e2bf, roof: 0xb5483a, sign: 'NHÀ CỦA CHỦ', awning: '#7a4a1e' });
  const neighbor = building({ name: 'Nhà hàng xóm', x: 18, z: -9, w: 8, d: 9, f: 1, wall: 0xa9cfe8, roof: 0x45709e });
  const butcher = building({ name: 'Tiệm thịt', x: 14, z: 19.5, w: 9, d: 9, f: -1, wall: 0xe3a090, roof: 0x8a3a2a, sign: 'TIỆM THỊT', awning: '#a8322a' });
  const petshop = building({ name: 'Cửa hàng thú cưng', x: 1, z: 19.5, w: 9, d: 9, f: -1, wall: 0xf0b9a8, roof: 0x3f78c4, sign: 'PET SHOP', awning: '#3f78c4' });
  const grocery = building({ name: 'Tạp hóa', x: -12, z: 19.5, w: 9, d: 9, f: -1, wall: 0xb8d9a8, roof: 0x5a8a3a, sign: 'TẠP HÓA', awning: '#3f7a3a' });
  world.home = home; world.petshop = petshop; world.butcher = butcher;

  {
    const P = new Parts(MAT);
    // home: sofa, rug, table, dog bed, plant
    P.add('rug', Box(3.2, 0.02, 2.4), { p: [6, 0.05, -9.2] });
    P.add('blue', Box(3, 0.5, 1.0), { p: [6, 0.3, -12.7] });
    P.add('blue', Box(3, 0.7, 0.25), { p: [6, 0.75, -13.1] });
    P.add('blue', Box(0.25, 0.7, 1.0), { p: [4.4, 0.55, -12.7] });
    P.add('blue', Box(0.25, 0.7, 1.0), { p: [7.6, 0.55, -12.7] });
    obsBox(6, -12.8, 3.3, 1.2);
    P.add('wood', Box(1.5, 0.12, 0.9), { p: [6, 0.45, -9.2] });
    for (const sx of [-0.6, 0.6]) for (const sz of [-0.3, 0.3]) P.add('wood', Box(0.08, 0.4, 0.08), { p: [6 + sx, 0.22, -9.2 + sz] });
    obsBox(6, -9.2, 1.6, 1.0);
    P.add('bed', Cyl(0.85, 0.95, 0.28, 16), { p: [9, 0.16, -12] });
    P.add('cream', Cyl(0.6, 0.65, 0.12, 16), { p: [9, 0.3, -12] });
    P.add('green', Cyl(0.25, 0.2, 0.5, 8), { p: [2.2, 0.28, -5.6] });
    P.add('leaf', Sph(0.45, 8, 6), { p: [2.2, 0.85, -5.6] });
    P.add('black', Box(1.5, 0.9, 0.1), { p: [9.9, 1.6, -9] , r: [0, 0, 0] });
    // neighbour: kitchen counter and table
    P.add('woodLight', Box(5, 1.0, 0.8), { p: [18, 0.5, -12.9] });
    obsBox(18, -12.9, 5, 0.9);
    P.add('wood', Box(1.6, 0.1, 1.0), { p: [18, 0.7, -8.5] });
    for (const sx of [-0.7, 0.7]) P.add('wood', Box(0.08, 0.7, 0.08), { p: [18 + sx, 0.35, -8.5] });
    obsBox(18, -8.5, 1.7, 1.1);
    // butcher: counter, display table, hanging sausages
    P.add('white', Box(6, 1.0, 0.9), { p: [14, 0.5, 20.8] });
    P.add('metal', Box(6.1, 0.08, 1.0), { p: [14, 1.04, 20.8] });
    obsBox(14, 20.8, 6.2, 1.0);
    P.add('woodLight', Box(2.6, 0.12, 1.1), { p: [11, 0.85, 16.9] });
    for (const sx of [-1.1, 1.1]) P.add('wood', Box(0.1, 0.85, 1.0), { p: [11 + sx, 0.42, 16.9] });
    obsBox(11, 16.9, 2.8, 1.3);
    P.add('metal', Box(7, 0.08, 0.08), { p: [14, 2.9, 22.4] });
    for (let i = 0; i < 7; i++) P.add('sausage', Cyl(0.07, 0.07, 0.6, 6), { p: [11 + i, 2.55, 22.4] });
    // pet shop: counter, shelves with colourful boxes, accessory pegs
    P.add('woodLight', Box(4.2, 1.0, 0.9), { p: [1, 0.5, 20.8] });
    P.add('pink', Box(4.3, 0.08, 1.0), { p: [1, 1.04, 20.8] });
    obsBox(1, 20.8, 4.4, 1.0);
    P.add('wood', Box(8, 2.2, 0.4), { p: [1, 1.1, 23.6] });
    obsBox(1, 23.6, 8, 0.5);
    const cols = ['red', 'blue', 'green', 'yellow', 'pink', 'purple', 'orange'];
    for (let r = 0; r < 3; r++) for (let i = 0; i < 7; i++) P.add(cols[(i + r) % 7], Box(0.7, 0.4, 0.3), { p: [-2.2 + i * 0.75, 0.4 + r * 0.7, 23.35] });
    // grocery: crates and shelves
    P.add('woodLight', Box(5, 1.0, 0.9), { p: [-12, 0.5, 21.3] });
    obsBox(-12, 21.3, 5.2, 1.0);
    for (const x of [-15, -9]) { P.add('wood', Box(1.6, 1.8, 0.5), { p: [x, 0.9, 23.5] }); obsBox(x, 23.5, 1.6, 0.6); }
    for (const [x, z] of [[-14.5, 17], [-9.5, 17]]) { P.add('wood', Box(1.1, 0.7, 0.8), { p: [x, 0.35, z] }); P.add('orange', Sph(0.3, 8, 6), { p: [x, 0.85, z] }); obsBox(x, z, 1.2, 0.9); }
    root.add(P.build({ castShadow: true, receiveShadow: true }));
    // striped awnings over the shop doors (always visible)
    const A = new Parts({ ...MAT, a1: std(0xd9453a), a2: std(0xf4f4f0) });
    for (const [x, c] of [[14, 'a1'], [1, 'a1'], [-12, 'a1']]) for (let i = 0; i < 6; i++) A.add(i % 2 ? 'a2' : 'a1', Box(1.0, 0.08, 1.8), { p: [x - 2.5 + i, 3.3, 13.9], r: [-0.3, 0, 0] });
    root.add(A.build({ castShadow: true }));
  }

  // ---- food, water and rest spots (world coordinates) ----
  const itemMesh = (kind) => {
    const g = new THREE.Group();
    const add = (geo, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
    if (kind === 'bowl') { add(Cyl(0.3, 0.22, 0.16, 14), MAT.red, 0, 0.08); add(Sph(0.24, 10, 6), std(0xb07a3a), 0, 0.17).scale.y = 0.5; }
    else if (kind === 'water') { add(Cyl(0.3, 0.22, 0.16, 14), MAT.blue, 0, 0.08); add(Cyl(0.25, 0.25, 0.02, 14), std(0x7ec8f0), 0, 0.15); }
    else if (kind === 'meat') for (const [x, z] of [[-0.18, 0], [0.12, 0.1], [0.05, -0.15]]) add(Cyl(0.07, 0.07, 0.45, 8), MAT.sausage, x, 0.06, z).rotation.z = Math.PI / 2;
    else if (kind === 'sandwich') { add(Box(0.45, 0.07, 0.35), std(0xe3c88a), 0, 0.04); add(Box(0.43, 0.05, 0.33), std(0x6fb04a), 0, 0.09); add(Box(0.45, 0.07, 0.35), std(0xe3c88a), 0, 0.14); }
    else if (kind === 'scrap') for (let i = 0; i < 5; i++) add(Sph(0.1, 6, 5), std([0xc4524a, 0xe3c88a, 0x8a6a45, 0x6fb04a, 0xf0d24a][i]), rand(-0.25, 0.25), 0.1, rand(-0.25, 0.25));
    else if (kind === 'bone') { add(Cyl(0.05, 0.05, 0.4, 6), MAT.cream, 0, 0.1).rotation.z = Math.PI / 2; for (const x of [-0.2, 0.2]) for (const z of [-0.05, 0.05]) add(Sph(0.07, 6, 5), MAT.cream, x, 0.1, z); }
    return g;
  };
  /** kind: bowl | water | meat | sandwich | scrap | bone. Food/water values are what one use restores. */
  function addItem({ id, kind, x, z, y = 0, food = 0, water = 0, respawn = 90, guard = null, risk = 0, label, indoor = false, ttl = 0, local = true }) {
    const wx = local ? DOG.cx + x : x, wz = local ? DOG.cz + z : z;
    const mesh = itemMesh(kind);
    mesh.position.set(wx, y, wz);
    scene.add(mesh);
    const it = { id, kind, x: wx, z: wz, y, food, water, respawn, guard, risk, label, indoor, ttl, mesh, ready: true, cd: 0 };
    world.items.push(it);
    return it;
  }
  addItem({ id: 'homeBowl', kind: 'bowl', x: 3.0, z: -12.3, food: 45, respawn: 150, label: 'Ăn cơm của chủ' });
  addItem({ id: 'homeWater', kind: 'water', x: 4.3, z: -12.3, water: 60, respawn: 5, label: 'Uống nước' });
  addItem({ id: 'neighborBowl', kind: 'bowl', x: 15.2, z: -12.2, food: 30, respawn: 120, label: 'Ăn bát của hàng xóm', guard: 'neighbor', risk: 0.15 });
  addItem({ id: 'meat1', kind: 'meat', x: 10.4, z: 16.9, y: 0.95, food: 38, respawn: 100, label: 'Trộm xúc xích', guard: 'butcher', risk: 0.6 });
  addItem({ id: 'meat2', kind: 'meat', x: 11.8, z: 16.9, y: 0.95, food: 38, respawn: 100, label: 'Trộm xúc xích', guard: 'butcher', risk: 0.6 });
  addItem({ id: 'sandwich', kind: 'sandwich', x: -6, z: -8, y: 0.88, food: 22, respawn: 80, label: 'Ăn bánh mì' });
  addItem({ id: 'bin1', kind: 'scrap', x: -19, z: 11.2, y: 0.95, food: 16, respawn: 70, risk: 0.25, label: 'Bới thùng rác' });
  addItem({ id: 'bin2', kind: 'scrap', x: 21, z: 0.8, y: 0.95, food: 16, respawn: 70, risk: 0.25, label: 'Bới thùng rác' });
  addItem({ id: 'dumpster', kind: 'scrap', x: -4, z: 26.5, y: 1.4, food: 22, respawn: 90, risk: 0.3, label: 'Lục thùng rác lớn' });
  addItem({ id: 'groceryBowl', kind: 'bowl', x: -9.5, z: 13.5, food: 20, respawn: 100, label: 'Ăn cơm thừa' });
  world.spawnFood = (kind, wx, wz, food) => addItem({ id: 'drop' + Math.random(), kind, x: wx, z: wz, food, respawn: 0, ttl: 120, label: 'Nhặt thức ăn', local: false });

  // ---- buried bones ----
  const groundType = (lx, lz) => {
    if (Math.hypot(lx - POND.x, lz - POND.z) < POND.r + 0.3) return 'water';
    if (Math.abs(lz - 6) < 3.1) return 'road';
    if ((lz >= 0 && lz < 3.1) || (lz > 8.9 && lz < 12.1)) return 'walk';
    for (const b of world.buildings) if (lx > b.rect.x0 - DOG.cx && lx < b.rect.x1 - DOG.cx && lz > b.rect.z0 - DOG.cz && lz < b.rect.z1 - DOG.cz) return 'floor';
    if (lx > 14.5 && lx < 23.5 && lz > -27.5 && lz < -16.5) return 'dirt';
    return 'grass';
  };
  world.groundAt = (x, z) => groundType(x - DOG.cx, z - DOG.cz);
  world.inWater = (x, z) => Math.hypot(x - world.pond.x, z - world.pond.z) < POND.r - 0.2;
  world.insideBuilding = (x, z) => world.buildings.find((b) => x > b.rect.x0 && x < b.rect.x1 && z > b.rect.z0 && z < b.rect.z1) || null;

  world.plantBone = () => {
    for (let i = 0; i < 30; i++) {
      const x = DOG.cx + rand(-22, 22), z = DOG.cz + rand(-26, 26);
      if (['grass', 'dirt'].includes(world.groundAt(x, z)) && isFree(x, z, 0.6)) { world.buried.push({ x, z }); return; }
    }
  };
  for (let i = 0; i < 12; i++) world.plantBone();
  world.digAt = (x, z, reach) => {
    let best = -1, bd = reach;
    world.buried.forEach((b, i) => { const d = Math.hypot(b.x - x, b.z - z); if (d < bd) { bd = d; best = i; } });
    if (best < 0) return false;
    world.buried.splice(best, 1);
    setTimeout(() => world.plantBone(), 40000);
    return true;
  };

  // ---- decals: holes and puddles ----
  const holeMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 1 });
  const moundMat = std(0x6e5232);
  const puddleMat = new THREE.MeshBasicMaterial({ color: 0xe8d44a, transparent: true, opacity: 0.55, depthWrite: false });
  world.addDecal = (type, x, z) => {
    const g = new THREE.Group();
    if (type === 'hole') {
      const h = new THREE.Mesh(new THREE.CircleGeometry(0.42, 14), holeMat); h.rotation.x = -Math.PI / 2; h.position.y = 0.09; g.add(h);
      const m = new THREE.Mesh(Sph(0.3, 8, 6), moundMat); m.position.set(0.1, 0.05, -0.55); m.scale.set(1.3, 0.5, 0.9); g.add(m);
    } else {
      const h = new THREE.Mesh(new THREE.CircleGeometry(0.4, 14), puddleMat); h.rotation.x = -Math.PI / 2; h.position.y = 0.1; g.add(h);
    }
    g.position.set(x, 0, z);
    scene.add(g);
    world.decals.push({ g, life: type === 'hole' ? 150 : 100 });
    if (world.decals.length > 40) { const o = world.decals.shift(); scene.remove(o.g); }
  };

  // ---- cars ----
  const carColors = [0xd9453a, 0x3f78c4, 0xf2c230, 0x3f9b55, 0xf4f4f0, 0x8a4fd8];
  function makeCar(color, len) {
    const P = new Parts({ ...MAT, body: std(color, { metalness: 0.3, roughness: 0.5 }), tire: std(0x1a1a1c), headl: new THREE.MeshBasicMaterial({ color: 0xfff6c8 }), tail: new THREE.MeshBasicMaterial({ color: 0xff3030 }) });
    P.add('body', Box(1.7, 0.6, len), { p: [0, 0.55, 0] });
    P.add('body', Box(1.5, 0.5, len * 0.5), { p: [0, 1.05, -len * 0.05] });
    P.add('glass', Box(1.52, 0.38, len * 0.48), { p: [0, 1.07, -len * 0.05] });
    for (const sx of [-0.8, 0.8]) for (const sz of [-len * 0.32, len * 0.32]) P.add('tire', Cyl(0.33, 0.33, 0.25, 12), { p: [sx, 0.33, sz], r: [0, 0, Math.PI / 2] });
    for (const sx of [-0.55, 0.55]) { P.add('headl', Box(0.3, 0.15, 0.05), { p: [sx, 0.62, len / 2] }); P.add('tail', Box(0.3, 0.15, 0.05), { p: [sx, 0.62, -len / 2] }); }
    return P.build({ castShadow: true });
  }
  [[1, 7.4, 6.5, 0, 0], [1, 7.4, 8.0, 38, 1], [1, 7.4, 5.8, 70, 4], [-1, 4.6, 7.2, 20, 2], [-1, 4.6, 6.2, 55, 3], [-1, 4.6, 8.4, 90, 5]].forEach(([dir, lz, speed, off, ci], i) => {
    const len = i === 2 ? 5.2 : 3.8, mesh = makeCar(carColors[ci], len);
    mesh.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    root.add(mesh);
    world.cars.push({ mesh, dir, lz, speed, off, len, x: 0, z: DOG.cz + lz, honk: 0 });
  });
  const CAR_SPAN = 76;
  const carX = (c, t) => { const u = (t * c.speed + c.off) % CAR_SPAN; return c.dir > 0 ? u - CAR_SPAN / 2 : CAR_SPAN / 2 - u; };
  /** The car overlapping a dog-sized body at (x, z), if any. */
  world.carHit = (x, z, y = 0) => {
    if (y > 1.3) return null;
    for (const c of world.cars) if (Math.abs(x - c.x) < c.len / 2 + 0.3 && Math.abs(z - c.z) < 1.15) return c;
    return null;
  };

  // ---- people ----
  const person = (name, hue, x, z, face, kind = 'laity', scale = 1) => {
    const a = new Avatar(hue, name, kind);
    if (scale !== 1) a.group.scale.multiplyScalar(scale);
    return new Walker(scene, a, DOG.cx + x, DOG.cz + z, face);
  };
  const reg = (role, name, walker, extra = {}) => { const p = { role, name, w: walker, get pos() { return walker.pos; }, ...extra }; world.people.push(p); return p; };
  world.owner = reg('owner', 'Chủ Minh', person('Chủ Minh', 0.3, 0, 0, 0));
  world.owner.w.avatar.group.visible = true;
  world.keeper = {
    butcher: reg('shop', 'Chú Tư bán thịt', person('Chú Tư bán thịt', 0.1, 14, 22.2, Math.PI), { shop: 'butcher' }),
    pet: reg('shop', 'Cô Hoa chủ tiệm', person('Cô Hoa chủ tiệm', 0.8, 1, 22.2, Math.PI), { shop: 'pet' }),
    grocery: reg('shop', 'Bác Ba tạp hóa', person('Bác Ba tạp hóa', 0.55, -12, 22.5, Math.PI), { shop: 'grocery' }),
    neighbor: reg('neighbor', 'Bà Sáu hàng xóm', person('Bà Sáu hàng xóm', 0.9, 18, -11.5, 0), {}),
  };
  world.kid = reg('kid', 'Bé Na', person('Bé Na', 0.7, -17, -22, 0.4, 'laity', 0.7));
  world.thief = reg('thief', 'Kẻ lạ mặt', person('Kẻ lạ mặt', 0.2, 60, 6, -Math.PI / 2, 'striped'));
  world.catcher = reg('catcher', 'Bắt chó', person('Người bắt chó', 0.4, 60, 6, -Math.PI / 2, 'guard'));
  for (const p of [world.thief, world.catcher]) p.w.avatar.group.visible = false;

  // pedestrians walk fixed loops on the pavements (wall clock, so every visitor sees the same people)
  const loops = [
    { a: new Avatar(0.15, 'Cô Lan', 'laity'), pts: [[-22, 1.5], [22, 1.5]], speed: 1.2 },
    { a: new Avatar(0.6, 'Anh Hải', 'laity'), pts: [[22, 10.5], [-22, 10.5]], speed: 1.0 },
    { a: new Avatar(0.85, 'Cụ Tám', 'laity'), pts: [[-6, -3], [-6, -16], [-21, -9], [-21, -3]], speed: 0.7 },
  ].map((n) => {
    scene.add(n.a.group);
    const legs = n.pts.map((a, i) => { const b = n.pts[(i + 1) % n.pts.length]; return { a, b, len: Math.hypot(b[0] - a[0], b[1] - a[1]) }; });
    return { ...n, legs, total: legs.reduce((s, l) => s + l.len, 0) };
  });
  loops.forEach((n) => world.people.push({ role: 'ped', name: 'Người đi đường', avatar: n.a, get pos() { return n.a.group.position; }, w: { avatar: n.a, pos: n.a.group.position } }));
  const loopPos = (n, t) => {
    let d = (t * n.speed) % n.total;
    for (const l of n.legs) {
      if (d <= l.len) { const k = d / l.len; return { x: l.a[0] + (l.b[0] - l.a[0]) * k, z: l.a[1] + (l.b[1] - l.a[1]) * k, ry: Math.atan2(l.b[0] - l.a[0], l.b[1] - l.a[1]) }; }
      d -= l.len;
    }
    return { x: n.pts[0][0], z: n.pts[0][1], ry: 0 };
  };

  // ---- stray dogs ----
  const mkDog = (o) => { const d = new StrayDog(scene, { ...o, home: [DOG.cx + o.home[0], DOG.cz + o.home[1]] }); world.dogs.push(d); return d; };
  mkDog({ name: 'Bin', breed: 'corgi', temper: 'friendly', home: [-13, -4], range: 8 });
  mkDog({ name: 'Cô Mực', breed: 'shiba', temper: 'female', home: [-9, -17], range: 6, acc: ['bow'] });
  mkDog({ name: 'Hổ Dữ', breed: 'gsd', temper: 'grumpy', home: [-4, 24], range: 2.5, acc: ['collar'] });
  mkDog({ name: 'Lu', breed: 'pug', temper: 'shy', home: [12, -3], range: 6 });
  mkDog({ name: 'Xù', breed: 'husky', temper: 'friendly', home: [-14, 10.5], range: 9, acc: ['bandana'] });

  // ---- lights, time and weather ----
  const hemi = scene.children.find((o) => o.isHemisphereLight), sun = scene.children.find((o) => o.isDirectionalLight);
  const base = {
    bg: scene.background.clone(), near: scene.fog.near, far: scene.fog.far,
    hemiI: hemi.intensity, hemiC: hemi.color.clone(), hemiG: hemi.groundColor.clone(),
    sunI: sun.intensity, sunC: sun.color.clone(), sunPos: sun.position.clone(), tgt: sun.target.position.clone(),
  };
  const off = base.sunPos.clone().sub(base.tgt);
  const NIGHT_SKY = new THREE.Color(0x0b1233), DUSK = new THREE.Color(0xf08a5a), GREY = new THREE.Color(0x7d8794), MOON = new THREE.Color(0x8fa4e0), tmp = new THREE.Color();

  const rain = (() => {
    const N = 900, pos = new Float32Array(N * 6);
    for (let i = 0; i < N; i++) { const x = rand(-18, 18), y = rand(0, 16), z = rand(-18, 18); pos.set([x, y, z, x - 0.15, y + 0.9, z - 0.05], i * 6); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xbcd4ee, transparent: true, opacity: 0.55 }));
    m.frustumCulled = false;
    m.visible = false;
    scene.add(m);
    return { m, pos, N };
  })();

  let flash = 0, nextBolt = 10, wasBlending = false;
  const weatherAt = (now) => {
    const r = rng(Math.floor(now / 200) * 7919 + 13)();
    return r < 0.45 ? 'clear' : r < 0.7 ? 'cloudy' : r < 0.93 ? 'rain' : 'storm';
  };

  world.contains = inDogZone;
  world.update = (dt, ctx) => {
    const now = Date.now() / 1000;
    const pp = ctx.pos; // the local player's position or null

    // time of day
    const hour = ((now % DAY_SEC) / DAY_SEC) * 24;
    const s = Math.sin(((hour - 6) / 12) * Math.PI); // sun height: >0 between 6:00 and 18:00
    const daylight = smoothstep(s, -0.12, 0.35);
    const dusk = Math.max(0, 1 - Math.abs(s) / 0.3) * (s > -0.3 ? 1 : 0);
    const cl = world.clock;
    cl.hour = hour; cl.daylight = daylight; cl.night = 1 - daylight;
    cl.weather = weatherAt(now);
    const tCloud = { clear: 0, cloudy: 0.55, rain: 0.8, storm: 1 }[cl.weather], tRain = { clear: 0, cloudy: 0, rain: 0.7, storm: 1 }[cl.weather];
    cl.cloud += (tCloud - cl.cloud) * (1 - Math.exp(-dt * 0.4));
    cl.rain += (tRain - cl.rain) * (1 - Math.exp(-dt * 0.5));

    // how strongly the district's lighting replaces the pagoda's
    let w = 0;
    if (pp) {
      const dist = Math.max(0, Math.abs(pp.x - DOG.cx) - DOG.hw, Math.abs(pp.z - DOG.cz) - DOG.hd);
      w = 1 - smoothstep(dist, 0, 26);
    }
    world.blend = w;
    if (w > 0.001 || wasBlending) {
      wasBlending = w > 0.001;
      const sky = tmp.copy(NIGHT_SKY).lerp(base.bg, daylight).lerp(DUSK, dusk * 0.45).lerp(GREY, cl.cloud * 0.55 * (0.4 + 0.6 * daylight));
      scene.background.copy(base.bg).lerp(sky, w);
      scene.fog.color.copy(scene.background);
      scene.fog.near = lerp(base.near, 25 * (1 - cl.rain * 0.4), w);
      scene.fog.far = lerp(base.far, 200 - cl.cloud * 90 - cl.night * 40, w);
      flash = Math.max(0, flash - dt * 2.5);
      hemi.intensity = lerp(base.hemiI, base.hemiI * (0.3 + 0.7 * daylight) * (1 - 0.3 * cl.cloud) + flash * 2.5, w);
      hemi.color.copy(base.hemiC).lerp(MOON, cl.night * 0.7 * w);
      hemi.groundColor.copy(base.hemiG).lerp(NIGHT_SKY, cl.night * 0.5 * w);
      sun.intensity = lerp(base.sunI, base.sunI * daylight * (1 - 0.65 * cl.cloud) + cl.night * 0.35, w);
      sun.color.copy(base.sunC).lerp(DUSK, dusk * 0.6 * w).lerp(MOON, cl.night * w);
      const here = pp && inDogZone(pp.x, pp.z);
      if (here) { // aim the shadow camera at the district, and swing the sun across the sky
        sun.target.position.set(DOG.cx, 0, DOG.cz);
        sun.position.set(DOG.cx + off.x + (hour - 12) * 3.5, off.y, DOG.cz + off.z);
      } else { sun.target.position.copy(base.tgt); sun.position.copy(base.sunPos); }
      const lamp = clamp(cl.night * 1.2 + cl.cloud * 0.3, 0, 1);
      lampLights.forEach((l) => { l.intensity = lamp * 16 * w; });
      LAMP.emissiveIntensity = 0.1 + lamp * 1.4;
      WINDOW.emissiveIntensity = cl.night * 1.1;
      if (cl.weather === 'storm' && w > 0.3) {
        nextBolt -= dt;
        if (nextBolt <= 0) { flash = 1; nextBolt = rand(6, 16); setTimeout(() => sfx('thunder', 0.7 * w), rand(300, 1500)); }
      }
    }
    world.portal.material.opacity = 0.35 + 0.25 * Math.sin(now * 3);

    // rain follows the camera
    rain.m.visible = cl.rain > 0.05 && w > 0.3;
    if (rain.m.visible) {
      rain.m.material.opacity = 0.55 * cl.rain * w;
      rain.m.position.set(camera.position.x, camera.position.y - 6, camera.position.z);
      const a = rain.pos;
      for (let i = 0; i < rain.N; i++) {
        const o = i * 6, drop = (22 + (i % 7)) * dt;
        a[o + 1] -= drop; a[o + 4] -= drop;
        if (a[o + 1] < -2) { const y = rand(14, 18); a[o + 1] = y; a[o + 4] = y + 0.9; }
      }
      rain.m.geometry.attributes.position.needsUpdate = true;
    }

    // traffic
    world.cars.forEach((c) => {
      c.x = DOG.cx + carX(c, now);
      c.mesh.position.set(carX(c, now), 0, c.lz);
      c.honk -= dt;
      if (pp && c.honk <= 0 && Math.abs(pp.z - c.z) < 1.8 && (pp.x - c.x) * c.dir > 0 && (pp.x - c.x) * c.dir < 9) { c.honk = 4; sfx('honk', clamp(1 - Math.abs(pp.x - c.x) / 20, 0.1, 1)); }
    });

    // people and dogs
    for (const p of world.people) if (p.role !== 'ped') p.w.update(dt);
    for (const n of loops) {
      const q = loopPos(n, now), g = n.a.group;
      g.position.set(DOG.cx + q.x, 0, DOG.cz + q.z);
      g.rotation.y = q.ry;
      n.a.update(dt, true);
    }
    const playerInfo = ctx.player ? { x: pp.x, z: pp.z, running: ctx.player.running, calm: ctx.player.calm, hit: ctx.player.hit } : null;
    for (const d of world.dogs) d.update(dt, playerInfo, cl.night > 0.6);

    // food respawn, decals
    for (let i = world.items.length - 1; i >= 0; i--) {
      const it = world.items[i];
      if (it.ttl) { it.ttl -= dt; if (it.ttl <= 0) { scene.remove(it.mesh); world.items.splice(i, 1); continue; } }
      if (!it.ready) { it.cd -= dt; if (it.cd <= 0) { it.ready = true; } }
      const target = it.ready ? 1 : 0.001;
      it.mesh.scale.setScalar(it.mesh.scale.x + (target - it.mesh.scale.x) * (1 - Math.exp(-dt * 8)));
    }
    for (let i = world.decals.length - 1; i >= 0; i--) {
      const d = world.decals[i];
      d.life -= dt;
      if (d.life < 5) d.g.scale.setScalar(Math.max(0.01, d.life / 5));
      if (d.life <= 0) { scene.remove(d.g); world.decals.splice(i, 1); }
    }

    // roofs open up when a dog walks in
    for (const b of world.buildings) b.roof.visible = !(pp && world.insideBuilding(pp.x, pp.z) === b);
    fx.update(dt);
  };

  /** Uses up an item; it comes back after its respawn time. */
  world.consume = (it) => { it.ready = false; it.cd = it.respawn || 1; if (!it.respawn) it.ttl = 0.01; };
  world.nearestDog = (x, z, r) => { let best = null, bd = r; for (const d of world.dogs) { const k = Math.hypot(d.pos.x - x, d.pos.z - z); if (k < bd) { bd = k; best = d; } } return best; };
  world.nearestPerson = (x, z, r, roles) => { let best = null, bd = r; for (const p of world.people) { if (roles && !roles.includes(p.role)) continue; if (!p.w.avatar.group.visible) continue; const k = Math.hypot(p.pos.x - x, p.pos.z - z); if (k < bd) { bd = k; best = p; } } return best; };
  world.sound = { bark, growl, yelp };
  return world;
}
