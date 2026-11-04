import * as THREE from 'three';
import { label, makeBubble, BUBBLE_SECONDS } from './avatar.js';

// A four-legged dog facing +z, built as a joint hierarchy:
//   group -> model -> body (torso, chest, rump) -> neck -> head (skull, muzzle, jaw, ears, eyes) ; tail ; four legs (hip -> knee).
// Breeds change colours, proportions and ears; accessories are small extra meshes hung on the neck and head.

const { lerp } = THREE.MathUtils;
const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra });

/** `bonus` multiplies the matching stat: spd = move speed, sta = stamina, hp = health, bite = bite damage. */
export const BREEDS = [
  { id: 'ta', name: 'Chó Ta', lvl: 1, coat: 0xd9a857, dark: 0xa8743a, belly: 0xf1dfb6, ear: 'floppy', size: 1, leg: 1, body: 1, snout: 1, bonus: { hp: 1.05 }, desc: 'Giống chó bản địa nhanh nhẹn, khỏe mạnh.' },
  { id: 'corgi', name: 'Corgi', lvl: 3, coat: 0xe7943a, dark: 0xc4702a, belly: 0xffffff, ear: 'point', size: 0.95, leg: 0.62, body: 1.15, snout: 1, whiteChest: true, bonus: { sta: 1.15 }, desc: 'Chân ngắn mông to, bền sức.' },
  { id: 'shiba', name: 'Shiba', lvl: 5, coat: 0xe08b4a, dark: 0xb8602a, belly: 0xfaf0dc, ear: 'point', size: 0.98, leg: 0.9, body: 1, snout: 0.9, curl: true, whiteChest: true, bonus: { spd: 1.06 }, desc: 'Đuôi cuộn, chạy nhanh, rất kiêu.' },
  { id: 'husky', name: 'Husky', lvl: 8, coat: 0x8a929c, dark: 0x40464e, belly: 0xffffff, ear: 'point', size: 1.1, leg: 1.05, body: 1.05, snout: 1, mask: true, eye: 0x6ab8f0, bonus: { sta: 1.3 }, desc: 'Mắt xanh, sức bền phi thường.' },
  { id: 'pug', name: 'Pug', lvl: 11, coat: 0xe3c08a, dark: 0x2a2220, belly: 0xf0dcb0, ear: 'floppy', size: 0.85, leg: 0.75, body: 0.9, snout: 0.35, curl: true, darkFace: true, bonus: { hp: 1.1, spd: 0.92 }, desc: 'Mặt xệ đáng yêu, hơi lười chạy.' },
  { id: 'dal', name: 'Đốm (Dalmatian)', lvl: 14, coat: 0xf4f4f0, dark: 0x1f1f22, belly: 0xffffff, ear: 'floppy', size: 1.15, leg: 1.15, body: 1.05, snout: 1, spots: true, bonus: { spd: 1.1, sta: 1.1 }, desc: 'Đốm đen trắng, chạy cực nhanh.' },
  { id: 'gsd', name: 'Becgie', lvl: 18, coat: 0xc48a46, dark: 0x2a2018, belly: 0xd9b27a, ear: 'point', size: 1.25, leg: 1.1, body: 1.1, snout: 1.1, saddle: true, bonus: { bite: 1.5, hp: 1.2 }, desc: 'Chó nghiệp vụ, cắn khỏe, dạn dày.' },
];
export const breedOf = (id) => BREEDS.find((b) => b.id === id) || BREEDS[0];

export const ACCESSORIES = [
  { id: 'collar', name: 'Vòng cổ đỏ', price: 10 },
  { id: 'bell', name: 'Chuông nhỏ', price: 15 },
  { id: 'bow', name: 'Nơ hồng', price: 20 },
  { id: 'bandana', name: 'Khăn bandana', price: 25 },
  { id: 'glasses', name: 'Kính râm', price: 35 },
  { id: 'hat', name: 'Mũ dự tiệc', price: 40 },
  { id: 'cape', name: 'Áo choàng', price: 60 },
  { id: 'crown', name: 'Vương miện', price: 120 },
];

const DOG_SCALE = 1.3;
const NAME_Y = 1.5;
// Action name -> duration in seconds.
const ACTIONS = { bark: 0.8, sniff: 2.2, sniffbutt: 2.6, pee: 2.8, bite: 0.6, dig: 2.4, love: 5, eat: 2.6, shake: 1.2 };
export const DOG_ACTIONS = Object.keys(ACTIONS);

