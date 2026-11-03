import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Collects many small solids per material key and merges them into one mesh per key,
 * so a detailed object costs a handful of draw calls instead of hundreds.
 */
export class Parts {
  constructor(mats) {
    this.mats = mats; // key -> material
    this.by = {};
  }

  /** Adds a solid under a material key with position `p`, Euler rotation `r` (or quaternion `q`) and scale `s`. */
  add(key, geo, { p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1], q } = {}) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const n of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(n)) g.deleteAttribute(n);
    const quat = q || new THREE.Quaternion().setFromEuler(new THREE.Euler(...r));
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...p), quat, new THREE.Vector3(...s)));
    (this.by[key] ||= []).push(g);
  }

  /** A tapered cylinder spanning points a -> b (arms, staffs, strings). */
  limb(key, a, b, r0, r1 = r0, seg = 6) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
    const d = B.clone().sub(A);
    this.add(key, new THREE.CylinderGeometry(r1, r0, d.length(), seg), {
      p: A.clone().add(B).multiplyScalar(0.5).toArray(),
      q: new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()),
    });
  }

  build({ castShadow = true, receiveShadow = false } = {}) {
    const grp = new THREE.Group();
    for (const [key, list] of Object.entries(this.by)) {
      const m = new THREE.Mesh(mergeGeometries(list), this.mats[key]);
      m.castShadow = castShadow;
      m.receiveShadow = receiveShadow;
      grp.add(m);
    }
    return grp;
  }
}
