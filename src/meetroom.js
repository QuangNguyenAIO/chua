import * as THREE from 'three';
import { Parts } from './parts.js';
import { OBSTACLES } from './world.js';
import { MEET, SEAT_COUNT, TABLE, seatPos } from './meetzone.js';

// The meeting building: a boardroom with a long table, 20 chairs, a presentation screen (east wall), a whiteboard (west
// wall), a skyline window (south wall), a sliding door (north wall) and a hologram over the table. The screen, board and
// hologram are canvas textures that meeting.js paints. The ceiling faces down only, so it vanishes from above (cutaway).

const { cx, cz, hw, hd, H } = MEET;
const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra });
const MAT = {
  wall: std(0xe9ecef), green: std(0x1f4f3f), wood: std(0x7a4e2c), woodLight: std(0xb98a58), trim: std(0xc9a24a, { metalness: 0.5, roughness: 0.4 }),
  tableTop: std(0xf4f6f8, { roughness: 0.25, metalness: 0.1 }), tableDark: std(0x20262c, { roughness: 0.3, metalness: 0.4 }),
  chair: std(0x2b3036), chairSeat: std(0x3a4a5c), metal: std(0x8a9098, { metalness: 0.6, roughness: 0.4 }), black: std(0x1a1c20),
  led: new THREE.MeshBasicMaterial({ color: 0xfffbe8 }), path: std(0xcfc8b8), plant: std(0x3f8f4f), pot: std(0xb5653a),
};
const Box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const Cyl = (rt, rb, h, seg = 12) => new THREE.CylinderGeometry(rt, rb, h, seg);

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { c, g: c.getContext('2d'), tex, w, h };
}

function carpet() {
  const { c, g, tex } = canvas(256, 256);
  g.fillStyle = '#35404c'; g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#3c4856';
  for (let y = 0; y < 256; y += 32) for (let x = (y / 32) % 2 ? 0 : 32; x < 256; x += 64) g.fillRect(x, y, 32, 32);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(hw / 2, hd / 2);
  return tex;
}

function skyline() { // dusk city behind the south window
  const { c, g, tex } = canvas(1024, 256);
  const sky = g.createLinearGradient(0, 0, 0, 256);
  sky.addColorStop(0, '#2b5f86'); sky.addColorStop(0.7, '#7fc4d8'); sky.addColorStop(1, '#f0c890');
  g.fillStyle = sky; g.fillRect(0, 0, 1024, 256);
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let layer = 0; layer < 2; layer++) {
    for (let x = 0; x < 1024; x += 20 + rnd() * 30) {
      const w = 22 + rnd() * 40, h = 40 + rnd() * (layer ? 90 : 150);
      g.fillStyle = layer ? '#27455f' : '#1a3248';
      g.fillRect(x, 256 - h, w, h);
      g.fillStyle = '#ffd98a';
      for (let wy = 256 - h + 8; wy < 250; wy += 12) for (let wx = x + 4; wx < x + w - 4; wx += 9) if (rnd() > 0.6) g.fillRect(wx, wy, 4, 5);
    }
  }
  return tex;
}

