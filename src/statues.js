import * as THREE from 'three';
import { Parts as BaseParts } from './parts.js';

// Gilded low-poly statues. Each statue is assembled from many small solids that are merged into a handful of meshes
// (one per material), built once per variant and then cloned, so a gallery of statues stays cheap to draw.
// All statues face +z; "left" below means the statue's own left, which is +x.

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, flatShading: false, roughness: 0.55, ...extra });
const MATS = {
  gold: mat(0xdcae3c, { emissive: 0x3a2800, metalness: 0.3 }),
  robe: mat(0xc58a22, { emissive: 0x2a1c00, metalness: 0.2 }),
  hair: mat(0x1d2b63),
  lotus: mat(0xf0a8bc),
  lotusIn: mat(0xf8d4de),
  red: mat(0xa8281c),
  stone: mat(0xcfc7b5),
  dark: mat(0x2a1c14),
  lip: mat(0xb4453a),
  white: mat(0xf6f1e4, { emissive: 0x403c30 }),
  bronze: mat(0x7a5a28, { metalness: 0.4 }),
  wood: mat(0x7a5a30),
  halo: mat(0xf5cf63, { emissive: 0x5a4000, side: THREE.DoubleSide }),
};

// Segment counts are multiplied by SM so the same shapes come out smooth rather than faceted.
const SM = 2.5;
const Cyl = (rt, rb, h, seg = 8, ...r) => new THREE.CylinderGeometry(rt, rb, h, Math.round(seg * SM), 1, false, ...r);
const Sph = (r, w = 8, h = 6, ...rest) => new THREE.SphereGeometry(r, Math.round(w * SM), Math.round(h * SM), ...rest);
const Box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const Cone = (r, h, seg = 5) => new THREE.ConeGeometry(r, h, Math.round(seg * SM));
const Tor = (r, t, arc = Math.PI * 2, seg = 8) => new THREE.TorusGeometry(r, t, 8, Math.round(seg * SM), arc);
const Oct = (r) => new THREE.OctahedronGeometry(r, 2);
const Ico = (r) => new THREE.IcosahedronGeometry(r, 2);

class Parts extends BaseParts {
  constructor() { super(MATS); }
}

// ---------- shared pieces ----------

/** Lotus pedestal: lacquered drum, gilt rim, two rings of petals, a pale seat on top. Returns seat height. */
function lotusThrone(P, r = 1.5) {
  P.add('red', Cyl(r, r * 1.08, 0.5, 8), { p: [0, 0.25, 0] });
  P.add('gold', Cyl(r * 0.88, r * 0.97, 0.14, 8), { p: [0, 0.57, 0] });
  for (const [rad, n, y, tilt, len, off] of [[r * 0.8, 12, 0.82, 0.55, 1.6, 0], [r * 0.62, 12, 0.92, 0.3, 1.4, Math.PI / 12]]) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + off;
      P.add(len > 1.5 ? 'lotus' : 'lotusIn', Oct(0.26), {
        p: [Math.sin(a) * rad, y, Math.cos(a) * rad],
        q: new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, a, 0, 'YXZ')),
        s: [0.8, len, 0.35],
      });
    }
  }
  P.add('lotusIn', Cyl(r * 0.68, r * 0.74, 0.14, 10), { p: [0, 0.98, 0] });
  return 1.05;
}

/** Hand with palm and four fingers. `dir` is the finger direction, `n` the palm normal. */
function hand(P, pos, { fingers = [0, 0, 1], flat = 0.05, w = 0.3, l = 0.32, key = 'gold' } = {}) {
  const f = new THREE.Vector3(...fingers).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), f);
  P.add(key, Box(w, flat, l), { p: pos, q });
  for (let i = 0; i < 4; i++) { // fingers
    const o = new THREE.Vector3((i - 1.5) * (w / 4.5), 0, l * 0.62).applyQuaternion(q).add(new THREE.Vector3(...pos));
    P.add(key, Box(w / 5.5, flat, l * 0.45), { p: o.toArray(), q });
  }
}