export class DogAvatar {
  constructor(name, look = {}, scale = 1) {
    this.group = new THREE.Group();
    this.scale = scale;
    this.look = { breed: 'ta', acc: [], ...look };
    this.action = null;
    this.t = 0;
    this.clock = Math.random() * 10;
    this.ph = 0; // gait phase
    this.amp = 0; // eased gait strength
    this.gait = 1; // 1 walk, 2 run
    this.swim = false;
    this.air = 0; // vertical speed while jumping, 0 on the ground
    this.lay = ''; // '' standing, 'sleep', 'sit'
    this.layAmt = 0;
    this.sitAmt = 0;
    this.wagT = 0;
    this.carried = null;
    this.bubble = null;
    this.build();
    this.nameSprite = label(name);
    this.nameSprite.position.y = NAME_Y * this.scale;
    this.group.add(this.nameSprite);
    this.zzz = label('💤');
    this.zzz.visible = false;
    this.zzz.scale.set(1.2, 0.3, 1);
    this.group.add(this.zzz);
  }

  setLook(look) {
    this.look = { ...this.look, ...look };
    this.build();
  }

  // ---------- model ----------

  build() {
    if (this.model) {
      this.group.remove(this.model);
      this.model.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    }
    const b = breedOf(this.look.breed), acc = new Set(this.look.acc || []);
    const coat = mat(b.coat), dark = mat(b.dark), belly = mat(b.belly), black = mat(0x1a1412), pink = mat(0xe8837c), white = mat(0xffffff);
    const L = b.leg, bl = b.body;
    const part = (parent, geo, m, x = 0, y = 0, z = 0) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      parent.add(mesh);
      return mesh;
    };
    const joint = (parent, x = 0, y = 0, z = 0) => {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      parent.add(g);
      return g;
    };
    const sph = (r, w = 14, h = 10) => new THREE.SphereGeometry(r, w, h);

    this.model = joint(this.group);
    this.model.scale.setScalar(DOG_SCALE * b.size * this.scale);
    this.baseY = 0.45 * L + 0.07;
    this.body = joint(this.model, 0, this.baseY, 0);

    // torso: a capsule lying along z, plus chest and rump spheres and a lighter belly
    const torso = part(this.body, new THREE.CapsuleGeometry(0.17, 0.36 * bl, 6, 14), coat);
    torso.rotation.x = Math.PI / 2;
    part(this.body, sph(0.2), coat, 0, 0.01, 0.2 * bl).scale.set(0.95, 1.05, 1);
    part(this.body, sph(0.19), coat, 0, 0, -0.2 * bl);
    part(this.body, sph(0.15), belly, 0, -0.08, 0).scale.set(0.9, 0.55, 1.7 * bl);
    if (b.whiteChest) part(this.body, sph(0.17), white, 0, -0.04, 0.22 * bl).scale.set(0.9, 0.9, 0.8);
    if (b.saddle) part(this.body, sph(0.2), dark, 0, 0.08, -0.02).scale.set(0.9, 0.55, 1.6 * bl);
    if (b.spots) {
      for (let i = 0; i < 16; i++) {
        const a = -0.2 + Math.random() * 3.5, z = (Math.random() - 0.5) * 0.65 * bl;
        part(this.body, sph(0.035 + Math.random() * 0.02, 8, 6), dark, Math.cos(a) * 0.175, Math.sin(a) * 0.175, z).scale.set(0.5, 1, 1);
      }
    }

