import * as THREE from 'three';

const { lerp } = THREE.MathUtils;
const flat = (color) => new THREE.MeshStandardMaterial({ color, flatShading: false, roughness: 0.8 });

export function label(text) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = '28px system-ui, sans-serif';
  g.textAlign = 'center';
  const w = g.measureText(text).width;
  g.fillStyle = 'rgba(0,0,0,.45)';
  g.beginPath(); g.roundRect(128 - w / 2 - 12, 12, w + 24, 42, 21); g.fill();
  g.fillStyle = '#fff';
  g.fillText(text, 128, 43);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(2.4, 0.6, 1);
  s.position.y = 2.5;
  s.renderOrder = 10;
  return s;
}

// Horizontal black/white bands for striped prison uniforms.
let stripeMat;
function stripeMaterial() {
  if (stripeMat) return stripeMat;
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  g.fillStyle = '#f4f4f4'; g.fillRect(0, 0, 32, 32);
  g.fillStyle = '#1c1c1c'; g.fillRect(0, 0, 32, 16);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 3);
  t.colorSpace = THREE.SRGBColorSpace;
  return (stripeMat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 }));
}

// Small white prisoner-number tag pinned to the chest.
function numberTag(n) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 40;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, 64, 40);
  g.fillStyle = '#222'; g.font = 'bold 26px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(String(n).padStart(3, '0'), 32, 22);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 });
}

// Fur colours per animal: two variants chosen by `hue` (coat, darker patches).
const FUR = {
  dog: [{ coat: 0xdcab62, dark: 0xa8743a }, { coat: 0x4a3a30, dark: 0x2a1c14 }],
  cat: [{ coat: 0xe58a3c, dark: 0xb2561c }, { coat: 0x9aa0a8, dark: 0x646a72 }],
};
const HAIR = [0x6a3d1e, 0x2a1c14, 0xc4c4c4, 0xe0443c, 0xe8c070, 0x8a5a2a];
const SKINS = [0xf0c8a0, 0xe6b48a, 0xd9a273];

export const BUBBLE_SECONDS = 15;

/** Speech bubble texture: word-wrapped text (max 4 lines) in a rounded box with a small tail. */
export function makeBubble(text) {
  const font = '30px system-ui, sans-serif', maxW = 420, pad = 22, lineH = 38, tail = 18;
  const c = document.createElement('canvas');
  let g = c.getContext('2d');
  g.font = font;
  const lines = [];
  let line = '';
  for (const ch of [...text]) {
    const t = line + ch;
    if (g.measureText(t).width > maxW && line) {
      const sp = line.lastIndexOf(' ');
      if (sp > 0 && ch !== ' ') { lines.push(line.slice(0, sp)); line = line.slice(sp + 1) + ch; }
      else { lines.push(line); line = ch.trim() ? ch : ''; }
    } else line = t;
  }
  if (line) lines.push(line);
  if (lines.length > 4) { lines.length = 4; lines[3] = lines[3].replace(/.$/, '') + '…'; }
  const w = Math.ceil(Math.max(...lines.map((l) => g.measureText(l).width))) + pad * 2;
  const h = lines.length * lineH + pad * 2;
  c.width = w + 6; c.height = h + tail + 6;
  g = c.getContext('2d'); // resizing the canvas reset the context
  g.font = font;
  g.fillStyle = 'rgba(255,255,255,0.96)';
  g.strokeStyle = 'rgba(60,40,20,0.5)';
  g.lineWidth = 3;
  g.beginPath(); g.roundRect(3, 3, w, h, 20); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(w / 2 - 12, h + 2); g.lineTo(w / 2, h + tail); g.lineTo(w / 2 + 12, h + 2); g.closePath(); g.fill();
  g.fillStyle = '#2a1c14';
  g.textBaseline = 'middle';
  lines.forEach((l, i) => g.fillText(l, 3 + pad, 3 + pad + lineH * (i + 0.5)));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.center.set(0.5, 0); // anchor at the tail so the bubble grows upward
  s.scale.set(c.width / 150, c.height / 150, 1);
  s.renderOrder = 11;
  return s;
}

const HIP_Y = 0.95; // standing hip height
const KNEEL_Y = 0.26; // hip height when kneeling on the heels