/**
 * Head with face. o: { cy, rx, ry, hair: 'curls' | 'bald', ushnisha, beard, earLen, smile, brow }.
 * Face looks toward +z. Hairline sits above the eyebrows; curls (螺髪) cover the cap and back of the skull.
 */
function head(P, o) {
  const { cy = 3.18, rx = 0.46, ry = 0.55, rz = 0.48, earLen = 0.5, smile = 0.09, brow = 'arch' } = o;
  P.add('gold', Sph(1, 12, 9), { p: [0, cy, 0.02], s: [rx, ry, rz] });
  P.add('gold', Cyl(0.2, 0.24, 0.3, 7), { p: [0, cy - ry - 0.05, 0] }); // neck
  for (const s of [-1, 1]) {
    const eyeY = cy + 0.03, fz = rz * 0.9;
    P.add('dark', Box(0.2, 0.03, 0.03), { p: [s * 0.17, eyeY, fz], r: [0, 0, -s * 0.12] }); // half-closed eyes
    P.add(o.hair === 'bald' ? 'white' : 'hair', Box(brow === 'long' ? 0.3 : 0.2, 0.026, 0.03), {
      p: [s * (brow === 'long' ? 0.24 : 0.19), cy + 0.13, fz - 0.01], r: [0, 0, s * (brow === 'long' ? -0.45 : 0.2)],
    });
    P.add('gold', Box(0.07, earLen, 0.12), { p: [s * (rx + 0.04), cy - earLen * 0.2 + 0.05, 0], r: [0, 0, s * 0.08] }); // long ears
    P.add('gold', Sph(0.07, 5, 4), { p: [s * (rx + 0.05), cy - earLen * 0.2 - earLen / 2 + 0.05, 0], s: [0.8, 1.2, 0.9] }); // lobes
  }
  P.add('gold', Cone(0.05, 0.15, 4), { p: [0, cy - 0.06, rz + 0.02], r: [Math.PI / 2 + 0.2, 0, 0] }); // nose
  P.add('lip', Tor(smile * 1.25, 0.02, Math.PI), { p: [0, cy - 0.14, rz * 0.92], r: [0, 0, Math.PI], s: [1, 0.5, 1] }); // smile
  if (o.beard) P.add('white', Cone(0.17, 0.5, 5), { p: [0, cy - ry + 0.02, rz * 0.7], r: [Math.PI - 0.2, 0, 0] });

  if (o.hair === 'curls') {
    // cap + back hair in deep blue, then rows of snail-shell curls over them
    P.add('hair', Sph(1.03, 12, 6, 0, Math.PI * 2, 0, 1.12), { p: [0, cy, 0.02], s: [rx, ry, rz] });
    P.add('hair', Sph(1.03, 12, 8, Math.PI / 2 + 1.1, Math.PI * 2 - 2.2, 0, 1.9), { p: [0, cy, 0.02], s: [rx, ry, rz] });
    for (const th of [0.3, 0.62, 0.94, 1.26, 1.58, 1.85]) {
      const n = Math.max(5, Math.round((Math.PI * 2 * Math.sin(th) * rx) / 0.15));
      for (let i = 0; i < n; i++) {
        const a = ((i + 0.5) / n) * Math.PI * 2 - Math.PI; // a = 0 is straight ahead
        if (Math.abs(a) < 1.1 && th > 1.05) continue; // keep the face clear
        P.add('hair', Ico(0.07), {
          p: [Math.sin(th) * Math.sin(a) * rx * 1.04, cy + Math.cos(th) * ry * 1.04, 0.02 + Math.sin(th) * Math.cos(a) * rz * 1.04],
          s: [1, 0.85, 1],
        });
      }
    }
    P.add('white', Sph(0.035, 5, 4), { p: [0, cy + 0.14, rz + 0.01] }); // urna (white curl between the brows)
    if (o.ushnisha) { // cranial protuberance topped with a flame jewel
      P.add('hair', Sph(0.25, 9, 6), { p: [0, cy + ry + 0.1, 0], s: [1, 0.85, 1] });
      P.add('gold', Cone(0.07, 0.32, 5), { p: [0, cy + ry + 0.42, 0] });
      P.add('red', Sph(0.05, 5, 4), { p: [0, cy + ry + 0.6, 0] });
    }
  }
}

