import * as THREE from 'three';
import { Parts } from './parts.js';
import { OBSTACLES } from './world.js';
import { TEN, C } from './tennisrules.js';

// The "Sân Te Nít" court: a blue hard court inside a fenced green apron, net, umpire chair, stands, floodlights and two score
// boards. The scoreboard texture is repainted by tennisplay.js. The only gap in the fence faces the road to the west.

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra });
const MAT = {
  post: std(0x6b7077, { metalness: 0.4, roughness: 0.5 }), white: std(0xf4f4f4), dark: std(0x23272d), wood: std(0x9a6a3c),
  seat: std(0x2f5fa8), chairWhite: std(0xe8e8e8), lamp: new THREE.MeshBasicMaterial({ color: 0xfff6d0 }), bench: std(0x5b8f5f),
};
const Box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const Cyl = (rt, rb, h, seg = 8) => new THREE.CylinderGeometry(rt, rb, h, seg);

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { c, g: c.getContext('2d'), tex };
}

const PPM = 24; // court texture pixels per metre

function courtTexture() {
  const W = 2 * (C.fenceX - 0.2), L = 2 * (C.fenceZ - 0.2);
  const { c, g, tex } = canvas(Math.round(W * PPM), Math.round(L * PPM));
  const X = (x) => c.width / 2 + x * PPM, Z = (z) => c.height / 2 + z * PPM;
  g.fillStyle = '#3f7d4f'; g.fillRect(0, 0, c.width, c.height); // grass apron
  g.fillStyle = '#c77a52'; // clay-red runoff around the playing area
  g.fillRect(X(-C.alley - 3), Z(-C.halfL - 4), 2 * (C.alley + 3) * PPM, 2 * (C.halfL + 4) * PPM);
  g.fillStyle = '#2d6fb4'; g.fillRect(X(-C.alley), Z(-C.halfL), 2 * C.alley * PPM, 2 * C.halfL * PPM);
  g.fillStyle = '#2a64a4'; g.fillRect(X(-C.halfW), Z(-C.svc), 2 * C.halfW * PPM, 2 * C.svc * PPM); // service area, slightly darker
  g.strokeStyle = '#fff'; g.lineWidth = 3; g.lineCap = 'square';
  const line = (x0, z0, x1, z1) => { g.beginPath(); g.moveTo(X(x0), Z(z0)); g.lineTo(X(x1), Z(z1)); g.stroke(); };
  for (const s of [-1, 1]) {
    line(-C.alley, s * C.halfL, C.alley, s * C.halfL); // baselines
    line(s * C.alley, -C.halfL, s * C.alley, C.halfL); // doubles sidelines
    line(s * C.halfW, -C.halfL, s * C.halfW, C.halfL); // singles sidelines
    line(-C.halfW, s * C.svc, C.halfW, s * C.svc); // service lines
    line(0, s * C.halfL, 0, s * (C.halfL - 0.4)); // centre marks
  }
  line(0, -C.svc, 0, C.svc); // centre service line
  tex.anisotropy = 8;
  return { tex, W, L };
}

function netTexture() {
  const { c, g, tex } = canvas(256, 32);
  g.fillStyle = 'rgba(30,30,30,0.0)'; g.clearRect(0, 0, 256, 32);
  g.strokeStyle = 'rgba(245,245,245,0.85)'; g.lineWidth = 1;
  for (let x = 0; x <= 256; x += 6) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 32); g.stroke(); }
  for (let y = 0; y <= 32; y += 6) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); }
  return tex;
}

function textPlane(w, h, text, bg, fg, px = 96) {
  const t = canvas(1024, Math.round(1024 * h / w));
  t.g.fillStyle = bg; t.g.fillRect(0, 0, t.c.width, t.c.height);
  t.g.strokeStyle = '#ffd23c'; t.g.lineWidth = 10; t.g.strokeRect(10, 10, t.c.width - 20, t.c.height - 20);
  t.g.fillStyle = fg; t.g.font = `bold ${px}px system-ui, sans-serif`; t.g.textAlign = 'center'; t.g.textBaseline = 'middle';
  t.g.fillText(text, t.c.width / 2, t.c.height / 2 + 4); t.tex.needsUpdate = true;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t.tex, side: THREE.FrontSide }));
}

