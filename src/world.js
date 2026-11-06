import * as THREE from 'three';
import { inDogZone } from './dogzone.js';
import { TEN, inTennis } from './tennisrules.js';
import { buddhaStatue, arhatStatue, maitreyaStatue } from './statues.js';

// Vietnamese pagoda compound ("chùa"), laid out along a north-south axis:
// outside road -> tam quan gate -> courtyard (lotus ponds, bell & drum towers, incense burner)
// -> stepped platform -> chánh điện (main hall, double-tiered roof) with the Buddha altar at the back.
// Roofs are curved with upturned corners (đao). Style follows Bái Đính and Ba Vàng: golden-tiled multi-tier main hall,
// long Arhat galleries (hành lang La Hán) along both sides, a 13-storey stupa and giant statues at the rear of the compound.

export const BOUNDS = 100; // the pagoda compound sits at the origin; the prison lies to the east
export const CUSHIONS = [];
export const OBSTACLES = [];
export const BURNERS = []; // incense burners: { x, y, z, spread } where y is the ash surface sticks stand in

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 1, ...extra });
const M = {
  stone: mat(0xcfc7b5),
  stoneDark: mat(0x8d877a),
  brick: mat(0xc49a72),
  path: mat(0xa99f8c),
  wood: mat(0x8a2e1d),
  woodDark: mat(0x4e2518),
  door: mat(0x5a2e1a),
  roof: mat(0xa9472b),
  ridge: mat(0x7a2f1f),
  wall: mat(0xe0b050),
  cream: mat(0xf0e2b8),
  gold: mat(0xd9a73a, { emissive: 0x4a3200 }),
  bronze: mat(0x7a5a28),
  cushion: mat(0xe3a73b),
  grass: mat(0x6f9a58),
  leaf: mat(0x3f7a4a),
  leaf2: mat(0x58934a),
  banyan: mat(0x4f8a45),
  trunk: mat(0x5a4030),
  bamboo: mat(0x8fae4a),
  mount: mat(0x56736a),
  mount2: mat(0x6c8a80),
  water: mat(0x4f9ea0, { roughness: 0.4 }),
  pad: mat(0x3d8a4a),
  lotus: mat(0xf2a0b8),
  red: mat(0xc0281c, { emissive: 0x601008, emissiveIntensity: 0.8 }),
  lantern: mat(0xffd27a, { emissive: 0xffa640, emissiveIntensity: 1.2 }),
  white: mat(0xf4efe0),
  ash: mat(0x8d877a),
};
// Tile stripes (ngói âm dương): alternating ridges and gutters running down the slope.
function tileTexture(p = ['#b44e30', '#c9603c', '#7a2f1f', '#d4724a']) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = p[0]; g.fillRect(0, 0, 64, 64);
  g.fillStyle = p[1]; g.fillRect(0, 0, 24, 64);
  g.fillStyle = p[2]; g.fillRect(24, 0, 6, 64); g.fillRect(56, 0, 6, 64);
  g.fillStyle = p[3]; g.fillRect(6, 0, 8, 64);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const tileMat = (palette, fallback, extra = {}) => {
  const map = tileTexture(palette);
  return new THREE.MeshStandardMaterial({ map, color: map ? 0xffffff : fallback, flatShading: false, roughness: 1, side: THREE.DoubleSide, ...extra });
};
const roofMat = tileMat(undefined, 0xa9472b); // terracotta tiles
const goldRoofMat = tileMat(['#d9a53a', '#f0c456', '#9a6a14', '#f8dc78'], 0xd9a53a, { emissive: 0x3a2600, roughness: 0.7 }); // gilded tiles (Ba Vàng)

