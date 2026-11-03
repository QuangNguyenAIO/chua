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

function schedule(date = new Date()) {
  const h = date.getHours() + date.getMinutes() / 60;
  const table = [[6, 'Giờ ngủ'], [7, 'Điểm danh'], [8, 'Giờ ăn'], [12, 'Lao động'], [13, 'Giờ ăn'], [17, 'Giờ tự do'], [18, 'Giờ ăn'], [22, 'Giờ tự do'], [24, 'Giờ ngủ']];
  return table.find(([end]) => h < end)[1];
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

  const npcs = RESIDENTS.map((r) => {
    const avatar = new Avatar(r.hue, r.name, r.kind);
    scene.add(avatar.group);
    const pts = r.loop.map(([x, z]) => [cx + x, cz + z]);
    const legs = pts.length > 1 ? pts.map((a, i) => { const b = pts[(i + 1) % pts.length]; return { a, b, len: Math.hypot(b[0] - a[0], b[1] - a[1]) }; }) : [];
    const total = legs.reduce((n, l) => n + l.len, 0);
    avatar.group.position.set(pts[0][0], r.y || 0, pts[0][1]);
    avatar.group.rotation.y = r.face || 0;
    return { avatar, legs, total, speed: r.speed || 1, y: r.y || 0 };
  });

  return {
    /** Same positions on every client: walkers are placed from the wall clock, so nothing needs to be networked. */
    update(dt) {
      const now = Date.now() / 1000;
      for (const n of npcs) {
        let moving = false;
        if (n.total > 0) {
          moving = true;
          let d = (now * n.speed) % n.total;
          for (const l of n.legs) {
            if (d <= l.len) {
              const k = d / l.len, p = n.avatar.group.position;
              p.set(l.a[0] + (l.b[0] - l.a[0]) * k, n.y, l.a[1] + (l.b[1] - l.a[1]) * k);
              n.avatar.group.rotation.y = Math.atan2(l.b[0] - l.a[0], l.b[1] - l.a[1]);
              break;
            }
            d -= l.len;
          }
        }
        n.avatar.update(dt, moving);
      }
    },
    contains: (x, z) => Math.abs(x - cx) < hw && Math.abs(z - cz) < hd,
    status: () => ({ time: new Date(), label: schedule(), residents: npcs.length }),
  };
}