export function buildMeetRoom(scene, camera) {
  const root = new THREE.Group();
  root.position.set(cx, 0, cz);
  scene.add(root);
  const P = new Parts(MAT);
  const obs = (lx, lz, w, d) => { const o = { x0: cx + lx - w / 2, x1: cx + lx + w / 2, z0: cz + lz - d / 2, z1: cz + lz + d / 2 }; OBSTACLES.push(o); return o; };

  // floor + approach
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(2 * hw, 2 * hd), new THREE.MeshStandardMaterial({ map: carpet(), roughness: 0.95 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = 0.05; floor.receiveShadow = true; floor.userData.walk = true;
  root.add(floor);
  const road = new THREE.Mesh(Box(4.6, 0.08, cz - hd - 48 + 1), MAT.path);
  road.position.set(0, 0.07, (48 + cz - hd) / 2); road.receiveShadow = true; road.userData.walk = true;
  scene.add(road);
  const plaza = new THREE.Mesh(Box(2 * hw + 6, 0.1, 8), std(0xd9d2c0));
  plaza.position.set(0, 0.06, cz - hd - 3); plaza.receiveShadow = true; plaza.userData.walk = true;
  scene.add(plaza);

  // walls: north has a 4 m door gap
  const T = 0.5, door = 2;
  const wallBox = (x, z, w, d, key = 'wall') => { P.add(key, Box(w, H, d), { p: [x, H / 2, z] }); obs(x, z, w, d); };
  wallBox(-(hw + door) / 2 - 0.0, -hd, hw - door, T); wallBox((hw + door) / 2, -hd, hw - door, T);
  P.add('wall', Box(2 * door, H - 3.6, T), { p: [0, 3.6 + (H - 3.6) / 2, -hd] });
  wallBox(0, hd, 2 * hw, T); wallBox(-hw, 0, T, 2 * hd); wallBox(hw, 0, T, 2 * hd);
  // inner green panelling with wooden posts and a gold rail
  for (const [x, z, w, d] of [[0, hd - T / 2 - 0.02, 2 * hw - 1, 0.05], [-hw + T / 2 + 0.02, 0, 0.05, 2 * hd - 1], [hw - T / 2 - 0.02, 0, 0.05, 2 * hd - 1]]) {
    P.add('green', Box(w, 3.2, d), { p: [x, 1.6, z] });
    P.add('trim', Box(w + (w > d ? 0 : 0.04), 0.08, d + (w > d ? 0.04 : 0)), { p: [x, 3.25, z] });
  }
  for (let k = -3; k <= 3; k++) {
    P.add('wood', Box(0.3, 4.4, 0.12), { p: [k * 5, 2.2, hd - T / 2 - 0.06] });
  }
  for (const s of [-1, 1]) for (let k = -2; k <= 2; k++) P.add('wood', Box(0.12, 4.4, 0.3), { p: [s * (hw - T / 2 - 0.06), 2.2, k * 4.5] });
  // wall sconces
  for (const [x, z, ry] of [[-6, hd - 0.4, 0], [6, hd - 0.4, 0]]) P.add('led', Box(0.2, 0.7, 0.1), { p: [x, 2.6, z], r: [0, ry, 0] });
  // ceiling LED frame
  P.add('led', Box(2 * hw - 6, 0.06, 0.2), { p: [0, H - 0.1, -hd / 2 + 1] });
  P.add('led', Box(2 * hw - 6, 0.06, 0.2), { p: [0, H - 0.1, hd / 2 - 1] });
  P.add('led', Box(0.2, 0.06, hd - 2), { p: [-(hw - 3), H - 0.1, 0] });
  P.add('led', Box(0.2, 0.06, hd - 2), { p: [hw - 3, H - 0.1, 0] });

  // table: white top on a dark base, dark centre strip for the hologram
  P.add('tableTop', Box(2 * TABLE.hl, 0.12, 2 * TABLE.hw), { p: [0, 0.82, 0] });
  P.add('tableDark', Box(2 * TABLE.hl - 1.2, 0.02, 0.5), { p: [0, 0.89, 0] });
  for (const x of [-5.5, 0, 5.5]) P.add('tableDark', Box(0.3, 0.76, 2.6), { p: [x, 0.38, 0] });
  obs(0, 0, 2 * TABLE.hl + 0.2, 2 * TABLE.hw + 0.2);

  // 20 chairs, each facing the table
  for (let i = 0; i < SEAT_COUNT; i++) {
    const s = seatPos(i), lx = s.x - cx, lz = s.z - cz, fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
    P.add('chairSeat', Box(0.6, 0.1, 0.6), { p: [lx, 0.5, lz], r: [0, s.yaw, 0] });
    P.add('chair', Box(0.6, 0.75, 0.09), { p: [lx - fx * 0.33, 0.95, lz - fz * 0.33], r: [0, s.yaw, 0] });
    P.add('metal', Cyl(0.05, 0.05, 0.42, 8), { p: [lx, 0.26, lz] });
    P.add('chair', Cyl(0.32, 0.32, 0.05, 10), { p: [lx, 0.05, lz] });
  }

  // plants in the corners
  for (const [x, z] of [[-hw + 1.4, -hd + 1.6], [hw - 1.4, -hd + 1.6], [-hw + 1.4, hd - 1.4], [hw - 1.4, hd - 1.4]]) {
    P.add('pot', Cyl(0.45, 0.35, 0.8, 10), { p: [x, 0.4, z] });
    P.add('plant', new THREE.IcosahedronGeometry(0.85, 0), { p: [x, 1.6, z] });
    obs(x, z, 1, 1);
  }
  root.add(P.build({ castShadow: true, receiveShadow: true }));

  // screen (east wall), whiteboard (west wall), skyline window (south wall)
  const screen = canvas(1280, 720), board = canvas(1600, 900), holo = canvas(512, 320);
  const flat = (cv, w, h, x, y, z, ry, basic = true) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), basic ? new THREE.MeshBasicMaterial({ map: cv.tex, toneMapped: false }) : new THREE.MeshStandardMaterial({ map: cv.tex }));
    m.position.set(x, y, z); m.rotation.y = ry; root.add(m);
    return m;
  };
  flat(screen, 10, 5.625, hw - T / 2 - 0.06, 3.3, 0, -Math.PI / 2);
  const frame = new THREE.Mesh(Box(0.03, 5.9, 10.3), MAT.black); frame.position.set(hw - T / 2 - 0.01, 3.3, 0); root.add(frame);
  flat(board, 8, 4.5, -hw + T / 2 + 0.06, 2.6, 0, Math.PI / 2);
  const bframe = new THREE.Mesh(Box(0.03, 4.7, 8.2), MAT.metal); bframe.position.set(-hw + T / 2 + 0.01, 2.6, 0); root.add(bframe);
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(2 * hw - 8, 3.2), new THREE.MeshBasicMaterial({ map: skyline() }));
  sky.position.set(0, 1.9, hd - T / 2 - 0.1); sky.rotation.y = Math.PI; root.add(sky);

  // hologram floating over the table; always turns its face to the camera
  const hm = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2), new THREE.MeshBasicMaterial({ map: holo.tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }));
  hm.position.set(0, 1.9, 0); root.add(hm);
  const base = new THREE.Mesh(Cyl(0.5, 0.6, 0.04, 20), new THREE.MeshBasicMaterial({ color: 0x66ddff, transparent: true, opacity: 0.6 }));
  base.position.set(0, 0.92, 0); root.add(base);

  // sliding door and the sign above it
  const leaf = (s) => { const m = new THREE.Mesh(Box(door, 3.6, 0.12), std(0x9fd0f0, { transparent: true, opacity: 0.55, roughness: 0.1 })); m.position.set(s * door / 2, 1.8, -hd); root.add(m); return m; };
  const leaves = [leaf(-1), leaf(1)];
  const doorObs = obs(0, -hd, 2 * door, 1.2);
  let open = 0, wantOpen = 0;
  const sign = canvas(1024, 160);
  sign.g.fillStyle = '#1f4f3f'; sign.g.fillRect(0, 0, 1024, 160);
  sign.g.strokeStyle = '#c9a24a'; sign.g.lineWidth = 10; sign.g.strokeRect(8, 8, 1008, 144);
  sign.g.fillStyle = '#fff'; sign.g.font = 'bold 84px system-ui, sans-serif'; sign.g.textAlign = 'center'; sign.g.textBaseline = 'middle';
  sign.g.fillText('PHÒNG HỌP ẢO', 512, 84); sign.tex.needsUpdate = true;
  const signM = new THREE.Mesh(new THREE.PlaneGeometry(8, 1.25), new THREE.MeshBasicMaterial({ map: sign.tex }));
  signM.position.set(0, H - 1.2, -hd - T / 2 - 0.05); signM.rotation.y = Math.PI; root.add(signM);

  // fluorescent fill so the interior is neutral white (the pagoda's sunset light does not reach it)
  for (const [x, z] of [[-8, -3], [8, -3], [0, 5]]) {
    const l = new THREE.PointLight(0xeaf3ff, 14, 40, 1.2);
    l.position.set(x, H - 1.5, z); root.add(l);
  }
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(2 * hw, 2 * hd), std(0xdde2e8));
  ceil.rotation.x = Math.PI / 2; ceil.position.y = H; root.add(ceil);

  return {
    root, screen, board, holo,
    contains: (x, z) => Math.abs(x - cx) < hw && Math.abs(z - cz) < hd,
    setDoor(v) { wantOpen = v ? 1 : 0; },
    update(dt) {
      open += (wantOpen - open) * (1 - Math.exp(-dt * 4));
      leaves[0].position.x = -door / 2 - open * door; leaves[1].position.x = door / 2 + open * door;
      Object.assign(doorObs, wantOpen ? { x0: 1e9, x1: 1e9 + 1, z0: 1e9, z1: 1e9 + 1 } : { x0: cx - door, x1: cx + door, z0: cz - hd - 0.6, z1: cz - hd + 0.6 });
      hm.rotation.y = Math.atan2(camera.position.x - (cx + hm.position.x), camera.position.z - (cz + hm.position.z));
      base.rotation.y += dt;
    },
  };
}