export function buildTennis(scene) {
  const root = new THREE.Group();
  root.position.set(TEN.cx, 0, TEN.cz);
  scene.add(root);
  const P = new Parts(MAT);
  const obs = (lx0, lz0, lx1, lz1) => OBSTACLES.push({ x0: TEN.cx + Math.min(lx0, lx1), x1: TEN.cx + Math.max(lx0, lx1), z0: TEN.cz + Math.min(lz0, lz1), z1: TEN.cz + Math.max(lz0, lz1) });
  const FX = C.fenceX, FZ = C.fenceZ;

  // ground: textured court (walkable)
  const ct = courtTexture();
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(ct.W, ct.L), new THREE.MeshStandardMaterial({ map: ct.tex, roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = 0.04; ground.receiveShadow = true; ground.userData.walk = true;
  root.add(ground);
  // path from the main road to the gate
  const pathLen = TEN.cx - FX;
  const path = new THREE.Mesh(Box(pathLen, 0.08, 3), std(0xcfc8b8));
  path.position.set(-FX - pathLen / 2, 0.06, 9.5); path.userData.walk = true; path.receiveShadow = true;
  root.add(path);

  // fence: posts + translucent windscreen; the gap is on the west side at z = 8..11
  const GAP = [8, 11];
  const wall = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 3)), ang = Math.atan2(x1 - x0, z1 - z0);
    for (let i = 0; i <= n; i++) P.add('post', Cyl(0.07, 0.07, 3.4), { p: [x0 + ((x1 - x0) * i) / n, 1.7, z0 + ((z1 - z0) * i) / n] });
    P.add('post', Box(0.08, 0.08, len), { p: [(x0 + x1) / 2, 3.4, (z0 + z1) / 2], r: [0, ang, 0] });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len, 3.2), new THREE.MeshBasicMaterial({ color: 0x1f5a3a, transparent: true, opacity: 0.38, side: THREE.DoubleSide, depthWrite: false }));
    m.position.set((x0 + x1) / 2, 1.8, (z0 + z1) / 2); m.rotation.y = ang - Math.PI / 2; root.add(m);
    obs(x0 - 0.15, z0 - 0.15, x1 + 0.15, z1 + 0.15);
  };
  wall(-FX, -FZ, FX, -FZ); wall(-FX, FZ, FX, FZ); wall(FX, -FZ, FX, FZ);

  // net
  const NX = C.alley + 0.9;
  for (const s of [-1, 1]) P.add('post', Cyl(0.06, 0.06, 1.07), { p: [s * NX, 0.535, 0] });
  P.add('white', Box(2 * NX, 0.07, 0.04), { p: [0, C.netH, 0] });
  const netMesh = new THREE.Mesh(new THREE.PlaneGeometry(2 * NX, C.netH - 0.04), new THREE.MeshBasicMaterial({ map: netTexture(), transparent: true, side: THREE.DoubleSide, depthWrite: false }));
  netMesh.position.set(0, (C.netH - 0.04) / 2, 0);
  root.add(netMesh);
  obs(-NX - 0.1, -0.2, NX + 0.1, 0.2);

  // umpire chair beside the net
  const ux = NX + 1.2;
  for (const dx of [-0.35, 0.35]) for (const dz of [-0.3, 0.3]) P.add('chairWhite', Box(0.07, 2.2, 0.07), { p: [ux + dx, 1.1, dz] });
  P.add('seat', Box(0.9, 0.1, 0.8), { p: [ux, 2.2, 0] });
  P.add('seat', Box(0.9, 0.7, 0.08), { p: [ux + 0.42, 2.6, 0], r: [0, 0, 0] });
  P.add('chairWhite', Box(0.8, 0.05, 0.05), { p: [ux, 1.2, 0.3] });
  obs(ux - 0.5, -0.5, ux + 0.5, 0.5);

  // stands: two rows of benches outside the east fence
  for (let row = 0; row < 3; row++) for (const z of [-9, 0, 9]) {
    P.add('bench', Box(0.55, 0.12, 6.5), { p: [FX + 1.8 + row * 0.9, 0.45 + row * 0.45, z] });
    P.add('dark', Box(0.5, 0.45 + row * 0.45, 6.4), { p: [FX + 1.8 + row * 0.9 + 0.05, (0.45 + row * 0.45) / 2, z] });
  }
  obs(FX + 1.3, -12.5, FX + 4.3, 12.5);

  // floodlights at the four corners
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * (FX + 1), z = sz * (FZ + 1);
    P.add('post', Cyl(0.12, 0.18, 9), { p: [x, 4.5, z] });
    P.add('dark', Box(1.6, 0.9, 0.25), { p: [x - sx * 0.4, 9.2, z], r: [0, 0, 0] });
    P.add('lamp', Box(1.4, 0.7, 0.06), { p: [x - sx * 0.4, 9.2, z - sz * 0.15] });
    obs(x - 0.2, z - 0.2, x + 0.2, z + 0.2);
  }
  root.add(P.build({ castShadow: true, receiveShadow: false }));

  // west wall in two pieces around the gate (built after the merge so these use their own meshes)
  {
    const P2 = new Parts(MAT);
    const seg = (z0, z1) => {
      const len = z1 - z0, n = Math.max(1, Math.round(len / 3));
      for (let i = 0; i <= n; i++) P2.add('post', Cyl(0.07, 0.07, 3.4), { p: [-FX, 1.7, z0 + (len * i) / n] });
      P2.add('post', Box(0.08, 0.08, len), { p: [-FX, 3.4, (z0 + z1) / 2] });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(len, 3.2), new THREE.MeshBasicMaterial({ color: 0x1f5a3a, transparent: true, opacity: 0.38, side: THREE.DoubleSide, depthWrite: false }));
      m.position.set(-FX, 1.8, (z0 + z1) / 2); m.rotation.y = Math.PI / 2; root.add(m);
      obs(-FX - 0.15, z0, -FX + 0.15, z1);
    };
    seg(-FZ, GAP[0]); seg(GAP[1], FZ);
    // gate arch with sign
    for (const z of GAP) P2.add('post', Box(0.3, 4.6, 0.3), { p: [-FX, 2.3, z] });
    P2.add('dark', Box(0.35, 0.9, GAP[1] - GAP[0] + 0.6), { p: [-FX, 4.5, (GAP[0] + GAP[1]) / 2] });
    root.add(P2.build({ castShadow: true }));
    const sign = textPlane(GAP[1] - GAP[0] + 0.4, 0.8, 'SÂN TE NÍT', '#14507a', '#ffffff', 150);
    sign.position.set(-FX - 0.2, 4.5, (GAP[0] + GAP[1]) / 2); sign.rotation.y = -Math.PI / 2; root.add(sign);
    const sign2 = sign.clone(); sign2.position.x = -FX + 0.2; sign2.rotation.y = Math.PI / 2; root.add(sign2);
  }

  // score boards above the long sides, facing the court (the camera sits behind a baseline, so nothing blocks it)
  const board = canvas(1024, 256);
  const boardMat = new THREE.MeshBasicMaterial({ map: board.tex, toneMapped: false });
  for (const s of [-1, 1]) {
    const x = s * (FX + 0.7);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(8, 2), boardMat);
    m.position.set(x, 5.6, 0); m.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2; root.add(m);
    const back = new THREE.Mesh(Box(0.2, 2.3, 8.3), MAT.dark); back.position.set(x + s * 0.12, 5.6, 0); root.add(back);
    for (const z of [-3.5, 3.5]) { const leg = new THREE.Mesh(Cyl(0.1, 0.1, 4.6), MAT.post); leg.position.set(x + s * 0.12, 2.3, z); root.add(leg); }
    obs(x + s * 0.12 - 0.2, -3.7, x + s * 0.12 + 0.2, -3.3); obs(x + s * 0.12 - 0.2, 3.3, x + s * 0.12 + 0.2, 3.7);
  }

  // the ball, its shadow, the aim ring and the serve-box highlight
  const ball = new THREE.Mesh(new THREE.SphereGeometry(C.R * 1.25, 12, 10), new THREE.MeshStandardMaterial({ color: 0xd9f23a, emissive: 0x6f8a10, roughness: 0.7 }));
  ball.castShadow = true; ball.visible = false; root.add(ball);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.16, 12), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.06; shadow.visible = false; root.add(shadow);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.34, 20), new THREE.MeshBasicMaterial({ color: 0xffe14a, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.07; ring.visible = false; root.add(ring);
  const boxHi = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffe14a, transparent: true, opacity: 0.28, depthWrite: false }));
  boxHi.rotation.x = -Math.PI / 2; boxHi.position.y = 0.065; boxHi.visible = false; root.add(boxHi);

  return {
    root, board, ball, shadow, ring, boxHi,
    /** Court-local -> world. */
    world: (x, z) => [TEN.cx + x, TEN.cz + z],
  };
}