function halo(P, cy, r = 0.9, z = -0.5) {
  P.add('halo', Tor(r, 0.05, Math.PI * 2, 24), { p: [0, cy, z] });
  P.add('halo', Cyl(r - 0.03, r - 0.03, 0.03, 24), { p: [0, cy, z - 0.02], r: [Math.PI / 2, 0, 0] });
  for (let i = 0; i < 18; i++) { // flame rays
    const a = (i / 18) * Math.PI * 2;
    P.add('gold', Cone(0.08, 0.3, 4), { p: [Math.sin(a) * (r + 0.1), cy + Math.cos(a) * (r + 0.1), z], r: [0, 0, -a] });
  }
}

// ---------- Buddha ----------

/** Seated Buddha. mudra: 'dhyana' (meditation), 'earth' (touching the earth), 'vitarka' (teaching). halo: 'head' | 'full'. */
function makeBuddha({ mudra = 'dhyana', haloKind = 'head' }) {
  const P = new Parts();
  const seat = lotusThrone(P, 1.5);

  // legs folded in lotus posture, with robe hems pleating over the lap
  P.add('robe', Sph(1, 10, 6), { p: [0, seat + 0.25, 0.05], s: [1.35, 0.32, 0.85] });
  for (const s of [-1, 1]) {
    P.add('robe', Sph(0.38, 7, 5), { p: [s * 0.95, seat + 0.22, 0.5], s: [1, 0.7, 1.1] }); // knees
    P.add('gold', Box(0.4, 0.09, 0.28), { p: [s * 0.42, seat + 0.5, 0.62], r: [0, s * -0.2, s * 0.15] }); // soles
  }
  for (let i = 0; i < 4; i++) P.add('robe', Tor(0.9 - i * 0.05, 0.035, Math.PI * 0.9, 12), { p: [0, seat + 0.38 + i * 0.02, 0.4 - i * 0.02], r: [-Math.PI / 2 + 0.05, 0, Math.PI * 0.05 + (i % 2) * 0.05] });

  // torso: bare right chest, sanghati over the left shoulder with pleats
  P.add('gold', Cyl(0.66, 0.55, 1.15, 8), { p: [0, seat + 0.95, 0] });
  P.add('gold', Sph(0.5, 8, 6), { p: [0, seat + 1.5, 0], s: [1.35, 0.55, 0.8] });
  P.add('robe', Cyl(0.69, 0.58, 1.2, 8, 0, Math.PI), { p: [0, seat + 0.95, 0] });
  P.add('robe', Sph(0.5, 7, 5), { p: [0.58, seat + 1.5, 0], s: [0.55, 0.6, 0.95] });
  for (let i = 0; i < 5; i++) {
    const a = 0.3 + i * 0.58;
    P.add('gold', Box(0.05, 1.0, 0.05), { p: [Math.sin(a) * 0.62, seat + 0.95, Math.cos(a) * 0.62], r: [0, a, 0] });
  }
  P.add('robe', Box(0.9, 0.07, 0.05), { p: [-0.05, seat + 1.1, 0.62], r: [0, 0, -0.6] }); // diagonal robe edge

  head(P, { cy: seat + 2.15, hair: 'curls', ushnisha: true });

  // arms and hands
  const S = (s) => [s * 0.8, seat + 1.45, 0];
  const E = (s) => [s * 0.98, seat + 0.85, 0.15];
  const lapL = [0.3, seat + 0.5, 0.55];
  P.limb('robe', S(1), E(1), 0.16, 0.14);
  P.limb('gold', S(-1), E(-1), 0.16, 0.14);
  if (mudra === 'dhyana') {
    P.limb('robe', E(1), [0.24, seat + 0.5, 0.48], 0.13, 0.09);
    P.limb('gold', E(-1), [-0.24, seat + 0.5, 0.48], 0.13, 0.09);
    hand(P, [0.12, seat + 0.5, 0.58], { fingers: [-0.3, 0, 1] });
    hand(P, [-0.1, seat + 0.58, 0.6], { fingers: [0.3, 0, 1] });
    P.add('gold', Cyl(0.03, 0.03, 0.2, 5), { p: [0, seat + 0.66, 0.78], r: [0, 0, Math.PI / 2] }); // thumbs meet
  } else {
    P.limb('robe', E(1), [0.3, seat + 0.5, 0.48], 0.13, 0.09);
    hand(P, lapL, { fingers: [0, 0, 1] });
    if (mudra === 'earth') { // right hand reaches over the knee, fingers pointing down
      P.limb('gold', E(-1), [-1.05, seat + 0.2, 0.8], 0.13, 0.09);
      hand(P, [-1.05, seat + 0.05, 0.9], { fingers: [0, -1, 0.3], w: 0.28 });
    } else { // vitarka: right hand raised, palm out, thumb and index touching
      P.limb('gold', E(-1), [-0.88, seat + 1.4, 0.55], 0.13, 0.09);
      hand(P, [-0.88, seat + 1.65, 0.62], { fingers: [0, 1, 0.1], flat: 0.05, w: 0.3, l: 0.34 });
      P.add('gold', Tor(0.05, 0.02, Math.PI * 2, 6), { p: [-0.78, seat + 1.52, 0.66] });
    }
  }

  halo(P, seat + 2.2, 0.85, -0.5);
  if (haloKind === 'full') { // mandorla of flames behind the whole body
    P.add('halo', Tor(1, 0.06, Math.PI * 2, 32), { p: [0, seat + 1.6, -0.8], s: [1.45, 1.55, 1] });
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      P.add('gold', Cone(0.09, 0.4, 4), { p: [Math.sin(a) * 1.5, seat + 1.6 + Math.cos(a) * 1.65, -0.8], r: [0, 0, -a] });
    }
  }
  return P.build();
}