    // neck and head
    this.neck = joint(this.body, 0, 0.1, 0.27 * bl);
    part(this.neck, new THREE.CylinderGeometry(0.1, 0.13, 0.26, 12), coat, 0, 0.1, 0.03).rotation.x = 0.55;
    this.head = joint(this.neck, 0, 0.22, 0.12);
    const sn = b.snout;
    const skull = part(this.head, sph(0.17, 16, 12), b.darkFace ? dark : coat);
    skull.scale.set(1, 0.95, 1.02);
    if (b.mask) part(this.head, new THREE.SphereGeometry(0.172, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.45), dark, 0, 0.005, 0);
    part(this.head, sph(0.1), b.mask || b.whiteChest ? white : (b.darkFace ? dark : belly), 0, -0.06, 0.12 * sn + 0.05).scale.set(0.95, 0.75, 1.15 * sn + 0.2);
    part(this.head, sph(0.045, 10, 8), black, 0, -0.01 - (sn < 0.5 ? 0.01 : 0), 0.14 + 0.2 * sn).scale.set(1, 0.8, 0.8);
    this.jaw = joint(this.head, 0, -0.095, 0.06);
    part(this.jaw, new THREE.BoxGeometry(0.1, 0.03, 0.13 * sn + 0.06), b.darkFace ? dark : belly, 0, 0, 0.08 * sn + 0.03);
    this.tongue = part(this.jaw, new THREE.BoxGeometry(0.05, 0.012, 0.11), pink, 0, 0.018, 0.1 * sn + 0.03);
    this.tongue.visible = false;
    this.mouth = joint(this.head, 0, -0.1, 0.22 * sn + 0.08); // where a carried ball sits
    this.eyes = [-1, 1].map((s) => {
      const e = part(this.head, sph(0.032, 10, 8), b.eye ? mat(b.eye) : black, s * 0.075, 0.05, 0.135);
      e.scale.set(1, 1.15, 0.7);
      part(this.head, sph(0.01, 6, 5), white, s * 0.08, 0.065, 0.16);
      return e;
    });
    for (const s of [-1, 1]) {
      if (b.ear === 'floppy') {
        const ear = part(this.head, sph(0.1), dark, s * 0.14, 0.07, -0.03);
        ear.scale.set(0.35, 1.2, 0.75);
        ear.rotation.z = s * 0.35;
      } else {
        const ear = part(this.head, new THREE.ConeGeometry(0.075, 0.2, 4), b.mask ? dark : coat, s * 0.095, 0.2, -0.03);
        ear.rotation.z = -s * 0.2;
        part(this.head, new THREE.ConeGeometry(0.04, 0.12, 4), pink, s * 0.095, 0.19, -0.01).rotation.z = -s * 0.2;
      }
    }

    // tail
    this.tail = joint(this.body, 0, 0.1, -0.31 * bl);
    if (b.curl) {
      part(this.tail, new THREE.TorusGeometry(0.1, 0.035, 8, 14, Math.PI * 1.5), coat, 0, 0.1, 0).rotation.y = Math.PI / 2;
    } else {
      const seg = part(this.tail, new THREE.CylinderGeometry(0.022, 0.04, 0.36, 8), coat, 0, 0.144, -0.108);
      seg.rotation.x = -0.65;
      part(this.tail, sph(0.032, 8, 6), b.belly === 0xffffff ? white : dark, 0, 0.29, -0.22);
    }

    // legs: hip -> knee; the first two are the front pair
    this.legs = [];
    const lw = 0.115, lz = [0.22 * bl, -0.21 * bl];
    for (const [i, z] of lz.entries()) {
      for (const s of [-1, 1]) {
        const hip = joint(this.body, s * lw, -0.06, z);
        part(hip, new THREE.CylinderGeometry(0.062, 0.048, 0.23 * L, 8), i ? dark : coat, 0, -0.115 * L, 0);
        const knee = joint(hip, 0, -0.23 * L, 0);
        part(knee, new THREE.CylinderGeometry(0.046, 0.038, 0.22 * L, 8), coat, 0, -0.11 * L, 0);
        part(knee, sph(0.06, 10, 8), b.whiteChest || b.mask ? white : coat, 0, -0.22 * L, 0.025).scale.set(0.9, 0.7, 1.35);
        this.legs.push({ side: s, front: i === 0, hip, knee });
      }
    }