/**
 * Low-poly figure facing +z, built as a joint hierarchy:
 * hips -> upper (torso -> neck -> head, shoulders -> upper arm -> elbow -> forearm/sleeve -> hand)
 *      -> two legs (hip -> thigh -> knee -> shin -> foot).
 *
 * kind:
 *  'laity'   Phật tử in brown clothes (áo nâu, quần nâu) with dark hair; `hue` varies shade and hairstyle.
 *  'sweeper' young monk (sư tiểu): shaved head, smaller, carries a broom.
 *  'abbot'   head monk (trụ trì): shaved head, golden robe with a red kasaya, kneels chanting at a wooden fish (mõ).
 *  'prisoner' / 'striped' / 'guard'  cartoon-proportioned (big head) prison residents: orange jumpsuit, black-and-white
 *            stripes, blue guard uniform with cap. `hue` picks hair colour and skin tone.
 */
export class Avatar {
  constructor(hue, name, kind = 'laity') {
    this.kind = kind;
    this.group = new THREE.Group();

    let shirtC, pantsC;
    if (kind === 'sweeper' || kind === 'dog' || kind === 'cat') { shirtC = new THREE.Color().setHSL(0.1, 0.5, 0.45); pantsC = new THREE.Color().setHSL(0.09, 0.45, 0.28); this.group.scale.setScalar(0.88); }
    else if (kind === 'abbot') { shirtC = new THREE.Color().setHSL(0.12, 0.65, 0.5); pantsC = new THREE.Color().setHSL(0.1, 0.5, 0.3); }
    else if (kind === 'prisoner') { shirtC = new THREE.Color(0xf28c1e); pantsC = new THREE.Color(0xe07a10); }
    else if (kind === 'striped') { shirtC = new THREE.Color(0xffffff); pantsC = new THREE.Color(0xffffff); }
    else if (kind === 'guard') { shirtC = new THREE.Color(0x2f6fc4); pantsC = new THREE.Color(0x24508f); }
    else {
      const l = 0.2 + 0.06 * hue; // dark earthy brown: lighting lifts it considerably
      shirtC = new THREE.Color().setHSL(0.065, 0.5, l + 0.03);
      pantsC = new THREE.Color().setHSL(0.065, 0.45, l - 0.06);
    }
    const chibi = kind === 'prisoner' || kind === 'striped' || kind === 'guard';
    const robe = kind === 'striped' ? stripeMaterial() : flat(shirtC);
    const robeDark = kind === 'striped' ? stripeMaterial() : flat(pantsC);
    const kasaya = flat(0x9a2e1c);
    const animal = kind === 'dog' || kind === 'cat';
    const skin = flat(animal ? FUR[kind][Math.floor(hue * 2) % 2].coat : chibi ? SKINS[Math.floor(hue * 7) % SKINS.length] : 0xf0c8a0);
    const dark = flat(0x2a1c14);
    const cream = flat(0xf3ead2);
    const beadMat = flat(0x6b3d1e);
    const sandal = flat(0x4e2518);
    const monk = kind === 'sweeper' || kind === 'abbot' || animal; // animals wear the little monk's tunic and collar
    const hairM = chibi ? flat(HAIR[Math.floor(hue * HAIR.length) % HAIR.length]) : dark;

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

    this.hips = joint(this.group, 0, HIP_Y, 0);
    this.upper = joint(this.hips); // pivots at the waist for bowing

    // Torso, collar, belt, tunic skirt
    part(this.upper, new THREE.CylinderGeometry(0.27, 0.3, 0.66, 16), robe, 0, 0.33, 0);
    if (monk) {
      for (const s of [-1, 1]) {
        const lapel = part(this.upper, new THREE.BoxGeometry(0.05, 0.34, 0.03), cream, s * 0.07, 0.5, 0.265);
        lapel.rotation.z = s * 0.35;
      }
    } else if (kind === 'laity') {
      part(this.upper, new THREE.TorusGeometry(0.1, 0.03, 8, 16), robeDark, 0, 0.64, 0).rotation.x = Math.PI / 2; // round collar
    }
    part(this.hips, new THREE.CylinderGeometry(0.315, 0.315, 0.09, 18), robeDark, 0, 0.02, 0);
    this.skirt = part(this.hips, new THREE.CylinderGeometry(0.3, 0.4, 0.56, 18), robe, 0, -0.26, 0);

    if (kind === 'abbot') { // kasaya draped over one shoulder, with a hem band
      part(this.upper, new THREE.CylinderGeometry(0.288, 0.321, 0.67, 16, 1, false, 0, Math.PI), kasaya, 0, 0.33, 0);
      part(this.hips, new THREE.CylinderGeometry(0.44, 0.45, 0.1, 18), kasaya, 0, -0.5, 0);
    }

    // Neck, beads, head
    part(this.upper, new THREE.CylinderGeometry(0.075, 0.09, 0.14, 14), skin, 0, 0.7, 0);
    const beads = part(this.upper, new THREE.TorusGeometry(0.17, 0.028, 8, 20), beadMat, 0, 0.62, 0.04);
    beads.rotation.x = Math.PI / 2 + 0.25;
    this.head = joint(this.upper, 0, 0.9, 0);
    if (animal) {
      // Animal head: fur skull, muzzle, nose, ears (floppy for dogs, pointed for cats), big eyes, whiskers for cats
      const cat = kind === 'cat';
      const furDark = flat(FUR[kind][Math.floor(hue * 2) % 2].dark);
      const muzzleM = flat(0xf6ecd8), noseM = flat(cat ? 0xf29aa4 : 0x1d1512), eyeM = flat(0x1d1512);
      const skull = part(this.head, new THREE.IcosahedronGeometry(0.24, 3), skin);
      skull.scale.set(cat ? 1.08 : 1, cat ? 0.95 : 1, 0.98);
      part(this.head, new THREE.SphereGeometry(cat ? 0.075 : 0.115, 16, 12), muzzleM, 0, -0.07, 0.2).scale.set(1, 0.8, cat ? 1 : 1.25);
      part(this.head, new THREE.SphereGeometry(cat ? 0.028 : 0.045, 10, 8), noseM, 0, cat ? -0.04 : -0.03, cat ? 0.265 : 0.33);
      for (const s of [-1, 1]) {
        part(this.head, new THREE.SphereGeometry(0.04, 12, 10), cat ? flat(0x7ad66a) : eyeM, s * 0.085, 0.05, 0.2).scale.set(1, 1.15, 0.6);
        if (cat) {
          part(this.head, new THREE.BoxGeometry(0.014, 0.05, 0.01), eyeM, s * 0.085, 0.05, 0.228); // slit pupil
          part(this.head, new THREE.ConeGeometry(0.1, 0.22, 4), skin, s * 0.14, 0.23, -0.01).rotation.z = -s * 0.25; // pointed ears
          part(this.head, new THREE.ConeGeometry(0.055, 0.13, 4), flat(0xf3b6bd), s * 0.14, 0.22, 0.03).rotation.z = -s * 0.25;
          for (const k of [-1, 0, 1]) { // whiskers
            const w = part(this.head, new THREE.BoxGeometry(0.2, 0.004, 0.004), muzzleM, s * 0.17, -0.08 + k * 0.025, 0.2);
            w.rotation.z = s * k * 0.12;
          }
        } else {
          const ear = part(this.head, new THREE.SphereGeometry(0.1, 12, 10), furDark, s * 0.2, 0.06, -0.02); // floppy ears
          ear.scale.set(0.45, 1.25, 0.8);
          ear.rotation.z = s * 0.3;
          part(this.head, new THREE.SphereGeometry(0.014, 6, 5), muzzleM, s * 0.085, 0.1, 0.2); // brow spot
        }
      }
      if (cat) for (const x of [-0.05, 0, 0.05]) part(this.head, new THREE.BoxGeometry(0.014, 0.07, 0.01), furDark, x, 0.2, 0.17).rotation.x = -0.5; // tabby stripes
      this.mouth = part(this.head, new THREE.BoxGeometry(0.06, 0.014, 0.02), flat(0x6a3a30), 0, -0.13, cat ? 0.215 : 0.29);
      this.head.scale.setScalar(1.25);
      this.group.scale.setScalar(0.82);
      // tail
      this.tail = joint(this.hips, 0, 0.02, -0.28);
      if (cat) {
        part(this.tail, new THREE.CylinderGeometry(0.035, 0.05, 0.5, 10), skin, 0, 0.25, 0);
        const tip = joint(this.tail, 0, 0.5, 0);
        part(tip, new THREE.CylinderGeometry(0.03, 0.035, 0.45, 10), skin, 0, 0.22, 0);
        part(tip, new THREE.SphereGeometry(0.032, 8, 6), furDark, 0, 0.45, 0);
        tip.rotation.x = 0.7;
        this.tail.rotation.x = -0.45;
      } else {
        part(this.tail, new THREE.CylinderGeometry(0.03, 0.055, 0.5, 10), skin, 0, 0.25, 0);
        part(this.tail, new THREE.SphereGeometry(0.04, 8, 6), furDark, 0, 0.5, 0);
        this.tail.rotation.x = -0.6;
      }
    } else {
      const skull = part(this.head, new THREE.IcosahedronGeometry(0.22, 3), skin);
      skull.scale.set(0.95, 1.1, 1);
      for (const s of [-1, 1]) {
        part(this.head, new THREE.BoxGeometry(0.03, 0.09, 0.06), skin, s * 0.21, -0.01, 0); // ears
        part(this.head, new THREE.BoxGeometry(0.045, 0.045, 0.02), dark, s * 0.085, 0.03, 0.205); // eyes
        const brow = part(this.head, new THREE.BoxGeometry(0.08, 0.02, 0.02), dark, s * 0.085, 0.09, 0.2);
        brow.rotation.z = s * 0.15;
      }
      part(this.head, new THREE.ConeGeometry(0.03, 0.07, 10), skin, 0, -0.03, 0.225).rotation.x = Math.PI / 2;
      this.mouth = part(this.head, new THREE.BoxGeometry(0.07, 0.016, 0.02), flat(0xa8554a), 0, -0.1, 0.19);
      if (!monk) {
        const hair = part(this.head, new THREE.SphereGeometry(0.235, 14,12, 0, Math.PI * 2, 0, Math.PI * 0.55), hairM, 0, 0.02, -0.02);
        hair.scale.y = 1.1;
        if (hue >= 0.5) part(this.head, new THREE.IcosahedronGeometry(0.09, 2), hairM, 0, 0.12, -0.24); // bun
      }

    }

    // Arms: shoulder -> upper arm -> elbow -> forearm with wide sleeve -> hand
    this.arms = [-1, 1].map((side) => {
      const shoulder = joint(this.upper, side * 0.33, 0.56, 0);
      const cap = kind === 'abbot' && side > 0;
      part(shoulder, new THREE.IcosahedronGeometry(cap ? 0.115 : 0.1, 2), cap ? kasaya : robe);
      part(shoulder, new THREE.CylinderGeometry(0.08, 0.07, 0.3, 14), robe, 0, -0.15, 0);
      const elbow = joint(shoulder, 0, -0.3, 0);
      part(elbow, new THREE.CylinderGeometry(0.075, chibi ? 0.085 : 0.15, 0.3, 14), robe, 0, -0.15, 0); // flared sleeve (plain cuff for uniforms)
      const hand = part(elbow, new THREE.BoxGeometry(0.09, 0.14, 0.05), skin, 0, -0.34, 0);
      return { side, shoulder, elbow, hand };
    });

    // Legs: hip -> thigh -> knee -> shin -> foot
    this.legs = [-1, 1].map((side) => {
      const hip = joint(this.hips, side * 0.14, 0, 0);
      part(hip, new THREE.CylinderGeometry(0.105, 0.08, 0.46, 14), robeDark, 0, -0.23, 0);
      const knee = joint(hip, 0, -0.46, 0);
      part(knee, new THREE.CylinderGeometry(0.078, 0.06, 0.42, 14), robeDark, 0, -0.21, 0);
      part(knee, new THREE.BoxGeometry(0.12, 0.06, 0.26), sandal, 0, -0.43, 0.06);
      return { side, hip, knee };
    });

    // Cartoon proportions: big head, smaller body, rosy cheeks, number tag or cap
    if (chibi) {
      this.skirt.visible = false;
      this.head.scale.setScalar(1.55);
      this.group.scale.setScalar(0.85);
      for (const s of [-1, 1]) part(this.head, new THREE.SphereGeometry(0.05, 10, 8), flat(0xf28b82), s * 0.15, -0.06, 0.19).scale.z = 0.3;
      if (kind === 'guard') {
        part(this.head, new THREE.CylinderGeometry(0.25, 0.27, 0.13, 20), flat(0x1f4f96), 0, 0.27, 0);
        part(this.head, new THREE.BoxGeometry(0.3, 0.02, 0.15), flat(0x12305e), 0, 0.2, 0.22);
        part(this.head, new THREE.SphereGeometry(0.028, 8, 6), flat(0xf2c22e), 0, 0.27, 0.26);
        part(this.upper, new THREE.BoxGeometry(0.09, 0.09, 0.02), flat(0xf2c22e), -0.13, 0.45, 0.27); // badge
      } else {
        const tag = part(this.upper, new THREE.BoxGeometry(0.15, 0.1, 0.012), numberTag(Math.floor(hue * 900) + 20), -0.1, 0.42, 0.275);
        tag.castShadow = false;
      }
    }

    // Props
    if (kind === 'sweeper' || animal) { // tre broom held in the right hand, bristles on the ground
      this.broom = joint(this.arms[1].elbow, 0, -0.34, 0);
      part(this.broom, new THREE.CylinderGeometry(0.022, 0.022, 1.6, 12), flat(0x7a5a30), 0, -0.45, 0);
      part(this.broom, new THREE.ConeGeometry(0.24, 0.6, 16), flat(0xc2a060), 0, -1.0, 0);
      this.broom.rotation.x = 1.25;
    }
    if (kind === 'abbot') { // wooden fish (mõ) on a small cushion, with a mallet in the right hand
      this.mo = joint(this.group, 0, 0, 0.5);
      part(this.mo, new THREE.CylinderGeometry(0.2, 0.24, 0.1, 18), flat(0xe3a73b), 0, 0.05, 0);
      const fish = part(this.mo, new THREE.SphereGeometry(0.2, 14,12), flat(0x9a3a1a), 0, 0.27, 0);
      fish.scale.set(1.1, 0.8, 0.9);
      part(this.mo, new THREE.BoxGeometry(0.12, 0.02, 0.02), dark, 0, 0.3, 0.17); // slit
      const mallet = joint(this.arms[1].hand, 0, -0.04, 0.02);
      part(mallet, new THREE.CylinderGeometry(0.018, 0.018, 0.28, 12), flat(0x7a5a30), 0, 0, 0.12).rotation.x = Math.PI / 2;
      part(mallet, new THREE.SphereGeometry(0.045, 10,10), flat(0x9a3a1a), 0, 0, 0.26);
    }

    this.sweeping = kind === 'sweeper' || animal;
    this.chanting = kind === 'abbot';
    this.onTap = null; // called each time the mallet strikes the wooden fish
    this.onPlant = null; // called when the offered incense is planted in the burner
    this.planted = false;
    this.pose = null; // prison activity pose, see applyPose()
    this.incenseProp = joint(this.upper, 0, 0.55, 0.47); // three sticks held between the palms during the offering
    for (const i of [-1, 0, 1]) {
      part(this.incenseProp, new THREE.CylinderGeometry(0.01, 0.01, 0.5, 6), flat(0xa83a22), i * 0.035, 0.22, 0).rotation.z = i * -0.06;
      part(this.incenseProp, new THREE.SphereGeometry(0.026, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff7a2a }), i * 0.035 + i * -0.015, 0.47, 0);
    }
    this.incenseProp.visible = false;
    this.nameSprite = label(name);
    if (chibi) this.nameSprite.material.depthTest = true; // residents' names are hidden by walls instead of showing through them
    this.group.add(this.nameSprite);
    this.action = null;
    this.t = 0;
    this.walk = 0;
    this.clock = 0;
    this.lastTap = -1;
    this.amp = 0; // walk-cycle strength, eased
    this.sit = 0; // 0 standing .. 1 kneeling, eased
    this.sitTarget = 0;
    this.pray = 0; // 0 arms at sides .. 1 palms together, eased
    this.seated = false;
    if (kind === 'abbot') { this.setSeated(true); this.sit = 1; }
  }

  setName(name) {
    this.group.remove(this.nameSprite);
    this.nameSprite.material.map.dispose();
    this.nameSprite = label(name);
    this.nameSprite.position.y = this.seated ? 1.75 : 2.5;
    this.group.add(this.nameSprite);
  }

  /** Shows a chat bubble above the head; it fades out and disappears after 15 seconds. A new message replaces the old one. */
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

  /** Kneeling on a cushion: thighs forward, shins folded back, hips drop to the heels. */
  setSeated(on) {
    this.seated = on;
    this.sitTarget = on ? 1 : 0;
    this.nameSprite.position.y = on ? 1.75 : 2.5;
  }

  /** Starts 'bow', 'greet' or 'incense'. Returns false if another action is still playing. */
  play(a) {
    if (this.action) return false;
    this.action = a;
    this.t = 0;
    this.planted = false;
    return true;
  }

  update(dt, moving) {
    const k = 1 - Math.exp(-dt * 10); // frame-rate independent easing
    if (this.bubble) {
      this.bubbleT -= dt;
      if (this.bubbleT <= 0) this.clearBubble();
      else {
        this.bubble.material.opacity = Math.min(1, this.bubbleT); // fade over the last second
        this.bubble.position.y = this.nameSprite.position.y + 0.32; // follows the name tag when kneeling
      }
    }
    this.clock += dt;
    this.sit += (this.sitTarget - this.sit) * k;
    this.amp += ((moving && !this.seated ? 1 : 0) - this.amp) * k;
    this.walk += moving ? dt * 10 : 0;
    const w = this.walk;

    let pitch = 0, praying = this.seated && !this.chanting; // palms together while kneeling
    if (this.action === 'incense') {
      // 0-0.8 raise the sticks, 0.8-2.6 three small bows (vái), 3.0 plant them in the burner, until 4.0 settle
      const t = (this.t += dt);
      praying = t < 3.0;
      if (t >= 0.8 && t < 2.6) pitch = 0.32 * Math.max(0, Math.sin(((t - 0.8) / 0.6) * Math.PI));
      else if (t >= 3.0) pitch = 0.22 * Math.sin(Math.min(1, (t - 3.0) / 1.0) * Math.PI);
      this.incenseProp.visible = t < 3.0;
      if (t >= 3.0 && !this.planted) { this.planted = true; this.onPlant?.(); }
      if (t >= 4.0) this.action = null;
    } else if (this.action) {
      this.t += dt;
      const bow = this.action === 'bow';
      const d = bow ? 2.2 : 1.4;
      const e = Math.sin(Math.min(this.t / d, 1) * Math.PI);
      pitch = Math.min(1, e * 2.2) * (bow ? 1.1 + 0.3 * this.sit : 0.35);
      praying = true;
      if (this.t >= d) this.action = null;
    } else this.incenseProp.visible = false;
    this.pray += ((praying ? 1 : 0) - this.pray) * k;

    // Torso and head
    this.upper.rotation.x = pitch;
    this.upper.rotation.y = 0;
    this.upper.rotation.z = this.amp * Math.sin(w) * 0.05;
    this.head.rotation.x = pitch * 0.25;
    this.head.rotation.y = 0;
    this.hips.position.y = lerp(HIP_Y + this.amp * Math.abs(Math.sin(w)) * 0.04, KNEEL_Y, this.sit);
    this.hips.position.z = lerp(0, -0.12, this.sit);
    this.skirt.scale.set(1, lerp(1, 0.55, this.sit), lerp(1, 1.25, this.sit));
    this.skirt.position.y = lerp(-0.26, -0.1, this.sit);

    // Legs: swing while walking, fold under the body when kneeling
    for (const { side, hip, knee } of this.legs) {
      const ph = w + (side > 0 ? Math.PI : 0);
      hip.rotation.x = lerp(Math.sin(ph) * 0.7 * this.amp, -1.5, this.sit);
      knee.rotation.x = lerp(Math.max(0, -Math.sin(ph + 0.6)) * 0.9 * this.amp, 2.9, this.sit);
      hip.rotation.z = side * 0.04 * (1 - this.sit);
    }

    // Arms: counter-swing while walking; blend to palms together (chắp tay)
    for (const { side, shoulder, elbow } of this.arms) {
      const ph = w + (side > 0 ? 0 : Math.PI);
      shoulder.rotation.x = lerp(Math.sin(ph) * 0.6 * this.amp, -0.65, this.pray);
      shoulder.rotation.z = lerp(side * 0.07, -side * 0.98, this.pray);
      elbow.rotation.x = lerp(-0.12 - Math.max(0, Math.sin(ph)) * 0.4 * this.amp, -1.75, this.pray);
      elbow.rotation.z = -side * 0.5 * this.pray; // forearms close in so the palms meet
    }

    if (this.action === 'incense' && this.t >= 3.0) { // right arm reaches out to plant the sticks
      const R = this.arms[1];
      R.shoulder.rotation.set(-1.15, 0, -0.1);
      R.elbow.rotation.set(-0.35, 0, 0);
    }
    if (this.sweeping && !this.action) this.poseSweep(moving);
    if (this.chanting && !this.action) this.poseChant();
    if (this.tail) this.tail.rotation.z = Math.sin(this.clock * (this.amp > 0.3 ? 8 : 3.5)) * (this.kind === 'dog' ? 0.5 : 0.35); // wag / sway
    this.mouth.scale.y = this.chanting ? 1 + 2.2 * Math.abs(Math.sin(this.clock * 7)) : 1;
    if (this.pose || this.chair || this.gest) this.applyPose();
  }

  /** Sitting on a chair at a table (meeting room): thighs forward, forearms resting on the table. */
  setChair(on) {
    this.chair = !!on;
    this.nameSprite.position.y = on ? 1.95 : 2.5;
  }

  /** Meeting gesture: 'hand' (raised until cleared), or a timed 'wave' | 'nod' | 'shake' | 'clap' | 'point'. */
  setGesture(g, seconds = 3) {
    this.gest = g || null;
    this.gestT = g === 'hand' ? Infinity : seconds;
    this.gestAt = this.clock;
  }

  /** Name of a prison activity pose, or null for normal behaviour. See applyPose(). */
  setPose(name) { this.pose = name || null; }

  /** Position in the basketball-shot cycle, 0..1: arms load at 0, ball leaves near 0.45, caught again at 0.86. */
  shotPhase() { return (this.clock % 2.2) / 2.2; }

  /** Overrides arms, legs and torso for scripted prison activities. Runs after the normal pose so it wins. */
  applyPose() {
    const c = this.clock, [L, R] = this.arms;
    if (this.gest && c - this.gestAt > this.gestT) this.gest = null;
    const arm = (a, sx, sz, ex, ez = 0) => { a.shoulder.rotation.set(sx, 0, sz); a.elbow.rotation.set(ex, 0, ez); };
    const talk = () => { this.mouth.scale.y = 1 + 2 * Math.abs(Math.sin(c * 9)); };
    const sit = (hipY) => { // thighs forward, shins straight down: on a bench, chair or toilet
      this.hips.position.y = hipY;
      this.hips.position.z = 0;
      for (const l of this.legs) { l.hip.rotation.set(-1.5, 0, l.side * 0.05); l.knee.rotation.set(1.5, 0, 0); }
    };
    if (this.chair && !this.pose) {
      sit(0.6);
      arm(L, -0.75, -0.08, -0.95); arm(R, -0.75, 0.08, -0.95);
      this.upper.rotation.x = 0.05;
    }
    if (this.gest) {
      const u = c - this.gestAt;
      if (this.gest === 'hand') { arm(R, -2.9, -0.1, -0.15); this.mouth.scale.y = 1; }
      else if (this.gest === 'wave') arm(R, -2.6, -0.2 - 0.3 * Math.sin(u * 9), -0.4 + 0.5 * Math.sin(u * 9));
      else if (this.gest === 'nod') this.head.rotation.x = 0.3 * Math.sin(u * 7);
      else if (this.gest === 'shake') this.head.rotation.y = 0.5 * Math.sin(u * 8);
      else if (this.gest === 'clap') { const k = Math.abs(Math.sin(u * 9)); for (const a of [L, R]) arm(a, -1.2, -a.side * (0.55 - 0.45 * k), -1.5); }
      else if (this.gest === 'point') arm(R, -1.6, 0.1, -0.1);
    }
    switch (this.pose) {
      case 'punch': { // boxing stance, fists trading blows
        for (const [a, ph] of [[R, 0], [L, Math.PI]]) {
          const k = Math.max(0, Math.sin(c * 6 + ph));
          arm(a, -0.9 - 0.7 * k, -a.side * 0.15, -1.7 + 1.5 * k);
        }
        this.upper.rotation.set(0.15, Math.sin(c * 6) * 0.3, 0);
        this.hips.position.y -= 0.08;
        this.legs[0].hip.rotation.set(0.25, 0, -0.14); this.legs[0].knee.rotation.x = 0.35;
        this.legs[1].hip.rotation.set(-0.3, 0, 0.14); this.legs[1].knee.rotation.x = 0.4;
        this.head.rotation.x = 0.1;
        talk();
        break;
      }
      case 'argue': // jabbing finger, other hand waving, head shaking
        arm(R, -1.35 + Math.sin(c * 7) * 0.2, -0.25, -0.3);
        arm(L, -0.6 + Math.sin(c * 5 + 1) * 0.3, -0.5, -1.2);
        this.upper.rotation.set(0.12, 0, 0);
        this.head.rotation.y = Math.sin(c * 6) * 0.3;
        talk();
        break;
      case 'stop': // guard: arm out, palm forward, shouting
        arm(R, -1.65, -0.1, -0.15);
        arm(L, 0, -0.3, -0.2);
        talk();
        break;
      case 'cheer': // arms up, alternating
        for (const a of [L, R]) arm(a, -2.5 + 0.4 * Math.sin(c * 7 + (a.side > 0 ? 0 : Math.PI)), a.side * 0.3, -0.25);
        talk();
        break;
      case 'sulk': // head and shoulders down
        this.upper.rotation.x = 0.28;
        this.head.rotation.x = 0.45;
        break;
      case 'sitChair':
        sit(0.6);
        arm(L, -0.6, -0.05, -0.9); arm(R, -0.6, 0.05, -0.9);
        break;
      case 'toilet':
        sit(0.5);
        this.upper.rotation.x = 0.25;
        this.head.rotation.x = 0.3;
        arm(L, -0.9, 0, -0.7); arm(R, -0.9, 0, -0.7);
        break;
      case 'eat': { // spoon to mouth
        sit(0.6);
        const k = (1 + Math.sin(c * 3)) / 2;
        arm(L, -0.6, -0.05, -0.9);
        arm(R, -0.9, -0.1, -1.0 - 1.3 * k);
        this.head.rotation.x = 0.1 * k;
        this.mouth.scale.y = 1 + 0.8 * Math.abs(Math.sin(c * 6));
        break;
      }
      case 'sleep': // lying down: the caller rotates the whole body
        for (const a of [L, R]) arm(a, 0, a.side * 0.12, -0.2);
        break;
      case 'jack': { // jumping jacks
        const u = (1 + Math.sin(c * 7)) / 2;
        for (const a of [L, R]) arm(a, 0, a.side * (0.15 + 2.75 * u), -0.05);
        for (const l of this.legs) l.hip.rotation.z = l.side * 0.35 * u;
        this.hips.position.y += 0.14 * u;
        break;
      }
      case 'shoot': { // basketball jump shot
        const ph = this.shotPhase();
        const lift = ph < 0.35 ? 0 : ph < 0.5 ? (ph - 0.35) / 0.15 : ph < 0.86 ? 1 : Math.max(0, 1 - (ph - 0.86) / 0.14);
        for (const a of [L, R]) arm(a, THREE.MathUtils.lerp(-0.9, -2.75, lift), -a.side * 0.12, THREE.MathUtils.lerp(-1.9, -0.2, lift));
        const knee = ph < 0.35 ? 0.5 * (ph / 0.35) : ph < 0.5 ? 0.5 * (1 - (ph - 0.35) / 0.15) : 0;
        for (const l of this.legs) { l.knee.rotation.x = knee; l.hip.rotation.x = -knee * 0.5; }
        this.hips.position.y -= knee * 0.25;
        break;
      }
    }
  }

  /** Both hands on the broom, sweeping side to side while walking. */
  poseSweep(moving) {
    const sw = Math.sin(this.clock * 2.4);
    const a = moving ? 1 : 0.3;
    const [L, R] = this.arms; // right hand on the broom; left arm swings free for balance
    R.shoulder.rotation.set(-0.9 + 0.2 * sw * a, 0, -0.12);
    R.elbow.rotation.set(-0.55, 0, -0.1);
    L.shoulder.rotation.set(0.3 * sw * a, 0, 0.12);
    L.elbow.rotation.set(-0.3, 0, 0);
    this.upper.rotation.x = 0.2;
    this.upper.rotation.y = 0.28 * sw * a;
  }

  /** Kneeling: left hand counts prayer beads at the chest, right hand taps the wooden fish once a beat. */
  poseChant() {
    const beat = this.clock * 1.1; // beats per second
    const down = Math.pow(0.5 * (1 + Math.cos(beat * Math.PI * 2)), 3); // 1 at the strike
    const L = this.arms[0], R = this.arms[1];
    L.shoulder.rotation.x = -0.7; L.shoulder.rotation.z = 0.45;
    L.elbow.rotation.x = -1.6; L.elbow.rotation.z = 0.35;
    R.shoulder.rotation.x = -0.5; R.shoulder.rotation.z = -0.6;
    R.elbow.rotation.x = lerp(-0.75, -0.3, down);
    R.elbow.rotation.z = 0;
    this.upper.rotation.x = 0.22 + 0.04 * down; // lean toward the fish
    this.head.rotation.x = 0.05 * down;
    const idx = Math.floor(beat);
    if (idx !== this.lastTap) {
      this.lastTap = idx;
      if (idx > 0) this.onTap?.();
    }
  }
}