// ---------- Arhat (La Hán) ----------

/** Seated Arhat with a distinct pose per variant: 0 praying, 1 bowl, 2 staff, 3 scroll, 4 raised hand, 5 meditating. */
function makeArhat(v) {
  const P = new Parts();
  P.add('stone', Cyl(0.95, 1.05, 0.3, 8), { p: [0, 0.15, 0] });
  P.add('lotus', Cyl(0.8, 0.9, 0.12, 8), { p: [0, 0.35, 0] });
  const y = 0.4;
  P.add('robe', Sph(1, 9, 6), { p: [0, y + 0.22, 0.05], s: [1.05, 0.3, 0.75] });
  P.add('robe', Cyl(0.55, 0.62, 1.1, 8), { p: [0, y + 0.8, 0] });
  P.add('gold', Sph(0.5, 7, 5), { p: [0, y + 1.3, 0], s: [1.25, 0.5, 0.8] });
  P.add('red', Box(0.18, 1.1, 0.04), { p: [0.25, y + 0.85, 0.57], r: [0, 0, 0.45] }); // sash
  head(P, { cy: y + 1.95, rx: 0.4, ry: 0.46, rz: 0.42, hair: 'bald', earLen: 0.42, smile: 0.08, brow: 'long', beard: v % 2 === 1 });

  const S = (s) => [s * 0.72, y + 1.25, 0];
  const E = (s) => [s * 0.85, y + 0.75, 0.15];
  const arm = (s, to, key = 'robe') => { P.limb('robe', S(s), E(s), 0.14, 0.12); P.limb(key, E(s), to, 0.12, 0.08); };
  switch (v % 6) {
    case 0: // palms together
      arm(1, [0.06, y + 1.0, 0.6]); arm(-1, [-0.06, y + 1.0, 0.6]);
      hand(P, [0, y + 1.1, 0.68], { fingers: [0, 1, 0.2], w: 0.16, l: 0.3 });
      break;
    case 1: { // holding an alms bowl
      arm(1, [0.3, y + 0.62, 0.62]); arm(-1, [-0.3, y + 0.62, 0.62]);
      P.add('bronze', Sph(0.32, 9, 5, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), { p: [0, y + 0.72, 0.68] }); // bowl, mouth up
      P.add('gold', Sph(0.1, 5, 4), { p: [0, y + 0.85, 0.68] }); // offering
      hand(P, [0.32, y + 0.65, 0.65], { fingers: [-1, 0, 0.3], w: 0.14, l: 0.2 });
      hand(P, [-0.32, y + 0.65, 0.65], { fingers: [1, 0, 0.3], w: 0.14, l: 0.2 });
      break;
    }
    case 2: { // staff with rings, right hand raised
      arm(-1, [-1.0, y + 0.8, 0.6]);
      P.limb('wood', [-1.0, 0.3, 0.6], [-1.0, y + 2.9, 0.6], 0.04, 0.04, 5);
      P.add('bronze', Tor(0.2, 0.03, Math.PI * 2, 10), { p: [-1.0, y + 3.0, 0.6] });
      P.add('bronze', Oct(0.08), { p: [-1.0, y + 3.25, 0.6] });
      arm(1, [0.5, y + 1.0, 0.55]);
      hand(P, [0.55, y + 1.12, 0.6], { fingers: [0, 1, 0.3], w: 0.16, l: 0.22 });
      break;
    }
    case 3: // scroll
      arm(1, [0.5, y + 0.9, 0.62]); arm(-1, [-0.5, y + 0.9, 0.62]);
      P.add('white', Cyl(0.09, 0.09, 0.8, 8), { p: [0, y + 0.95, 0.68], r: [0, 0, Math.PI / 2] });
      for (const s of [-1, 1]) P.add('wood', Cyl(0.11, 0.11, 0.06, 8), { p: [s * 0.42, y + 0.95, 0.68], r: [0, 0, Math.PI / 2] });
      break;
    case 4: // one hand raised, the other on the knee
      arm(1, [0.9, y + 1.9, 0.5]);
      hand(P, [0.9, y + 2.05, 0.52], { fingers: [0, 1, 0.1], w: 0.2, l: 0.24 });
      arm(-1, [-0.75, y + 0.35, 0.6]);
      break;
    default: // meditation
      arm(1, [0.2, y + 0.55, 0.55]); arm(-1, [-0.2, y + 0.55, 0.55]);
      hand(P, [0, y + 0.58, 0.62], { fingers: [0, 0, 1], w: 0.4, l: 0.3 });
  }
  return P.build();
}

