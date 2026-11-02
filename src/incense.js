import * as THREE from 'three';

// Incense sticks planted in the burners, each trailing a thread of smoke that rises, widens and fades.
// Smoke is one Points object per burner (ring-buffer pool updated on the CPU, soft discs drawn in a shader).

export const STICK_LIFE = 90; // seconds a lit stick burns before it is gone
const STICK_LEN = 0.7;
const POOL = 1500;
const EMIT_RATE = 5; // smoke puffs per second per stick
const SMOKE_LIFE = [4, 7]; // seconds

const stickMat = new THREE.MeshStandardMaterial({ color: 0xa83a22, roughness: 1 });
const emberMat = new THREE.MeshBasicMaterial({ color: 0xff7a2a });
const stickGeo = new THREE.CylinderGeometry(0.011, 0.014, STICK_LEN, 6).translate(0, STICK_LEN / 2, 0);
const emberGeo = new THREE.SphereGeometry(0.03, 8, 6);

const smokeMat = () => new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  uniforms: { uPx: { value: 600 }, uColor: { value: new THREE.Color(0xeeeae0) } },
  vertexShader: `
    attribute float aSize; attribute float aAlpha; varying float vAlpha; uniform float uPx;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = aSize * uPx / -mv.z;
      vAlpha = aAlpha;
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: `
    varying float vAlpha; uniform vec3 uColor;
    void main() {
      float d = length(gl_PointCoord - 0.5) * 2.0;
      float a = smoothstep(1.0, 0.0, d);
      gl_FragColor = vec4(uColor, a * a * vAlpha);
      #include <colorspace_fragment>
    }`,
});

class Burner {
  constructor(scene, spec) {
    this.spec = spec; // { x, y, z, spread }: y is the ash surface the sticks stand in
    this.sticks = [];
    this.group = new THREE.Group();
    scene.add(this.group);

    this.pos = new Float32Array(POOL * 3);
    this.size = new Float32Array(POOL);
    this.alpha = new Float32Array(POOL);
    this.age = new Float32Array(POOL).fill(1e9);
    this.life = new Float32Array(POOL).fill(1);
    this.vel = new Float32Array(POOL * 3);
    this.seed = new Float32Array(POOL);
    this.head = 0;

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    this.points = new THREE.Points(g, smokeMat());
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
  }

  addStick(ageSec, permanent) {
    const { x, y, z, spread } = this.spec;
    const grp = new THREE.Group();
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spread;
    grp.position.set(x + Math.cos(a) * r, y, z + Math.sin(a) * r);
    grp.rotation.set((Math.random() - 0.5) * 0.35, 0, (Math.random() - 0.5) * 0.35);
    const body = new THREE.Mesh(stickGeo, stickMat);
    const ember = new THREE.Mesh(emberGeo, emberMat);
    grp.add(body, ember);
    this.group.add(grp);
    const stick = {
      grp, body, ember, permanent,
      born: performance.now() / 1000 - ageSec,
      dir: new THREE.Vector3(0, 1, 0).applyEuler(grp.rotation),
      emit: Math.random(),
    };
    this.sticks.push(stick);
    return stick;
  }

  spawn(tip) {
    const i = this.head;
    this.head = (this.head + 1) % POOL;
    this.pos.set([tip.x + (Math.random() - 0.5) * 0.02, tip.y, tip.z + (Math.random() - 0.5) * 0.02], i * 3);
    this.vel.set([(Math.random() - 0.5) * 0.06, 0.32 + Math.random() * 0.18, (Math.random() - 0.5) * 0.06], i * 3);
    this.age[i] = 0;
    this.life[i] = SMOKE_LIFE[0] + Math.random() * (SMOKE_LIFE[1] - SMOKE_LIFE[0]);
    this.seed[i] = Math.random() * 6.28;
  }

  update(dt, now) {
    for (let k = this.sticks.length - 1; k >= 0; k--) {
      const s = this.sticks[k];
      const age = now - s.born;
      if (!s.permanent && age > STICK_LIFE) {
        this.group.remove(s.grp);
        this.sticks.splice(k, 1);
        continue;
      }
      const burn = s.permanent ? 0.3 : Math.min(1, age / STICK_LIFE); // stick shortens as it burns
      const len = 1 - 0.65 * burn;
      s.body.scale.y = len;
      s.ember.position.set(0, STICK_LEN * len, 0);
      s.ember.scale.setScalar(0.85 + 0.3 * Math.random()); // flicker
      s.emit += dt * EMIT_RATE;
      if (s.emit >= 1) {
        s.emit -= 1;
        const tip = s.grp.position.clone().addScaledVector(s.dir, STICK_LEN * len);
        this.spawn(tip);
      }
    }

    for (let i = 0; i < POOL; i++) {
      const age = (this.age[i] += dt);
      const a = age / this.life[i];
      if (a >= 1) { this.alpha[i] = 0; this.size[i] = 0; continue; }
      const p = i * 3;
      const sway = Math.sin(age * 1.6 + this.seed[i]) * 0.07 * (0.4 + a); // meanders more as it climbs
      this.pos[p] += (this.vel[p] + sway + 0.05) * dt; // faint steady breeze along +x
      this.pos[p + 1] += this.vel[p + 1] * (1 - 0.5 * a) * dt;
      this.pos[p + 2] += (this.vel[p + 2] + Math.cos(age * 1.3 + this.seed[i]) * 0.05 * (0.4 + a)) * dt;
      this.size[i] = 0.1 + 0.6 * Math.pow(a, 0.7);
      this.alpha[i] = 0.32 * Math.min(1, a * 8) * Math.pow(1 - a, 1.4);
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = g.attributes.aSize.needsUpdate = g.attributes.aAlpha.needsUpdate = true;
  }
}

export class Incense {
  /** burners: [{ x, y, z, spread }] */
  constructor(scene, burners) {
    this.burners = burners.map((b) => new Burner(scene, b));
  }

  /** Plants a stick. ageSec > 0 for sticks that were already burning when the player joined. */
  addStick(burner, ageSec = 0, permanent = false) {
    this.burners[burner]?.addStick(ageSec, permanent);
  }

  update(dt) {
    const now = performance.now() / 1000;
    for (const b of this.burners) b.update(dt, now);
  }

  /** Call on resize: converts world-size smoke puffs to pixel sizes. */
  setViewport(heightPx, fovDeg) {
    const px = heightPx / (2 * Math.tan((fovDeg * Math.PI) / 360));
    for (const b of this.burners) b.points.material.uniforms.uPx.value = px;
  }

  /** Index of the burner within `reach` of (x, z), nearest first, or -1. */
  nearest(x, z, reach) {
    let best = -1, bd = reach;
    this.burners.forEach((b, i) => {
      const d = Math.hypot(b.spec.x - x, b.spec.z - z);
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }

  spec(i) { return this.burners[i].spec; }
}
