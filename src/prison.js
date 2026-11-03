import * as THREE from 'three';
import { Parts } from './parts.js';
import { Avatar } from './avatar.js';
import { OBSTACLES } from './world.js';

// Prison hall ("Nhà tù") east of the pagoda: a roofed block with a two-storey cell wing, a cafeteria of metal tables,
// a basketball hoop and cartoon-proportioned prisoners and guards. The ceiling is a one-sided plane that faces down,
// so it shows from inside but vanishes when the camera rises above it, like a cutaway model.

export const PRISON = { cx: 72, cz: -14, hw: 22, hd: 19, H: 10 };
const { cx, cz, hw, hd, H } = PRISON;

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra });
const MAT = {
  concrete: std(0xb4b8c0),
  wallUp: std(0xdfe3e9),
  blue: std(0x1f4e79),
  beige: std(0xd8c8a8),
  edge: std(0x8a8f98),
  bars: std(0x2b2e33, { metalness: 0.5, roughness: 0.4 }),
  yellow: std(0xf2b616),
  steel: std(0x6b7078, { metalness: 0.4 }),
  bedFrame: std(0xc9ccd2),
  mattress: std(0x5aa0d8),
  pillow: std(0xffffff),
  toilet: std(0xf4f4f4),
  table: std(0xc7ccd4, { metalness: 0.3, roughness: 0.5 }),
  bench: std(0xaeb4bd, { metalness: 0.3, roughness: 0.5 }),
  tray: std(0xffffff),
  orange: std(0xf26b21),
  white: std(0xffffff),
  lamp: new THREE.MeshBasicMaterial({ color: 0xfffbe8 }),
  roofDark: std(0x5a6270),
  glass: std(0x9fd0f0, { emissive: 0x244a66 }),
};

const Box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const Cyl = (rt, rb, h, seg = 12) => new THREE.CylinderGeometry(rt, rb, h, seg);
const Cone = (r, h, seg = 12) => new THREE.ConeGeometry(r, h, seg);
const Sph = (r, w = 12, h = 8) => new THREE.SphereGeometry(r, w, h);
const Tor = (r, t, seg = 24) => new THREE.TorusGeometry(r, t, 8, seg);

// Hall-local coordinates (origin = hall centre) -> world obstacles
const obsBox = (lx, lz, w, d) => OBSTACLES.push({ x0: cx + lx - w / 2, x1: cx + lx + w / 2, z0: cz + lz - d / 2, z1: cz + lz + d / 2 });
const obsCircle = (lx, lz, r) => OBSTACLES.push({ x: cx + lx, z: cz + lz, r });

function checkerTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#eef0f4'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#b5bac4'; g.fillRect(0, 0, 64, 64); g.fillRect(64, 64, 64, 64);
  g.strokeStyle = 'rgba(0,0,0,.08)'; g.lineWidth = 2; g.strokeRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set((2 * hw) / 4.4, (2 * hd) / 4.4);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function signBoard(text, w, h) {
  const c = document.createElement('canvas');
  c.width = 640; c.height = Math.round(640 * (h / w));
  const g = c.getContext('2d');
  g.fillStyle = '#1f4e79'; g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = '#f2b616'; g.lineWidth = 10; g.strokeRect(10, 10, c.width - 20, c.height - 20);
  g.fillStyle = '#ffffff'; g.font = `bold ${c.height * 0.55}px system-ui, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, c.width / 2, c.height / 2 + 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const face = new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 });
  const m = new THREE.Mesh(Box(w, h, 0.25), [MAT.edge, MAT.edge, MAT.edge, MAT.edge, face, MAT.edge]);
  m.castShadow = true;
  return m;
}

/** A wall slab whose inward face uses the interior colour and every other face the exterior beige. */
function wallBox(parent, w, h, d, x, y, z, inward, inner = MAT.wallUp) {
  const face = { '+x': 0, '-x': 1, '+z': 4, '-z': 5 }[inward];
  const mats = [MAT.beige, MAT.beige, MAT.edge, MAT.edge, MAT.beige, MAT.beige];
  mats[face] = inner;
  const m = new THREE.Mesh(Box(w, h, d), mats);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  parent.add(m);
  return m;
}

// ---------- building the hall ----------

function shell(g) {
  const T = 0.6;
  // north wall (behind the cells) and south wall
  wallBox(g, 2 * hw + 2 * T, H, T, 0, H / 2, -hd - T / 2, '+z', MAT.concrete);
  wallBox(g, 2 * hw + 2 * T, H, T, 0, H / 2, hd + T / 2, '-z');
  // east wall
  wallBox(g, T, H, 2 * hd, hw + T / 2, H / 2, 0, '-x');
  // west wall with a doorway 5.2 wide and 5.6 tall
  const seg = (hd - 2.6);
  for (const s of [-1, 1]) wallBox(g, T, H, seg, -hw - T / 2, H / 2, s * (2.6 + seg / 2), '+x');
  wallBox(g, T, H - 5.6, 5.2, -hw - T / 2, 5.6 + (H - 5.6) / 2, 0, '+x');
  obsBox(0, -hd - T / 2, 2 * hw + 2 * T, T); obsBox(0, hd + T / 2, 2 * hw + 2 * T, T); obsBox(hw + T / 2, 0, T, 2 * hd);
  for (const s of [-1, 1]) obsBox(-hw - T / 2, s * (2.6 + seg / 2), T, seg);

  // ceiling: faces down, so it only renders when seen from below
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(2 * hw + 2 * T, 2 * hd + 2 * T), new THREE.MeshBasicMaterial({ color: 0xdfe3ea }));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = H;
  g.add(ceil);

  const P = new Parts(MAT);
  // roof rim, blue interior skirting with a white rail, ceiling lamps
  P.add('edge', Box(2 * hw + 2 * T + 0.6, 0.5, 0.9), { p: [0, H + 0.25, -hd - T / 2] });
  P.add('edge', Box(2 * hw + 2 * T + 0.6, 0.5, 0.9), { p: [0, H + 0.25, hd + T / 2] });
  P.add('edge', Box(0.9, 0.5, 2 * hd), { p: [hw + T / 2, H + 0.25, 0] });
  P.add('edge', Box(0.9, 0.5, 2 * hd), { p: [-hw - T / 2, H + 0.25, 0] });
  P.add('blue', Box(0.06, 4, 2 * hd), { p: [hw - 0.03, 2, 0] });
  P.add('white', Box(0.08, 0.12, 2 * hd), { p: [hw - 0.04, 4.05, 0] });
  P.add('blue', Box(2 * hw, 4, 0.06), { p: [0, 2, hd - 0.03] });
  P.add('white', Box(2 * hw, 0.12, 0.08), { p: [0, 4.05, hd - 0.04] });
  for (const s of [-1, 1]) {
    P.add('blue', Box(0.06, 4, seg), { p: [-hw + 0.03, 2, s * (2.6 + seg / 2)] });
    P.add('white', Box(0.08, 0.12, seg), { p: [-hw + 0.04, 4.05, s * (2.6 + seg / 2)] });
  }
  for (const x of [-14, 0, 14]) for (const z of [-5, 5, 14]) {
    P.add('lamp', Box(4, 0.14, 0.6), { p: [x, H - 0.45, z] });
    P.add('steel', Box(0.05, 0.4, 0.05), { p: [x - 1.6, H - 0.25, z] });
    P.add('steel', Box(0.05, 0.4, 0.05), { p: [x + 1.6, H - 0.25, z] });
  }
  g.add(P.build({ castShadow: false }));
}

const CELL_W = 5.5, CELL_D = 6.5, LEVEL = 4.6;

function cellWing(g) {
  const P = new Parts(MAT);
  const zBar = -hd + CELL_D;
  for (let L = 0; L < 2; L++) {
    const y0 = L * LEVEL;
    for (let i = 0; i <= 8; i++) { // partition walls
      const x = -hw + i * CELL_W;
      P.add('concrete', Box(0.25, 4.2, CELL_D), { p: [x, y0 + 2.1, -hd + CELL_D / 2] });
      if (L === 0) obsBox(x, -hd + CELL_D / 2, 0.3, CELL_D);
    }
    for (let i = 0; i < 8; i++) {
      const x0 = -hw + i * CELL_W, mid = x0 + CELL_W / 2;
      // barred front with an open doorway in the middle
      for (const [a, b] of [[x0 + 0.12, mid - 0.8], [mid + 0.8, x0 + CELL_W - 0.12]]) {
        const n = Math.max(2, Math.round((b - a) / 0.3));
        for (let j = 0; j <= n; j++) P.add('bars', Cyl(0.025, 0.025, 4.0, 6), { p: [a + ((b - a) * j) / n, y0 + 2.1, zBar] });
        for (const y of [0.3, 2.1, 3.95]) P.add('bars', Box(b - a, 0.07, 0.07), { p: [(a + b) / 2, y0 + y, zBar] });
        if (L === 0) obsBox((a + b) / 2, zBar, b - a, 0.3);
      }
      P.add('bars', Box(1.7, 0.07, 0.07), { p: [mid, y0 + 3.95, zBar] }); // lintel over the doorway
      // bunk bed against the back wall
      const bx = x0 + 0.95, bz = -hd + 1.2;
      for (const sx of [-0.5, 0.5]) for (const sz of [-1, 1]) P.add('bedFrame', Box(0.08, 2.1, 0.08), { p: [bx + sx, y0 + 1.05, bz + sz * 1.0] });
      for (const [y, py] of [[0.5, 0.62], [1.4, 1.52]]) {
        P.add('bedFrame', Box(1.04, 0.08, 2.04), { p: [bx, y0 + y, bz] });
        P.add('mattress', Box(0.96, 0.14, 1.95), { p: [bx, y0 + py, bz] });
        P.add('pillow', Box(0.5, 0.1, 0.35), { p: [bx, y0 + py + 0.12, bz - 0.7] });
      }
      P.add('bedFrame', Box(0.05, 0.9, 0.05), { p: [bx + 0.55, y0 + 0.95, bz + 0.4] }); // ladder
      if (L === 0) obsBox(bx, bz, 1.2, 2.2);
      // toilet in the back corner
      const tx = x0 + CELL_W - 0.7;
      P.add('toilet', Box(0.5, 0.45, 0.55), { p: [tx, y0 + 0.22, -hd + 0.55] });
      P.add('toilet', Box(0.5, 0.4, 0.2), { p: [tx, y0 + 0.65, -hd + 0.25] });
      if (L === 0) obsBox(tx, -hd + 0.5, 0.7, 0.8);
    }
  }
  // upper floor with a balcony in front, cell-block roof slab, yellow safety rail, steel columns
  const balconyFront = zBar + 1.6;
  P.add('concrete', Box(2 * hw, 0.4, CELL_D + 1.6), { p: [0, LEVEL - 0.2, -hd + (CELL_D + 1.6) / 2] });
  P.add('concrete', Box(2 * hw, 0.4, CELL_D), { p: [0, 2 * LEVEL - 0.4, -hd + CELL_D / 2] });
  for (let x = -hw; x <= hw + 0.01; x += 1.1) P.add('yellow', Box(0.06, 1.1, 0.06), { p: [x, LEVEL + 0.55, balconyFront] });
  for (const y of [0.6, 1.1]) P.add('yellow', Box(2 * hw, 0.07, 0.07), { p: [0, LEVEL + y, balconyFront] });
  for (let i = 0; i < 5; i++) {
    const x = -hw + 0.4 + i * 10.8;
    P.add('steel', Box(0.35, LEVEL - 0.4, 0.35), { p: [x, (LEVEL - 0.4) / 2, balconyFront - 0.1] });
    obsCircle(x, balconyFront - 0.1, 0.45);
  }
  P.add('yellow', Box(2 * hw, 0.012, 0.25), { p: [0, 0.07, balconyFront + 1.0] }); // yellow floor line
  g.add(P.build({ castShadow: true, receiveShadow: true }));
}

function cafeteria(g) {
  const P = new Parts(MAT);
  for (const x of [-12, 0, 12]) for (const z of [-2, 6, 14]) {
    P.add('table', Box(5, 0.14, 1.6), { p: [x, 0.95, z] });
    for (const s of [-1, 1]) {
      P.add('table', Box(0.2, 0.9, 1.4), { p: [x + s * 1.8, 0.47, z] });
      P.add('bench', Box(5, 0.12, 0.55), { p: [x, 0.52, z + s * 1.25] });
      for (const e of [-1, 1]) P.add('bench', Box(0.1, 0.5, 0.4), { p: [x + e * 2.1, 0.27, z + s * 1.25] });
    }
    for (const t of [-1.5, 0, 1.5]) for (const s of [-1, 1]) P.add('tray', Box(0.5, 0.03, 0.35), { p: [x + t, 1.04, z + s * 0.45] });
    obsBox(x, z, 5.6, 3.8);
  }
  g.add(P.build({ castShadow: true, receiveShadow: true }));
}

function hoop(g) {
  const P = new Parts(MAT);
  const x = hw - 0.12;
  P.add('white', Box(0.1, 1.4, 2.2), { p: [x, 6.6, -2] });
  P.add('orange', Box(0.04, 0.55, 0.8), { p: [x - 0.07, 6.35, -2] });
  P.add('steel', Box(0.5, 0.1, 0.1), { p: [x - 0.2, 5.95, -2] });
  P.add('orange', Tor(0.36, 0.035), { p: [x - 0.6, 5.9, -2], r: [Math.PI / 2, 0, 0] });
  for (const [r, y] of [[0.3, 5.78], [0.26, 5.64], [0.21, 5.5]]) P.add('white', Tor(r, 0.012), { p: [x - 0.6, y, -2], r: [Math.PI / 2, 0, 0] });
  P.add('orange', Sph(0.25), { p: [hw - 5, 0.3, -6] }); // a ball left on the floor
  g.add(P.build({ castShadow: true }));
}

function exterior(scene) {
  // name plaque above the door, flanking watch towers
  const sign = signBoard('NHÀ TÙ', 9, 1.8);
  sign.position.set(cx - hw - 0.8, 7.7, cz);
  sign.rotation.y = -Math.PI / 2;
  scene.add(sign);

  const P = new Parts(MAT);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = cx + sx * (hw + 1.8), z = cz + sz * (hd + 1.8);
    P.add('concrete', Cyl(1.5, 1.7, 10, 14), { p: [x, 5, z] });
    P.add('blue', Cyl(2.3, 2.3, 1.8, 14), { p: [x, 10.9, z] });
    P.add('glass', Cyl(2.33, 2.33, 0.7, 14), { p: [x, 11.1, z] });
    P.add('roofDark', Cone(2.8, 1.8, 14), { p: [x, 12.7, z] });
    P.add('lamp', Sph(0.3), { p: [x, 9.7, z] });
    obsCircle(x - cx, z - cz, 2.0);
  }
  scene.add(P.build({ castShadow: true }));
}

// ---------- residents ----------

// [x, z] hall-local; a loop of two or more points is walked back and forth / around; one point means standing still.
const RESIDENTS = [
  { kind: 'prisoner', name: 'Tèo Béo', hue: 0.05, loop: [[-6, 2], [6, 2], [6, 10], [-6, 10]], speed: 1.1 },
  { kind: 'striped', name: 'Na Mập', hue: 0.3, loop: [[18, -8], [18, 16]], speed: 1.0 },
  { kind: 'prisoner', name: 'Bin Gầy', hue: 0.55, loop: [[-18, -8], [-18, 16]], speed: 0.9 },
  { kind: 'guard', name: 'Cán bộ Minh', hue: 0.1, loop: [[-19, -10], [19, -10]], speed: 1.3 },
  { kind: 'prisoner', name: 'Hổ Con', hue: 0.8, loop: [[-9, -7.5]], face: 0.4 },
  { kind: 'striped', name: 'Cún Khờ', hue: 0.2, loop: [[4, -8.5]], face: -0.6 },
  { kind: 'prisoner', name: 'Sóc Nâu', hue: 0.95, loop: [[15, -6]], face: 1.9 },
  { kind: 'guard', name: 'Cán bộ Lan', hue: 0.4, loop: [[-2, 17]], face: Math.PI },
  { kind: 'prisoner', name: 'Gấu Xám', hue: 0.12, loop: [[-14, -11.9]], face: 0.1, y: LEVEL },
  { kind: 'striped', name: 'Mít Tơ', hue: 0.7, loop: [[-3, -11.9]], face: -0.2, y: LEVEL },
  { kind: 'prisoner', name: 'Chim Sẻ', hue: 0.6, loop: [[8, -11.9], [19, -11.9]], speed: 0.6, y: LEVEL },
];

// Normal routine of each resident: a closed loop of world-space points, or a single spot to stand on.
const LOOPS = RESIDENTS.map((r) => {
  const pts = r.loop.map(([x, z]) => [cx + x, cz + z]);
  const legs = pts.length > 1 ? pts.map((a, i) => { const b = pts[(i + 1) % pts.length]; return { a, b, len: Math.hypot(b[0] - a[0], b[1] - a[1]) }; }) : [];
  return { legs, total: legs.reduce((n, l) => n + l.len, 0), speed: r.speed || 1, home: pts[0], face: r.face || 0 };
});

function schedule(date = new Date()) {
  const h = date.getHours() + date.getMinutes() / 60;
  const table = [[6, 'Giờ ngủ'], [7, 'Điểm danh'], [8, 'Giờ ăn'], [12, 'Lao động'], [13, 'Giờ ăn'], [17, 'Giờ tự do'], [18, 'Giờ ăn'], [22, 'Giờ tự do'], [24, 'Giờ ngủ']];
  return table.find(([end]) => h < end)[1];
}

// ---------- autonomous activities ----------
// A "director" cuts the timeline into 40 s slots. For each slot a seeded random pick (identical on every client, because
// it depends only on the slot number) gives a few residents a short script: fighting, swearing at each other, using the
// toilet, sleeping, eating, exercising or shooting hoops. Scripts are lists of keyframes {t, p, pose, face, say}; between
// two keyframes the resident walks in a straight line, and a null position means "wherever your normal loop has you",
// so everyone slips out of their routine and back into it without a jump. Nothing is networked.

const SLOT = 40;
// Indices into RESIDENTS. Ground residents are split into two groups used on alternate slots, so a long script can run
// into the next slot without ever meeting another script for the same person.
const GROUPS = [{ prisoners: [0, 1, 2], guards: [3] }, { prisoners: [4, 5, 6], guards: [7] }];
const UPPER = [8, 9, 10]; // balcony residents only ever cheer, and a cheer ends well inside its slot
const W = (x, z) => [cx + x, cz + z];
const lerp = THREE.MathUtils.lerp;
const LIE_Y = 0.95; // body height when lying on a lower bunk
const ARENAS = [[0, 2], [0, 10], [-6, 6], [6, 6]]; // open aisles between the tables
const INSULTS = [
  'Mẹ kiếp, tránh ra!', 'Mày muốn ăn đòn hả?!', 'Đồ khốn!', 'Thằng ôn con!', 'Cút đi cho khuất mắt!', 'Câm cái miệng lại!',
  '@#$%&! Đồ ăn hôi!', 'Chết tiệt!', 'Mày thì biết cái gì!', 'Đồ tham ăn!', 'Mặt mày nhìn phát ghét!', 'Cái đồ lười biếng!',
];

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

/** Builds one resident's keyframes. A key's pose/face/lie apply from that key until the next. */
class Track {
  constructor(c, idx) { this.c = c; this.idx = idx; this.keys = [{ t: 0, p: null }]; this.t = 0; this.last = null; }
  go(p, o = {}, speed = 2.4) { // walk to p; from a loop position, the distance is looked up at that moment of the timeline
    const from = this.last || this.c.liveAt(this.idx, this.c.start + this.t);
    const dist = Math.hypot(p[0] - from[0], p[1] - from[1]);
    const dur = this.last ? dist / speed : Math.min(9, Math.max(2, dist / 2.6)); // up to a jog when the walk is long
    this.t += Math.max(dur, 0.3);
    this.keys.push({ t: this.t, p, ...o });
    this.last = p;
    return this;
  }
  wait(sec, o = {}) { this.t += sec; this.keys.push({ t: this.t, p: this.last, ...o }); return this; }
  until(t, o = {}) { return this.wait(Math.max(0, t - this.t), o); }
  live(sec, o = {}) { this.t += sec; this.keys.push({ t: this.t, p: null, ...o }); this.last = null; return this; }
  end() { // stand up, then walk back to the normal loop at a pace that suits the distance
    this.keys.push({ t: this.t, p: this.last, pose: 'none', lie: false });
    const home = this.last && this.c.liveAt(this.idx, this.c.start + this.t + 3);
    this.t += home ? Math.min(9, Math.max(2, Math.hypot(home[0] - this.last[0], home[1] - this.last[1]) / 2.6)) : 4;
    this.keys.push({ t: this.t, p: null });
    return this;
  }
}

/** Resolves pose/lie/face so every key carries the state that holds from it onward. */
function compile(keys) {
  let pose = null, lie = false, face;
  return keys.map((k) => {
    if ('pose' in k) pose = k.pose === 'none' ? null : k.pose;
    if ('lie' in k) lie = !!k.lie;
    if ('face' in k) face = k.face;
    return { ...k, pose, lie, face };
  });
}

function finish(c, tracks, extra = {}) {
  let dur = 0;
  for (const t of tracks.values()) dur = Math.max(dur, t.t);
  const compiled = new Map([...tracks].map(([k, v]) => [k, compile(v.keys)]));
  return { start: c.start, dur, tracks: compiled, last: new Map(), ...extra };
}

const cellOf = (c) => {
  const cell = Math.floor(c.r() * 8), x0 = -hw + cell * CELL_W;
  return { mid: x0 + CELL_W / 2, bx: x0 + 0.95, tx: x0 + CELL_W - 0.7 };
};

const SCENES = {
  fight(c) { // two prisoners brawl, a guard runs in, the balcony cheers
    if (c.pr.length < 2 || !c.gd.length) return null;
    const [A, B, G] = [c.take(c.pr), c.take(c.pr), c.take(c.gd)];
    const [lx, lz] = ARENAS[Math.floor(c.r() * ARENAS.length)];
    const tracks = new Map();
    tracks.set(A, new Track(c, A).go(W(lx - 0.7, lz), { pose: 'punch', face: Math.PI / 2 }).until(10, { say: 'Mày nhìn cái gì hả?!' }).until(13, { say: 'Ăn đòn này!' }).until(19, { pose: 'sulk' }).wait(1, { say: 'Hừ...' }).end());
    tracks.set(B, new Track(c, B).go(W(lx + 0.7, lz), { pose: 'punch', face: -Math.PI / 2 }).until(11.5, { say: 'Lại đây tao xử!' }).until(15, { say: 'Úi da! Đau!' }).until(19, { pose: 'sulk' }).wait(1).end());
    tracks.set(G, new Track(c, G).live(8).go(W(lx, lz + 2.2), { pose: 'stop', face: Math.PI, say: 'Dừng lại! Cả hai về phòng!' }).until(19.5, { pose: 'none' }).end());
    const cheers = ['Đánh đi!', 'Choảng nó!', 'Quánh nhau kìa!', 'Hay quá!'];
    for (const u of c.up.splice(0, 2)) tracks.set(u, new Track(c, u).live(8, { pose: 'cheer', say: cheers[Math.floor(c.r() * 4)] }).live(4, { say: cheers[Math.floor(c.r() * 4)] }).live(4, { pose: 'none' }).end());
    return finish(c, tracks);
  },
  curse(c) { // a shouting match
    if (c.pr.length < 2) return null;
    const [A, B] = [c.take(c.pr), c.take(c.pr)];
    const [lx, lz] = ARENAS[Math.floor(c.r() * ARENAS.length)];
    const ta = new Track(c, A).go(W(lx - 0.8, lz), { pose: 'argue', face: Math.PI / 2 });
    const tb = new Track(c, B).go(W(lx + 0.8, lz), { pose: 'argue', face: -Math.PI / 2 });
    const pool = [...INSULTS];
    for (let i = 0; i < 6; i++) (i % 2 ? tb : ta).until(10 + i * 2.6, { say: pool.splice(Math.floor(c.r() * pool.length), 1)[0] });
    ta.until(25.6, { pose: 'none' }).end();
    tb.until(25.6, { pose: 'none' }).end();
    return finish(c, new Map([[A, ta], [B, tb]]));
  },
  toilet(c) { // into a cell, onto the toilet, out again
    if (!c.pr.length) return null;
    const A = c.take(c.pr), { mid, tx } = cellOf(c);
    const t = new Track(c, A).go(W(mid, -11.2)).go(W(mid, -14.2)).go(W(tx, -16.4)).go(W(tx, -18.35), { pose: 'toilet', face: 0, say: '💨 Đang bận, đừng vào!' })
      .wait(8, { say: 'Phù... nhẹ cả người!' }).wait(4).wait(0.6, { pose: 'none' })
      .go(W(tx, -16.4)).go(W(mid, -14.2)).go(W(mid, -11.2)).end();
    return finish(c, new Map([[A, t]]));
  },
  sleep(c) { // a nap on a lower bunk
    if (!c.pr.length) return null;
    const A = c.take(c.pr), { mid, bx } = cellOf(c);
    const t = new Track(c, A).go(W(mid, -11.2)).go(W(mid, -14.2)).go(W(bx + 1.1, -16.6)).go(W(bx, -16.95), { pose: 'sleep', lie: true, say: 'Zzz...' })
      .wait(7, { say: 'Khò... khò...' }).wait(7, { say: 'Zzz...' }).wait(1, { pose: 'none', lie: false, say: 'Hự... mấy giờ rồi?' })
      .go(W(bx + 1.1, -16.6)).go(W(mid, -14.2)).go(W(mid, -11.2)).end();
    return finish(c, new Map([[A, t]]));
  },
  basketball(c) { // jump shots at the hoop
    if (!c.pr.length) return null;
    const A = c.take(c.pr);
    const t = new Track(c, A).go(W(hw - 5.5, -2), { pose: 'shoot', face: Math.PI / 2 }).wait(7, { say: 'Vào rổ nào!' }).wait(7, { say: 'Hụt rồi, haizz' }).wait(0.5, { pose: 'none' }).end();
    return finish(c, new Map([[A, t]]), { ball: A });
  },
  exercise(c) { // jumping jacks
    if (!c.pr.length) return null;
    const A = c.take(c.pr), spots = [[-17, 5], [-17, 12], [17, 5], [17, 12]];
    const [x, z] = spots[Math.floor(c.r() * spots.length)];
    const t = new Track(c, A).go(W(x, z), { pose: 'jack', face: 0 }).wait(3, { say: 'Một, hai, ba, bốn!' }).wait(4, { say: 'Hít vào... thở ra!' }).wait(4, { pose: 'none' }).end();
    return finish(c, new Map([[A, t]]));
  },
  eat(c) { // sit at a table and eat
    if (!c.pr.length) return null;
    const A = c.take(c.pr);
    const tx = [-12, 0, 12][Math.floor(c.r() * 3)] + [-1.5, 0, 1.5][Math.floor(c.r() * 3)], tz = [-2, 6, 14][Math.floor(c.r() * 3)];
    const s = c.r() < 0.5 ? -1 : 1;
    const aisle = W(tx, tz + s * 2.4), seat = W(tx, tz + s * 1.25);
    const t = new Track(c, A).go(aisle).go(seat, { pose: 'eat', face: s > 0 ? Math.PI : 0 })
      .wait(5, { say: 'Ngon quá!' }).wait(6, { say: 'Cơm tù mà ngon ghê!' }).wait(2).wait(0.6, { pose: 'none' }).go(aisle).end();
    return finish(c, new Map([[A, t]]));
  },
};

const plans = new Map();
function planFor(n) {
  if (!plans.has(n)) {
    const r = rng(n * 2654435761 + 97);
    const grp = GROUPS[n % 2];
    const c = { n, r, pr: [...grp.prisoners], gd: [...grp.guards], up: [...UPPER], take: (arr) => arr.splice(Math.floor(r() * arr.length), 1)[0] };
    const kinds = ['fight', 'curse', 'curse', 'toilet', 'toilet', 'basketball', 'exercise', 'sleep', 'eat', 'eat'];
    c.liveAt = (idx, tAbs) => { const l = loopState(LOOPS[idx], tAbs); return [l.x, l.z]; };
    const out = [];
    for (let i = 0; i < 3; i++) {
      c.start = n * SLOT + 1 + r() * 3;
      const kind = kinds.splice(Math.floor(r() * kinds.length), 1)[0];
      const sc = SCENES[kind](c);
      if (sc) out.push({ ...sc, kind });
    }
    plans.set(n, out);
    if (plans.size > 4) plans.delete(plans.keys().next().value);
  }
  return plans.get(n);
}

function loopState(n, now) {
  if (n.total > 0) {
    let d = (now * n.speed) % n.total;
    for (const l of n.legs) {
      if (d <= l.len) {
        const k = d / l.len;
        return { x: l.a[0] + (l.b[0] - l.a[0]) * k, z: l.a[1] + (l.b[1] - l.a[1]) * k, ry: Math.atan2(l.b[0] - l.a[0], l.b[1] - l.a[1]), moving: true };
      }
      d -= l.len;
    }
  }
  return { x: n.home[0], z: n.home[1], ry: n.face, moving: false };
}

/** Position along a script at time t; `live` stands in for null waypoints. */
function trackPos(keys, t, live) {
  let i = 0;
  while (i < keys.length - 2 && keys[i + 1].t <= t) i++;
  const a = keys[i], b = keys[i + 1];
  const k = b.t > a.t ? Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))) : 1;
  const pa = a.p || [live.x, live.z], pb = b.p || [live.x, live.z];
  return { x: lerp(pa[0], pb[0], k), z: lerp(pa[1], pb[1], k), key: a, onLoop: !a.p && !b.p };
}

/** Builds the prison and returns { update(dt), contains(x, z), status() }. */
export function buildPrison(scene) {
  const g = new THREE.Group();
  g.position.set(cx, 0, cz);
  scene.add(g);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(2 * hw, 2 * hd), (() => { const map = checkerTexture(); return new THREE.MeshStandardMaterial({ map, emissiveMap: map, emissive: 0x25282c, roughness: 0.6 }); })());
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.05;
  floor.receiveShadow = true;
  floor.userData.walk = true;
  g.add(floor);

  // cool fluorescent fill light, so the interior reads as neutral grey-white instead of the pagoda's warm sunset tint
  for (const [x, z] of [[-12, -4], [12, -4], [0, 12]]) {
    const l = new THREE.PointLight(0xe3eeff, 18, 46, 1.2);
    l.position.set(x, H - 1.5, z);
    g.add(l);
  }
  shell(g);
  cellWing(g);
  cafeteria(g);
  hoop(g);
  exterior(scene);

  // paved approach from the pagoda's side gate to the prison door
  const road = new THREE.Mesh(Box(20, 0.1, 6), std(0xa99f8c));
  road.position.set(40, 0.05, cz);
  road.receiveShadow = true;
  road.userData.walk = true;
  scene.add(road);
  const plaza = new THREE.Mesh(Box(8, 0.1, 12), std(0xc7bfae));
  plaza.position.set(cx - hw - 4, 0.06, cz);
  plaza.receiveShadow = true;
  plaza.userData.walk = true;
  scene.add(plaza);

  const npcs = RESIDENTS.map((r, i) => {
    const avatar = new Avatar(r.hue, r.name, r.kind);
    scene.add(avatar.group);
    avatar.group.position.set(LOOPS[i].home[0], r.y || 0, LOOPS[i].home[1]);
    avatar.group.rotation.y = r.face || 0;
    return { avatar, y: r.y || 0, lying: 0 };
  });

  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 12), MAT.orange); // the ball used in the basketball scene
  ball.castShadow = true;
  ball.visible = false;
  scene.add(ball);
  const hoopPos = new THREE.Vector3(cx + hw - 0.62, 5.95, cz - 2);
  const hand = new THREE.Vector3(), release = new THREE.Vector3();

  return {
    /** Same everywhere: walkers and activities come from the wall clock (see the director above), so nothing is networked. */
    update(dt) {
      const now = Date.now() / 1000;
      const slot = Math.floor(now / SLOT);
      const active = new Map(); // resident index -> running script
      for (const s of [slot - 1, slot]) {
        for (const sc of planFor(s)) {
          const t = now - sc.start;
          if (t >= 0 && t <= sc.dur) for (const [idx, keys] of sc.tracks) active.set(idx, { sc, keys, t });
        }
      }
      let shooter = -1;
      npcs.forEach((n, idx) => {
        const av = n.avatar, gr = av.group, live = loopState(LOOPS[idx], now), act = active.get(idx);
        let x = live.x, z = live.z, ry = live.ry, moving = live.moving, pose = null, lie = false;
        if (act) {
          const end = act.keys[act.keys.length - 1].t;
          const p0 = trackPos(act.keys, act.t, live), p1 = trackPos(act.keys, Math.min(end, act.t + 0.12), live);
          x = p0.x; z = p0.z; pose = p0.key.pose; lie = p0.key.lie;
          if (p0.onLoop) { moving = live.moving; ry = live.ry; }
          else {
            const dx = p1.x - p0.x, dz = p1.z - p0.z;
            moving = Math.hypot(dx, dz) / 0.12 > 0.3;
            ry = moving ? Math.atan2(dx, dz) : p0.key.face ?? gr.rotation.y;
          }
          // speech bubbles: fire each line once as the script passes it (a late joiner skips what already happened)
          const seen = act.sc.last.get(idx);
          const from = seen === undefined ? (act.t > 1.5 ? act.t : -1) : seen;
          for (const k of act.keys) if (k.say && k.t > from && k.t <= act.t) av.say(k.say, 3.5);
          act.sc.last.set(idx, act.t);
          if (act.sc.ball === idx) shooter = idx;
        }
        n.lying += ((lie ? 1 : 0) - n.lying) * (1 - Math.exp(-dt * 8)); // lie down and stand up smoothly
        gr.position.set(x, n.y + LIE_Y * n.lying, z);
        gr.rotation.set(-Math.PI / 2 * n.lying, n.lying > 0.5 ? 0 : ry, 0);
        av.setPose(pose);
        av.update(dt, moving && !lie);
      });

      ball.visible = shooter >= 0;
      if (shooter >= 0) { // chest -> overhead -> arc into the hoop -> falls back into the shooter's hands
        const av = npcs[shooter].avatar, g = av.group, ph = av.shotPhase();
        const fx = Math.sin(g.rotation.y), fz = Math.cos(g.rotation.y);
        hand.set(g.position.x + fx * 0.45, g.position.y + 1.25, g.position.z + fz * 0.45);
        release.set(g.position.x + fx * 0.5, g.position.y + 2.5, g.position.z + fz * 0.5);
        if (ph < 0.45) ball.position.lerpVectors(hand, release, ph < 0.35 ? 0 : (ph - 0.35) / 0.1);
        else if (ph < 0.86) {
          const u = (ph - 0.45) / 0.41;
          ball.position.lerpVectors(release, hoopPos, u);
          ball.position.y += 1.8 * Math.sin(Math.PI * u);
        } else {
          const v = (ph - 0.86) / 0.14;
          ball.position.lerpVectors(hoopPos, hand, v);
          ball.position.y = lerp(hoopPos.y, hand.y, v * v);
        }
      }
    },
    contains: (x, z) => Math.abs(x - cx) < hw && Math.abs(z - cz) < hd,
    status: () => ({ time: new Date(), label: schedule(), residents: npcs.length }),
  };
}