// ---------- Maitreya (Di Lặc) ----------

function makeMaitreya() {
  const P = new Parts();
  const seat = lotusThrone(P, 2.0);
  // big round belly, folded leg and raised knee
  P.add('gold', Sph(1, 12, 9), { p: [0, seat + 0.95, 0.1], s: [1.3, 0.95, 1.1] });
  P.add('gold', Sph(0.2, 5, 4), { p: [0, seat + 0.95, 1.2], s: [1, 0.6, 0.5] }); // navel
  P.add('gold', Sph(1, 9, 6), { p: [0, seat + 1.85, 0], s: [1.0, 0.5, 0.7] }); // chest and shoulders
  P.add('robe', Sph(0.45, 7, 5), { p: [0.9, seat + 0.35, 0.8], s: [1, 1.3, 1] });
  P.add('robe', Box(1.8, 0.14, 0.9), { p: [0, seat + 0.38, 0.7] }); // robe tucked at the waist
  for (const s of [-1, 1]) P.add('robe', Box(0.3, 1.5, 0.12), { p: [s * 0.78, seat + 1.65, 0.55], r: [0, 0, s * 0.12] }); // open robe fronts

  // bead necklace draped over the chest
  for (let i = 0; i < 19; i++) {
    const t = ((i / 18) - 0.5) * 2.5, L = 0.95 - 0.5 * Math.cos(t);
    P.add('red', Sph(0.09, 5, 4), { p: [1.3 * Math.cos(L) * Math.sin(t) * 1.06, seat + 0.95 + 0.95 * Math.sin(L) * 1.02, 0.1 + 1.1 * Math.cos(L) * Math.cos(t) * 1.06] });
  }

  // face: round, bald, laughing
  const cy = seat + 2.75;
  P.add('gold', Sph(1, 12, 9), { p: [0, cy, 0.05], s: [0.66, 0.62, 0.62] });
  for (const s of [-1, 1]) {
    P.add('gold', Sph(0.2, 6, 5), { p: [s * 0.36, cy - 0.1, 0.5], s: [1, 0.9, 0.8] }); // cheeks
    P.add('dark', Tor(0.09, 0.016, Math.PI, 8), { p: [s * 0.23, cy + 0.12, 0.56] }); // happy closed eyes
    P.add('white', Box(0.2, 0.03, 0.03), { p: [s * 0.24, cy + 0.27, 0.54], r: [0, 0, s * 0.2] });
    P.add('gold', Box(0.12, 0.8, 0.17), { p: [s * 0.72, cy - 0.2, 0.0], r: [0, 0, s * 0.06] }); // long ears
  }
  P.add('gold', Sph(0.1, 5, 4), { p: [0, cy - 0.05, 0.64], s: [1, 0.8, 0.8] });
  P.add('lip', Tor(0.22, 0.03, Math.PI, 10), { p: [0, cy - 0.2, 0.58], r: [0, 0, Math.PI], s: [1, 0.7, 1] });
  P.add('white', Box(0.24, 0.04, 0.03), { p: [0, cy - 0.27, 0.6] }); // teeth
  for (let i = -1; i <= 1; i++) P.add('robe', Box(0.3, 0.02, 0.03), { p: [0, cy + 0.38 + i * 0.07, 0.5], r: [-0.2, 0, 0] }); // brow wrinkles
  for (const x of [-0.18, 0, 0.18]) P.add('hair', Ico(0.07), { p: [x, cy + 0.66, 0.05] }); // topknot bumps

  // arms: right rests on a cloth sack, left holds up a string of beads
  P.limb('gold', [-1.0, seat + 1.9, 0], [-1.6, seat + 1.1, 0.4], 0.28, 0.22);
  P.limb('gold', [-1.6, seat + 1.1, 0.4], [-1.55, seat + 0.45, 0.75], 0.22, 0.16);
  P.add('robe', Sph(0.95, 8, 6), { p: [-1.9, seat + 0.3, 0.9], s: [1, 0.85, 1] });
  P.add('red', Tor(0.3, 0.05, Math.PI * 2, 8), { p: [-1.9, seat + 1.05, 0.9], r: [Math.PI / 2, 0, 0] });
  P.limb('gold', [1.0, seat + 1.9, 0], [1.6, seat + 1.4, 0.5], 0.28, 0.22);
  P.limb('gold', [1.6, seat + 1.4, 0.5], [1.5, seat + 2.2, 0.9], 0.22, 0.16);
  P.add('gold', Ico(0.2), { p: [1.5, seat + 2.3, 0.95] });
  for (let i = 0; i < 9; i++) P.add('red', Sph(0.1, 5, 4), { p: [1.5, seat + 2.1 - i * 0.2, 0.95 + Math.sin(i * 0.35) * 0.1] });
  halo(P, seat + 2.75, 1.0, -0.8);
  return P.build();
}

// ---------- public API (templates are built once, then cloned) ----------

const cache = new Map();
const make = (key, fn) => {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key).clone();
};

/** Seated Buddha, about 4.2 tall at scale 1. */
export const buddhaStatue = (opts = {}) => make(`b:${opts.mudra}:${opts.halo}`, () => makeBuddha({ mudra: opts.mudra, haloKind: opts.halo }));
/** Seated Arhat, about 3.2 tall at scale 1. */
export const arhatStatue = (variant = 0) => make(`a:${variant % 6}`, () => makeArhat(variant));
/** Giant laughing Buddha with beads and a cloth sack, about 4.6 tall at scale 1. */
export const maitreyaStatue = () => make('m', makeMaitreya);