// Lacquered sign board with Chinese/Nôm characters, readable from +z. Vertical or horizontal.
function sign(parent, text, w, h, x, y, z, { vertical = false, bg = '#3a1810', fg = '#e8c050' } = {}) {
  const chars = [...text];
  let face;
  if (typeof document === 'undefined') face = mat(0x3a1810);
  else {
    const c = document.createElement('canvas');
    const cell = 160;
    c.width = vertical ? cell : cell * chars.length;
    c.height = vertical ? cell * chars.length : cell;
    const g = c.getContext('2d');
    g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(8, 8, c.width - 16, c.height - 16);
    g.fillStyle = fg;
    g.font = `bold ${cell * 0.7}px "Noto Serif CJK TC","Noto Serif TC","PMingLiU","MingLiU","SimSun","Songti TC",serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    chars.forEach((ch, i) => g.fillText(ch, vertical ? cell / 2 : cell * (i + 0.5), vertical ? cell * (i + 0.5) : cell / 2));
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    face = new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 });
  }
  const board = M.woodDark;
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.14), [board, board, board, board, face, board]);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

function add(parent, geo, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  parent.add(m);
  return m;
}
/** Pushes a point (avatar of the given radius) out of walls, ponds and buildings. */
export function collide(p, radius = 0.5) {
  for (const o of OBSTACLES) {
    if (o.r !== undefined) {
      const dx = p.x - o.x, dz = p.z - o.z, min = o.r + radius, d = Math.hypot(dx, dz);
      if (d < min) { const k = min / (d || 1); p.x = o.x + (d ? dx * k : min); p.z = o.z + (d ? dz * k : 0); }
    } else {
      const x0 = o.x0 - radius, x1 = o.x1 + radius, z0 = o.z0 - radius, z1 = o.z1 + radius;
      if (p.x <= x0 || p.x >= x1 || p.z <= z0 || p.z >= z1) continue;
      const push = [p.x - x0, x1 - p.x, p.z - z0, z1 - p.z];
      const m = Math.min(...push);
      if (m === push[0]) p.x = x0; else if (m === push[1]) p.x = x1; else if (m === push[2]) p.z = z0; else p.z = z1;
    }
  }
}

const walkable = (mesh) => { mesh.userData.walk = true; mesh.castShadow = false; return mesh; };
const obsBox = (cx, cz, w, d) => OBSTACLES.push({ x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2 });
const obsCircle = (x, z, r) => OBSTACLES.push({ x, z, r });

/** Walkable surface height at (x, z): courtyard 0, stairs ramp, platform, hall floor. */
export function floorY(x, z) {
  if (Math.abs(x) < 11 && z < -7 && z > -21) return 1.45;
  if (Math.abs(x) < 13 && z <= -5 && z > -23) return 1.0;
  if (Math.abs(x) < 3.3 && z < -2 && z > -5) return (-2 - z) / 3;
  return 0;
}

// ---------- roofs ----------

// Hip roof whose slope is concave (steep at the ridge, flat at the eaves) and whose four corners kick upward.
function roofGeometry(w, d, h) {
  const nx = 30, nz = 20;
  const pos = [], idx = [], uv = [];
  const m = Math.min(w, d) / 2;
  const kick = 0.06 * ((w + d) / 2);
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      const x = (i / nx - 0.5) * w, z = (j / nz - 0.5) * d;
      const s = Math.min(1, Math.max(0, Math.min(d / 2 - Math.abs(z), w / 2 - Math.abs(x)) / m));
      const u = (2 * Math.abs(x)) / w, v = (2 * Math.abs(z)) / d;
      pos.push(x, h * Math.pow(s, 1.45) + kick * Math.pow(u * v, 3), z);
      uv.push((w / 2 - Math.abs(x) < d / 2 - Math.abs(z) ? z : x) / 0.9, 0); // stripes follow the slope direction
    }
  }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, e = c + 1;
    idx.push(a, c, b, b, c, e);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function finial(parent, y, scale = 1) {
  add(parent, new THREE.CylinderGeometry(0.2 * scale, 0.28 * scale, 0.5 * scale, 24), M.ridge, 0, y + 0.25 * scale, 0);
  add(parent, new THREE.IcosahedronGeometry(0.3 * scale, 0), M.gold, 0, y + 0.7 * scale, 0);
  add(parent, new THREE.ConeGeometry(0.12 * scale, 0.5 * scale, 5), M.gold, 0, y + 1.1 * scale, 0);
}

/** Curved tiled roof centred on the parent origin, sitting at height y. */
function roof(parent, w, d, y, h, tiles = roofMat) {
  const g = new THREE.Group();
  g.position.y = y;
  const r = add(g, roofGeometry(w, d, h), tiles);
  r.castShadow = true;
  add(g, new THREE.BoxGeometry(w * 0.98, 0.22, d * 0.98), M.woodDark, 0, -0.05, 0);

  const kick = 0.06 * ((w + d) / 2);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { // đao: curled corner tips
    const c = add(g, new THREE.ConeGeometry(0.22, 0.9, 5), tiles === goldRoofMat ? M.gold : M.ridge, sx * w * 0.495, kick + 0.15, sz * d * 0.495);
    c.rotation.z = -sx * 0.7;
    c.rotation.x = sz * 0.7;
  }
  const L = Math.abs(w - d);
  if (L > 0.5) { // ridge beam + dragon-tail ends along the long axis
    const along = w > d;
    const rb = add(g, new THREE.CylinderGeometry(0.2, 0.2, L + 0.6, 24), M.ridge, 0, h + 0.1, 0);
    if (along) rb.rotation.z = Math.PI / 2; else rb.rotation.x = Math.PI / 2;
    for (const s of [-1, 1]) {
      const k = add(g, new THREE.ConeGeometry(0.28, 1.1, 5), M.ridge, along ? s * (L / 2 + 0.4) : 0, h + 0.5, along ? 0 : s * (L / 2 + 0.4));
      if (along) k.rotation.z = -s * 0.6; else k.rotation.x = s * 0.6;
    }
  } else {
    finial(g, h, Math.max(0.8, Math.min(w, d) / 6));
  }
  parent.add(g);
  return g;
}

// ---------- parts ----------

function column(parent, x, y, z, h, r = 0.28, material = M.wood) {
  add(parent, new THREE.CylinderGeometry(r * 0.9, r, h, 20), material, x, y + h / 2, z);
  add(parent, new THREE.CylinderGeometry(r * 1.5, r * 1.7, 0.25, 24), M.stoneDark, x, y + 0.12, z); // stone footing
}

function lanternHanging(parent, x, y, z, s = 1) {
  const l = add(parent, new THREE.SphereGeometry(0.35 * s, 14, 12), M.red, x, y, z);
  l.scale.y = 1.3;
  add(parent, new THREE.CylinderGeometry(0.02, 0.02, 0.7, 4), M.woodDark, x, y + 0.7 * s, z);
  add(parent, new THREE.CylinderGeometry(0.15 * s, 0.15 * s, 0.1, 24), M.gold, x, y - 0.45 * s, z);
}

/** Puts a prebuilt statue (see statues.js) into the scene. */
function place(parent, statue, x, y, z, scale = 1, faceY = 0) {
  statue.position.set(x, y, z);
  statue.rotation.y = faceY;
  statue.scale.setScalar(scale);
  parent.add(statue);
  return statue;
}

function hall(parent) {
  const g = new THREE.Group();
  g.position.set(0, 0, -14);

  add(g, new THREE.BoxGeometry(26, 1, 18), M.stone, 0, 0.5, 0);
  walkable(add(g, new THREE.BoxGeometry(22, 0.45, 14), M.brick, 0, 1.225, 0));
  const base = 1.45, ph = 6.2;

  // Front colonnade (6 columns) and side columns
  for (let x = -10; x <= 10; x += 4) column(g, x, base, 6.5, ph);
  for (let x = -10; x <= 10; x += 4) column(g, x, base, -6.5, ph);
  for (const x of [-10, 10]) for (const z of [-3, 0, 3]) column(g, x, base, z, ph);

  // Walls: back + sides in "Huế yellow", front corner bays closed with round lattice windows
  add(g, new THREE.BoxGeometry(20.6, ph, 0.4), M.wall, 0, base + ph / 2, -6.6);
  for (const s of [-1, 1]) {
    add(g, new THREE.BoxGeometry(0.4, ph, 13), M.wall, s * 10, base + ph / 2, 0);
    add(g, new THREE.BoxGeometry(3.6, ph, 0.4), M.wall, s * 8, base + ph / 2, 6.5);
    const win = add(g, new THREE.CylinderGeometry(0.9, 0.9, 0.15, 24), M.woodDark, s * 8, base + 2.6, 6.75);
    win.rotation.x = Math.PI / 2;
    // door leaves folded open against the inner columns
    add(g, new THREE.BoxGeometry(0.12, ph - 0.6, 1.8), M.door, s * 5.4, base + (ph - 0.6) / 2, 6.0).rotation.y = s * 0.6;
  }
  add(g, new THREE.BoxGeometry(24, 0.5, 0.6), M.woodDark, 0, base + ph + 0.1, 6.5); // front lintel beam
  add(g, new THREE.BoxGeometry(24, 0.5, 14), M.woodDark, 0, base + ph + 0.1, 0);

  // Double-tiered roof (mái chồng diêm)
  const eave = base + ph + 0.35;
  roof(g, 30, 22, eave, 3.2, goldRoofMat);
  add(g, new THREE.BoxGeometry(13, 2.0, 9), M.wall, 0, eave + 2.4, 0);
  add(g, new THREE.BoxGeometry(13.4, 0.3, 9.4), M.woodDark, 0, eave + 1.5, 0);
  roof(g, 18, 13, eave + 3.4, 2.6, goldRoofMat);
  add(g, new THREE.BoxGeometry(8, 1.8, 5.6), M.wall, 0, eave + 4.8, 0);
  add(g, new THREE.BoxGeometry(8.4, 0.3, 6), M.woodDark, 0, eave + 4.0, 0);
  roof(g, 11.5, 8.5, eave + 5.7, 2.2, goldRoofMat);
  // Plaque above the entrance
  sign(g, '大雄寶殿', 5.2, 1.2, 0, base + ph - 0.65, 6.85); // Đại Hùng Bảo Điện
  sign(g, '佛光普照', 0.6, 2.9, 2, base + 2.2, 6.85, { vertical: true }); // Phật quang phổ chiếu
  sign(g, '法雨均霑', 0.6, 2.9, -2, base + 2.2, 6.85, { vertical: true }); // Pháp vũ quân triêm

  // Altar: three tiers + Tam Thế Phật + offering table
  const altarZ = -4.4;
  add(g, new THREE.BoxGeometry(14, 0.6, 3.6), M.wood, 0, base + 0.3, altarZ);
  add(g, new THREE.BoxGeometry(11, 0.6, 2.8), M.red, 0, base + 0.9, altarZ - 0.2);
  add(g, new THREE.BoxGeometry(8, 0.6, 2.0), M.wood, 0, base + 1.5, altarZ - 0.4);
  // Tam Thế Phật: Shakyamuni touching the earth (centre), flanked by a teaching Buddha and a meditating Buddha
  place(g, buddhaStatue({ mudra: 'earth', halo: 'full' }), 0, base + 1.8, altarZ - 0.4, 0.95);
  place(g, buddhaStatue({ mudra: 'vitarka', halo: 'head' }), -3.6, base + 1.2, altarZ - 0.3, 0.75);
  place(g, buddhaStatue({ mudra: 'dhyana', halo: 'head' }), 3.6, base + 1.2, altarZ - 0.3, 0.75);
  add(g, new THREE.BoxGeometry(5, 0.9, 1.2), M.red, 0, base + 0.45, altarZ + 2.6); // offering table
  for (const x of [-1.9, -1.1, 1.1, 1.9]) add(g, new THREE.SphereGeometry(0.3, 12, 10), M.lotus, x, base + 1.1, altarZ + 2.6);
  const tb = new THREE.Group(); // small bronze censer on the table
  tb.position.set(0, base + 0.9, altarZ + 2.6);
  add(tb, new THREE.CylinderGeometry(0.3, 0.22, 0.3, 20), M.bronze, 0, 0.15);
  add(tb, new THREE.TorusGeometry(0.3, 0.035, 6, 24), M.gold, 0, 0.3, 0).rotation.x = Math.PI / 2;
  add(tb, new THREE.CylinderGeometry(0.28, 0.28, 0.03, 20), M.ash, 0, 0.29);
  g.add(tb);
  BURNERS.push({ x: 0, y: base + 0.9 + 0.31, z: -14 + altarZ + 2.6, spread: 0.18 });
  obsBox(0, -14 + altarZ + 2.6, 5.4, 1.5); // table
  for (const x of [-7, -3.5, 0, 3.5, 7]) for (const z of [-1, 4]) lanternHanging(g, x, base + ph - 0.7, z);
  const glow = new THREE.PointLight(0xffc878, 40, 30, 1.5); // lamp light inside the hall
  glow.position.set(0, base + ph - 1.5, 0);
  g.add(glow);
  parent.add(g);

  // Prayer cushions (bồ đoàn) on the hall floor, world coordinates
  const cg = new THREE.CylinderGeometry(0.42, 0.46, 0.14, 24);
  for (let row = 0; row < 4; row++) for (let col = -3; col <= 3; col++) {
    const x = col * 2.4, z = -14 + 0.2 + row * 2.0;
    add(parent, cg, M.cushion, x, base + 0.07, z);
    CUSHIONS.push({ x, z });
  }

  // Front steps with dragon balustrades (thành bậc rồng)
  for (let i = 0; i < 3; i++) walkable(add(parent, new THREE.BoxGeometry(6.4, (i + 1) / 3, 1), M.stone, 0, (i + 1) / 6, -2.5 - i));
  for (const s of [-1, 1]) {
    const rail = add(parent, new THREE.BoxGeometry(0.5, 0.5, 3.3), M.stone, s * 3.6, 0.55, -3.5);
    rail.rotation.x = Math.atan(1 / 3);
    const head = add(parent, new THREE.ConeGeometry(0.3, 0.9, 5), M.gold, s * 3.6, 0.35, -1.9);
    head.rotation.x = -Math.PI / 2.4;
  }

  // Collision: platform edge (open only at the steps), altar
  obsBox(-8.5, -5, 10.2, 1.2); obsBox(8.5, -5, 10.2, 1.2);
  obsBox(-13, -14, 1.2, 18.6); obsBox(13, -14, 1.2, 18.6);
  obsBox(0, -23, 26.6, 1.2);
  obsBox(0, -18.4, 14, 3.6);
}

function tamQuan(parent) {
  const g = new THREE.Group();
  g.position.set(0, 0, 18);
  const pier = (x, h, w = 1.2) => {
    add(g, new THREE.BoxGeometry(w, h, w), M.cream, x, h / 2, 0);
    add(g, new THREE.BoxGeometry(w * 1.25, 0.3, w * 1.25), M.stoneDark, x, 0.15, 0);
    add(g, new THREE.BoxGeometry(w * 1.1, 0.35, w * 1.1), M.wood, x, h - 0.2, 0);
    obsBox(x, 18, w + 0.2, w + 0.2);
  };
  for (const s of [-1, 1]) { pier(s * 3.2, 5.2); pier(s * 7.4, 4.2); }
  // central lintel + upper loft
  add(g, new THREE.BoxGeometry(6.2, 0.7, 1.0), M.woodDark, 0, 4.4, 0);
  sign(g, '三關', 3.2, 0.9, 0, 4.4, 0.6); // Tam Quan
  add(g, new THREE.BoxGeometry(7.4, 1.5, 1.8), M.wall, 0, 5.95, 0);
  for (const s of [-1, 1]) add(g, new THREE.BoxGeometry(0.9, 0.9, 0.2), M.woodDark, s * 2, 6.0, 0.95);
  roof(g, 11, 4.4, 5.15, 1.3);
  roof(g, 8.6, 3.6, 6.75, 1.5, goldRoofMat);
  add(g, new THREE.BoxGeometry(5.2, 1.4, 1.6), M.wall, 0, 8.0, 0);
  roof(g, 7, 3, 8.6, 1.3, goldRoofMat);
  // side doors: lower single-tier roofs + lintels
  for (const s of [-1, 1]) {
    add(g, new THREE.BoxGeometry(3.6, 0.5, 0.9), M.woodDark, s * 5.3, 3.5, 0);
    roof(g, 6, 3.6, 4.15, 1.0);
    g.children.at(-1).position.x = s * 5.3;
  }
  parent.add(g);

  // Flanking lantern pillars (trụ biểu) and compound walls
  for (const s of [-1, 1]) {
    const t = new THREE.Group();
    t.position.set(s * 10.6, 0, 18);
    add(t, new THREE.BoxGeometry(1.1, 5.6, 1.1), M.cream, 0, 2.8);
    add(t, new THREE.BoxGeometry(1.6, 0.4, 1.6), M.stoneDark, 0, 0.2);
    add(t, new THREE.BoxGeometry(1.5, 0.3, 1.5), M.wood, 0, 5.7);
    add(t, new THREE.OctahedronGeometry(0.7), M.lantern, 0, 6.5);
    add(t, new THREE.ConeGeometry(0.6, 0.8, 4), M.roof, 0, 7.3);
    parent.add(t);
    obsBox(s * 10.6, 18, 1.6, 1.6);
  }
}

// Small gate in the compound's east wall: two cream piers, a lintel and a curved roof.
function sideGate(parent, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  for (const s of [-1, 1]) {
    add(g, new THREE.BoxGeometry(1.0, 4.8, 1.0), M.cream, 0, 2.4, s * 3.6);
    add(g, new THREE.BoxGeometry(1.3, 0.3, 1.3), M.stoneDark, 0, 0.15, s * 3.6);
    add(g, new THREE.BoxGeometry(1.15, 0.3, 1.15), M.wood, 0, 4.7, s * 3.6);
    obsBox(x, z + s * 3.6, 1.4, 1.4);
  }
  add(g, new THREE.BoxGeometry(0.9, 0.5, 7.0), M.woodDark, 0, 4.4, 0);
  roof(g, 3.4, 9.4, 4.85, 1.2);
  parent.add(g);
}

function wall(parent, x0, z0, x1, z1) {
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = Math.abs(x1 - x0) || 0.6, d = Math.abs(z1 - z0) || 0.6;
  add(parent, new THREE.BoxGeometry(w, 1.6, d), M.wall, cx, 0.8, cz);
  add(parent, new THREE.BoxGeometry(w + 0.2, 0.25, d + 0.2), M.ridge, cx, 1.7, cz);
  obsBox(cx, cz, w, d);
}

function bellTower(parent, x, z, drum) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  add(g, new THREE.BoxGeometry(5.2, 0.8, 5.2), M.stone, 0, 0.4, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) column(g, sx * 2, 0.8, sz * 2, 3.0, 0.22);
  add(g, new THREE.BoxGeometry(4.8, 0.3, 4.8), M.woodDark, 0, 3.95, 0);
  roof(g, 6.8, 6.8, 3.9, 1.0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) column(g, sx * 1.3, 4.4, sz * 1.3, 2.2, 0.17);
  add(g, new THREE.BoxGeometry(3.2, 0.25, 0.3), M.woodDark, 0, 6.5, 0);
  sign(g, drum ? '鼓樓' : '鐘樓', 1.8, 0.6, 0, 3.5, 2.1); // Cổ lâu / Chung lâu
  if (drum) {
    const d = add(g, new THREE.CylinderGeometry(0.75, 0.75, 1.3, 24), M.red, 0, 5.3, 0);
    d.rotation.z = Math.PI / 2;
  } else {
    add(g, new THREE.CylinderGeometry(0.15, 0.15, 0.5, 24), M.woodDark, 0, 6.2, 0);
    add(g, new THREE.CylinderGeometry(0.35, 0.65, 1.2, 24), M.bronze, 0, 5.4, 0);
  }
  roof(g, 4.8, 4.8, 6.6, 1.9);
  parent.add(g);
  obsBox(x, z, 5.8, 5.8);
}

// Long covered gallery lined with seated Arhat statues (hành lang La Hán), open to the courtyard.
function gallery(parent, side) {
  const cx = side * 26.4, z0 = 12, z1 = -6;
  const g = new THREE.Group();
  g.position.set(cx, 0, (z0 + z1) / 2);
  const len = z0 - z1;
  add(g, new THREE.BoxGeometry(6.6, 0.12, len + 1), M.path, 0, 0.06, 0).userData.walk = true;
  add(g, new THREE.BoxGeometry(0.4, 3.6, len + 0.8), M.wall, side * 2.9, 1.8, 0);
  for (let z = -len / 2; z <= len / 2 + 0.01; z += 3) {
    column(g, -side * 2.9, 0.1, z, 3.5, 0.22);
    obsCircle(cx - side * 2.9, (z0 + z1) / 2 + z, 0.3);
    place(g, arhatStatue(Math.round((z + len / 2) / 3) + (side > 0 ? 3 : 0)), side * 2.2, 0.1, z + 1.5, 0.7, -side * Math.PI / 2);
    if (z < len / 2) obsCircle(cx + side * 2.2, (z0 + z1) / 2 + z + 1.5, 0.8);
  }
  add(g, new THREE.BoxGeometry(6.8, 0.35, len + 1), M.woodDark, 0, 3.55, 0);
  roof(g, 8, len + 1.4, 3.7, 1.6);
  parent.add(g);
}

// 13-storey stupa on a terraced base, with gilded roofs (bảo tháp Bái Đính).
function stupa13(parent, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  add(g, new THREE.BoxGeometry(16, 0.8, 16), M.stone, 0, 0.4);
  add(g, new THREE.BoxGeometry(13, 0.8, 13), M.stoneDark, 0, 1.2);
  add(g, new THREE.BoxGeometry(10, 0.8, 10), M.stone, 0, 2.0);
  for (let i = 0; i < 4; i++) add(g, new THREE.BoxGeometry(5, 0.8 / 4 * (4 - i) + 0.05, 0.9), M.stone, 0, 0.2 + i * 0.1, 8.4 + 0.4 * (3 - i)); // front steps
  let y = 2.4, w = 4.6;
  for (let i = 0; i < 13; i++) {
    add(g, new THREE.BoxGeometry(w, 1.6, w), M.wall, 0, y + 0.8, 0);
    add(g, new THREE.BoxGeometry(w * 0.35, 1.0, w * 1.02), M.woodDark, 0, y + 0.8, 0);
    add(g, new THREE.BoxGeometry(w * 1.02, 1.0, w * 0.35), M.woodDark, 0, y + 0.8, 0);
    roof(g, w * 1.7, w * 1.7, y + 1.6, 0.6, goldRoofMat);
    y += 2.1; w *= 0.93;
  }
  add(g, new THREE.CylinderGeometry(0.12, 0.2, 2.6, 24), M.gold, 0, y + 1.0, 0);
  add(g, new THREE.IcosahedronGeometry(0.5, 0), M.gold, 0, y + 2.6, 0);
  add(g, new THREE.ConeGeometry(0.15, 1.2, 5), M.gold, 0, y + 3.5, 0);
  parent.add(g);
  obsBox(x, z, 16.8, 16.8);
}

// Giant laughing Buddha (Di Lặc) on a lotus throne.
function maitreya(parent, x, z) {
  place(parent, maitreyaStatue(), x, 0, z, 1.9);
  obsCircle(x, z, 4);
  obsCircle(x - 3.6, z + 1.7, 1.9); // cloth sack
}

function incenseBurner(parent, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  add(g, new THREE.CylinderGeometry(1.0, 1.2, 0.5, 24), M.stone, 0, 0.25);
  for (const a of [0, 2.1, 4.2]) add(g, new THREE.CylinderGeometry(0.12, 0.15, 0.7, 5), M.bronze, Math.cos(a) * 0.6, 0.85, Math.sin(a) * 0.6);
  add(g, new THREE.CylinderGeometry(0.85, 0.55, 0.9, 24), M.bronze, 0, 1.4);
  add(g, new THREE.TorusGeometry(0.85, 0.06, 8, 32), M.gold, 0, 1.85, 0).rotation.x = Math.PI / 2; // rim
  add(g, new THREE.CylinderGeometry(0.82, 0.82, 0.04, 32), M.ash, 0, 1.84); // ash bed for the sticks
  for (const s of [-1, 1]) add(g, new THREE.TorusGeometry(0.2, 0.05, 6, 16), M.gold, s * 0.95, 1.6, 0).rotation.y = Math.PI / 2; // handles
  parent.add(g);
  obsCircle(x, z, 1.25);
  BURNERS.push({ x, y: 1.87, z, spread: 0.55 });
}

function stele(parent, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  add(g, new THREE.BoxGeometry(2.6, 0.7, 1.7), M.stoneDark, 0, 0.35); // tortoise shell (bia rùa)
  add(g, new THREE.BoxGeometry(0.7, 0.5, 0.8), M.stoneDark, 0, 0.45, 1.2);
  add(g, new THREE.BoxGeometry(1.5, 2.8, 0.35), M.stone, 0, 2.1);
  sign(g, '南無阿彌陀佛', 1.3, 2.5, 0, 2.1, 0.22, { vertical: true, bg: '#d8d0bc', fg: '#3a2a1a' }); // Nam mô A Di Đà Phật
  add(g, new THREE.ConeGeometry(0.95, 0.5, 4), M.stoneDark, 0, 3.75).rotation.y = Math.PI / 4;
  parent.add(g);
  obsBox(x, z, 2.8, 2.2);
}

function lotusPond(parent, x, z, r) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  add(g, new THREE.CylinderGeometry(r, r, 0.3, 24), M.stoneDark, 0, 0.1);
  const water = add(g, new THREE.CylinderGeometry(r - 0.45, r - 0.45, 0.3, 24), M.water, 0, 0.18);
  water.castShadow = false;
  for (let i = 0; i < 12; i++) {
    const a = Math.random() * 6.28, d = Math.random() * (r - 1.3);
    const px = Math.cos(a) * d, pz = Math.sin(a) * d;
    add(g, new THREE.CylinderGeometry(0.5, 0.5, 0.04, 24), M.pad, px, 0.36, pz).castShadow = false;
    if (i % 3 === 0) {
      const f = add(g, new THREE.OctahedronGeometry(0.28), M.lotus, px, 0.62, pz);
      f.scale.y = 1.3;
    }
  }
  parent.add(g);
  obsCircle(x, z, r + 0.2);
}

function bodhiTree(parent, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  add(g, new THREE.CylinderGeometry(0.7, 1.1, 5, 24), M.trunk, 0, 2.5);
  for (const [dx, dy, dz, r] of [[0, 7.5, 0, 3.6], [-3, 6.4, 1.2, 2.8], [3, 6.6, -1, 3], [1.4, 8.8, 2, 2.4], [-1.6, 8.4, -2.2, 2.6]]) {
    add(g, new THREE.IcosahedronGeometry(r, 0), M.banyan, dx, dy, dz);
  }
  parent.add(g);
  obsCircle(x, z, 1.4);
}

function frangipani(parent, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  add(g, new THREE.CylinderGeometry(0.2, 0.32, 2.6, 5), M.trunk, 0, 1.3);
  for (const [dx, dy, dz] of [[0, 3.2, 0], [-1, 2.8, 0.6], [1, 2.9, -0.5]]) add(g, new THREE.IcosahedronGeometry(1.2, 0), M.leaf2, dx, dy, dz);
  for (let i = 0; i < 7; i++) add(g, new THREE.OctahedronGeometry(0.2), M.white, (Math.random() - 0.5) * 3, 2.6 + Math.random() * 1.4, (Math.random() - 0.5) * 3);
  parent.add(g);
  obsCircle(x, z, 0.6);
}

function tree(parent, x, z, s = 1) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  add(g, new THREE.CylinderGeometry(0.2 * s, 0.3 * s, 1.6 * s, 5), M.trunk, 0, 0.8 * s);
  const m = Math.random() > 0.5 ? M.leaf : M.leaf2;
  add(g, new THREE.ConeGeometry(1.7 * s, 3 * s, 6), m, 0, 3 * s);
  add(g, new THREE.ConeGeometry(1.3 * s, 2.6 * s, 6), m, 0, 4.4 * s);
  add(g, new THREE.ConeGeometry(0.9 * s, 2.2 * s, 6), m, 0, 5.6 * s);
  parent.add(g);
}

function bamboo(parent, cx, cz) {
  for (let i = 0; i < 14; i++) {
    const h = 7 + Math.random() * 4;
    const b = add(parent, new THREE.CylinderGeometry(0.08, 0.1, h, 5), M.bamboo, cx + (Math.random() - 0.5) * 5, h / 2, cz + (Math.random() - 0.5) * 4);
    b.rotation.z = (Math.random() - 0.5) * 0.15;
    add(parent, new THREE.ConeGeometry(0.6, 1.6, 5), M.leaf2, b.position.x, h - 0.2, b.position.z).castShadow = false;
  }
}

function stoneLanterns(parent) {
  for (const side of [-1, 1]) for (const z of [8, 3]) {
    const g = new THREE.Group();
    g.position.set(side * 3.6, 0, z);
    add(g, new THREE.CylinderGeometry(0.3, 0.4, 0.8, 24), M.stoneDark, 0, 0.4);
    add(g, new THREE.CylinderGeometry(0.15, 0.15, 1.0, 24), M.stone, 0, 1.3);
    add(g, new THREE.OctahedronGeometry(0.45), M.lantern, 0, 2.1);
    add(g, new THREE.ConeGeometry(0.65, 0.5, 4), M.stoneDark, 0, 2.65);
    parent.add(g);
  }
}

/** Builds the pagoda compound and returns the ground mesh. Click-to-move only accepts meshes flagged userData.walk. */
export function buildWorld(scene) {
  scene.background = new THREE.Color(0xf2d9b0);
  scene.fog = new THREE.Fog(0xf2d9b0, 60, 220);

  scene.add(new THREE.HemisphereLight(0xfff1d8, 0x4b6a58, 1.1));
  const sun = new THREE.DirectionalLight(0xffe2b0, 2.2);
  sun.position.set(6, 45, 16); // aimed at the middle of pagoda + prison, same direction as before
  sun.target.position.set(36, 0, -14);
  scene.add(sun.target);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.normalBias = 0.06;
  Object.assign(sun.shadow.camera, { left: -95, right: 95, top: 95, bottom: -95, near: 1, far: 200 });
  scene.add(sun);

  const ground = walkable(add(scene, new THREE.CircleGeometry(240, 24), M.grass));
  ground.rotation.x = -Math.PI / 2;
  ground.castShadow = false;
  ground.receiveShadow = true;
  walkable(add(scene, new THREE.BoxGeometry(60, 0.06, 64), M.brick, 0, 0.03, -14)); // sân gạch
  walkable(add(scene, new THREE.BoxGeometry(4.6, 0.08, 52), M.path, 0, 0.07, 22)); // central path + road

  tamQuan(scene);
  hall(scene);
  bellTower(scene, -19, 9, false);
  bellTower(scene, 19, 9, true);
  gallery(scene, -1);
  gallery(scene, 1);
  stupa13(scene, 0, -37);
  maitreya(scene, -19, -33);
  maitreya(scene, 19, -33);
  lotusPond(scene, -10.5, 5, 4.2);
  lotusPond(scene, 10.5, 5, 4.2);
  incenseBurner(scene, 0, 2);
  stele(scene, -8, -0.5);
  stoneLanterns(scene);
  bodhiTree(scene, 21, -27);
  for (const [x, z] of [[-21, -22], [21, -8], [-14, -30], [14, -30], [-22, -42], [22, -42]]) frangipani(scene, x, z);

  // Compound walls (front walls leave the three gates and lantern pillars free)
  for (const s of [-1, 1]) {
    wall(scene, s * 11.4, 18, s * 30, 18);
    if (s < 0) wall(scene, -30, 18, -30, -46);
    else { // east wall has a side gate leading to the prison
      wall(scene, 30, 18, 30, -10.4);
      wall(scene, 30, -17.6, 30, -46);
    }
  }
  sideGate(scene, 30, -14);
  wall(scene, -30, -46, 30, -46);

  bamboo(scene, -24, -43);
  bamboo(scene, 24, -43);

  for (let i = 0; i < 160; i++) {
    const a = Math.random() * Math.PI * 2, r = 34 + Math.random() * 80;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.abs(x) < 33 && z > -52 && z < 24) continue; // keep clear of the compound
    if (x > 30 && x < 104 && z > -44 && z < 16) continue; // ...and of the prison grounds and the road to it
    if (Math.abs(x) < 8 && z > 10) continue; // keep the road clear
    if (Math.abs(x) < 30 && z > 40) continue; // meeting building and its approach
    if (inDogZone(x, z) || (x < -4 && z > 20 && z < 36)) continue; // dog district and the road leading to it
    if (inTennis(x, z) || (x > 0 && x < TEN.cx && Math.abs(z - TEN.cz - 9.5) < 3.5)) continue; // tennis court and its path
    tree(scene, x, z, 0.8 + Math.random() * 0.8);
  }
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + Math.random() * 0.3, r = 175 + Math.random() * 30, s = 30 + Math.random() * 30;
    const m = add(scene, new THREE.ConeGeometry(s, s * (1.2 + Math.random() * 0.8), 5 + (i % 3)), i % 2 ? M.mount : M.mount2, Math.cos(a) * r, s * 0.5, Math.sin(a) * r);
    m.castShadow = false;
  }
  return ground;
}