    // accessories
    const red = mat(0xd9453a), gold = mat(0xf2c230, { metalness: 0.4, roughness: 0.4 });
    if (acc.has('collar') || acc.has('bell')) {
      part(this.neck, new THREE.TorusGeometry(0.115, 0.022, 8, 18), red, 0, 0.05, 0.03).rotation.x = Math.PI / 2 - 0.5;
      if (acc.has('bell')) part(this.neck, sph(0.03, 8, 6), gold, 0, -0.04, 0.13);
    }
    if (acc.has('bandana')) {
      const t = part(this.neck, new THREE.ConeGeometry(0.13, 0.2, 3), mat(0x3f78c4), 0, -0.03, 0.1);
      t.rotation.set(Math.PI - 0.3, 0, 0);
      part(this.neck, new THREE.TorusGeometry(0.125, 0.02, 8, 18), mat(0x3f78c4), 0, 0.06, 0.03).rotation.x = Math.PI / 2 - 0.5;
    }
    if (acc.has('bow')) {
      for (const s of [-1, 1]) part(this.head, new THREE.ConeGeometry(0.05, 0.1, 6), mat(0xf27aa8), s * 0.1, 0.21, 0.04).rotation.z = s * -Math.PI / 2;
      part(this.head, sph(0.03, 8, 6), mat(0xd9528a), 0.0, 0.21, 0.04);
    }
    if (acc.has('glasses')) {
      for (const s of [-1, 1]) part(this.head, new THREE.CylinderGeometry(0.05, 0.05, 0.015, 14), black, s * 0.075, 0.055, 0.165).rotation.x = Math.PI / 2;
      part(this.head, new THREE.BoxGeometry(0.1, 0.012, 0.012), black, 0, 0.06, 0.165);
    }
    if (acc.has('hat')) {
      part(this.head, new THREE.ConeGeometry(0.09, 0.22, 10), mat(0x8a4fd8), 0, 0.3, -0.02).rotation.x = -0.15;
      part(this.head, sph(0.025, 6, 5), mat(0xf2c230), 0, 0.42, -0.05);
    }
    if (acc.has('cape')) {
      const c = part(this.body, new THREE.BoxGeometry(0.36, 0.02, 0.5 * bl), mat(0xc03030, { side: THREE.DoubleSide }), 0, 0.17, -0.1);
      c.rotation.x = 0.1;
      part(this.body, sph(0.03, 8, 6), gold, 0, 0.19, 0.15 * bl);
    }
    if (acc.has('crown')) {
      part(this.head, new THREE.CylinderGeometry(0.075, 0.085, 0.06, 12), gold, 0, 0.2, -0.02);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        part(this.head, new THREE.ConeGeometry(0.02, 0.07, 4), gold, Math.cos(a) * 0.08, 0.26, -0.02 + Math.sin(a) * 0.08);
      }
    }
    this.group.add(this.model);
    if (this.carried) this.mouth.add(this.carried);
  }

  // ---------- name tag, speech bubble ----------

  setName(name) {
    const y = this.nameSprite.position.y;
    this.group.remove(this.nameSprite);
    this.nameSprite.material.map.dispose();
    this.nameSprite = label(name);
    this.nameSprite.position.y = y;
    this.group.add(this.nameSprite);
  }

  say(text, seconds = BUBBLE_SECONDS) {
    this.clearBubble();
    this.bubble = makeBubble(text);
    this.bubble.position.y = this.nameSprite.position.y + 0.32;
    this.bubbleT = seconds;
    this.group.add(this.bubble);
  }

  clearBubble() {
    if (!this.bubble) return;
    this.group.remove(this.bubble);
    this.bubble.material.map.dispose();
    this.bubble.material.dispose();
    this.bubble = null;
  }

  setSeated() {} // the human API; dogs lie down with setLay instead
  setPose() {}
  setLay(mode) { this.lay = mode || ''; }
  wag(seconds = 3) { this.wagT = seconds; }

  /** Holds a mesh (a ball) in the mouth, or nothing. */
  setCarry(obj) {
    if (this.carried) this.mouth.remove(this.carried);
    this.carried = obj;
    if (obj) { obj.position.set(0, -0.02, 0.04); this.mouth.add(obj); }
  }

  /** Starts an action by name. Returns false if one is already playing (unless forced). */
  play(a, force = false) {
    if (!(a in ACTIONS) || (this.action && !force)) return false;
    this.action = a;
    this.t = 0;
    return true;
  }

  get busy() { return !!this.action; }

  // ---------- animation ----------

  update(dt, moving) {
    const k = 1 - Math.exp(-dt * 10);
    this.clock += dt;
    if (this.bubble) {
      this.bubbleT -= dt;
      if (this.bubbleT <= 0) this.clearBubble();
      else {
        this.bubble.material.opacity = Math.min(1, this.bubbleT);
        this.bubble.position.y = this.nameSprite.position.y + 0.32;
      }
    }
    const a = this.action, c = this.clock;
    let at = 0;
    if (a) {
      at = this.t += dt;
      if (at >= ACTIONS[a]) { this.action = null; this.t = 0; }
    }
    const sleeping = this.lay === 'sleep';
    this.layAmt += ((sleeping ? 1 : 0) - this.layAmt) * k;
    this.sitAmt += ((this.lay === 'sit' ? 1 : 0) - this.sitAmt) * k;
    const down = Math.max(this.layAmt, this.sitAmt);
    const go = moving && !down && !this.air;
    this.amp += ((go ? (this.swim ? 0.7 : this.gait === 2 ? 1 : 0.55) : 0) - this.amp) * k;
    this.ph += dt * (this.swim ? 8 : this.gait === 2 ? 13 : 9) * (go ? 1 : 0);
    const ph = this.ph, amp = this.amp, run = this.gait === 2 && !this.swim;
    this.wagT = Math.max(0, this.wagT - dt);

    // reset the pose, then layer the movement, resting pose and action on top
    const body = this.body;
    body.position.set(0, this.baseY, 0);
    body.rotation.set(0, 0, 0);
    this.neck.rotation.set(0, 0, 0);
    this.head.rotation.set(0, 0, 0);
    this.tail.rotation.set(0, 0, 0);
    this.jaw.rotation.x = 0;
    this.model.rotation.y = 0;
    this.tongue.visible = (run && amp > 0.5) || this.swim;

    // legs: diagonal pairs walking, paired bounding when running, paddling in water
    this.legs.forEach((l, i) => {
      const left = l.side < 0 ? 0 : 1, front = l.front;
      const off = run ? (front ? 0 : 1.5) + left * 0.35 : (left ^ (front ? 0 : 1)) * Math.PI;
      const sw = Math.sin(ph + off);
      l.hip.rotation.set(sw * (run ? 0.95 : 0.55) * amp, 0, 0);
      l.knee.rotation.set(Math.max(0, Math.sin(ph + off + 1.4)) * (run ? 1.3 : 0.8) * amp, 0, 0);
      if (this.swim) { l.hip.rotation.x = Math.sin(ph + off) * 0.8; l.knee.rotation.x = 0.5; }
    });
    if (run) {
      body.position.y += Math.abs(Math.sin(ph + 0.8)) * 0.08 * amp;
      body.rotation.x = Math.sin(ph + 0.4) * 0.12 * amp;
    } else if (amp > 0.05) {
      body.position.y += Math.abs(Math.sin(ph)) * 0.015 * amp;
      body.rotation.z = Math.sin(ph) * 0.03 * amp;
    }
    if (this.swim) { body.position.y -= 0.16; body.rotation.x = -0.15; this.neck.rotation.x = -0.35; }

    // jump: front legs tuck up while rising, stretch out while falling
    if (this.air) {
      const rise = THREE.MathUtils.clamp(this.air / 7, -1, 1);
      body.rotation.x = -0.35 * rise;
      for (const l of this.legs) {
        l.hip.rotation.x = l.front ? -0.9 * rise - 0.2 : 0.9 * rise + 0.3;
        l.knee.rotation.x = 0.9 * rise + 0.3;
      }
    }

    // breathing and idle head movement
    if (!go && !this.air) {
      body.scale.y = 1 + Math.sin(c * 2.2) * 0.015;
      this.head.rotation.y = Math.sin(c * 0.7) * 0.15 * (1 - down);
      this.head.rotation.x = Math.sin(c * 0.5 + 1) * 0.05 * (1 - down);
      this.tongue.visible = this.tongue.visible || (!down && Math.sin(c * 0.3) > 0.7);
    } else body.scale.y = 1;

    // sit: hind legs fold, chest up
    if (this.sitAmt > 0.01) {
      const s = this.sitAmt;
      body.rotation.x = lerp(body.rotation.x, -0.65, s);
      body.position.y = lerp(body.position.y, this.baseY * 0.7, s);
      this.neck.rotation.x = 0.3 * s;
      for (const l of this.legs) {
        if (l.front) { l.hip.rotation.x = lerp(l.hip.rotation.x, 0.5, s); l.knee.rotation.x = lerp(l.knee.rotation.x, 0, s); }
        else { l.hip.rotation.x = lerp(l.hip.rotation.x, -1.3, s); l.knee.rotation.x = lerp(l.knee.rotation.x, 2.3, s); }
      }
    }
    // sleep: belly on the ground, legs tucked, head resting on the front paws
    if (this.layAmt > 0.01) {
      const s = this.layAmt;
      body.position.y = lerp(body.position.y, 0.17, s);
      body.rotation.z = lerp(body.rotation.z, 0.12, s);
      this.neck.rotation.x = 0.7 * s;
      this.head.rotation.y = lerp(this.head.rotation.y, 0.5, s);
      this.model.rotation.y = 0;
      for (const l of this.legs) {
        l.hip.rotation.x = lerp(l.hip.rotation.x, l.front ? -1.35 : -1.0, s);
        l.hip.rotation.z = l.side * 0.35 * s * (l.front ? 0.2 : 1);
        l.knee.rotation.x = lerp(l.knee.rotation.x, l.front ? 1.3 : 2.2, s);
      }
      body.scale.y = 1 + Math.sin(c * 1.6) * 0.03;
    } else for (const l of this.legs) l.hip.rotation.z = 0;
    for (const e of this.eyes) e.scale.y = lerp(1.15, 0.1, this.layAmt);
    this.zzz.visible = this.layAmt > 0.6;
    if (this.zzz.visible) this.zzz.position.set(0.4, NAME_Y * this.scale * 0.55 + 0.1 * Math.sin(c * 2), 0);

    // actions
    let jaw = this.tongue.visible ? 0.15 : 0;
    if (a) {
      const u = at / ACTIONS[a];
      switch (a) {
        case 'bark': {
          const p = Math.abs(Math.sin(at * Math.PI / 0.4));
          this.head.rotation.x = -0.4 * p;
          this.neck.rotation.x = -0.25 * p;
          body.rotation.x -= 0.12 * p;
          jaw = 0.65 * p;
          break;
        }
        case 'sniff':
          this.neck.rotation.x = 1.0;
          this.head.rotation.x = 0.25 + Math.sin(at * 14) * 0.06;
          body.position.y -= 0.03;
          this.legs.forEach((l) => { if (l.front && l.side > 0) l.hip.rotation.x = -0.15; });
          break;
        case 'sniffbutt':
          this.neck.rotation.x = 0.65;
          this.head.rotation.x = 0.2 + Math.sin(at * 14) * 0.05;
          this.head.rotation.y = Math.sin(at * 3) * 0.3;
          break;
        case 'pee': {
          const lift = Math.min(1, at / 0.4) * Math.min(1, (ACTIONS.pee - at) / 0.4);
          const leg = this.legs[3]; // rear leg on the +x side
          leg.hip.rotation.z = 1.05 * lift;
          leg.hip.rotation.x = -0.2 * lift;
          leg.knee.rotation.x = 0.6 * lift;
          body.rotation.z = -0.1 * lift;
          this.head.rotation.y = 0.5 * lift;
          this.tail.rotation.x = 0.3 * lift;
          break;
        }
        case 'bite': {
          const p = Math.sin(u * Math.PI);
          body.position.z = 0.28 * p;
          body.position.y -= 0.03 * p;
          body.rotation.x += 0.2 * p;
          this.head.rotation.x = 0.25 * p;
          jaw = 0.85 * (u < 0.5 ? u / 0.5 : Math.max(0, 1 - (u - 0.5) / 0.15));
          break;
        }
        case 'dig': {
          body.rotation.x = 0.3;
          body.position.y -= 0.05;
          this.neck.rotation.x = 0.6;
          for (const l of this.legs) {
            if (!l.front) continue;
            const s = Math.sin(at * 17 + (l.side > 0 ? Math.PI : 0));
            l.hip.rotation.x = -0.5 + s * 0.7;
            l.knee.rotation.x = 0.5 + Math.max(0, s) * 0.8;
          }
          body.position.x += Math.sin(at * 17) * 0.015;
          break;
        }
        case 'love': {
          const p = Math.abs(Math.sin(at * 5));
          body.position.y += 0.07 * p;
          this.head.rotation.x = -0.25;
          this.head.rotation.z = Math.sin(at * 3) * 0.25;
          break;
        }
        case 'eat': {
          this.neck.rotation.x = 0.95;
          this.head.rotation.x = 0.35;
          jaw = 0.4 * Math.abs(Math.sin(at * 11));
          break;
        }
        case 'shake':
          this.model.rotation.y = Math.sin(at * 38) * 0.4 * (1 - u);
          break;
      }
    }
    this.jaw.rotation.x = jaw;

    // tail: gentle sway at rest, fast wag when happy (manual wag) or running
    const fast = this.wagT > 0 || a === 'sniffbutt' || a === 'love' || a === 'eat';
    const wagging = fast || (!sleeping && (amp > 0.2 || !down));
    this.tail.rotation.y = sleeping ? 0.4 : wagging ? Math.sin(c * (fast ? 20 : run ? 10 : 3.2)) * (fast ? 0.7 : 0.25) : 0;
    if (sleeping) this.tail.rotation.x = 0.5;
    else if (run && a !== 'pee') this.tail.rotation.x = -0.3;
    if (this.carried) this.carried.rotation.y += dt * 2;
  }
}
