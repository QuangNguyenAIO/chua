import { OBSTACLES, BOUNDS } from './world.js';

// Grid A* over the obstacle map so click-to-move walks around ponds, walls and buildings.
const CELL = 0.5;
const N = Math.round((BOUNDS * 2) / CELL);
const R = 0.55; // avatar radius plus a little margin
const blocked = new Uint8Array(N * N);

const toCell = (v) => Math.min(N - 1, Math.max(0, Math.floor((v + BOUNDS) / CELL)));
const toWorld = (i) => -BOUNDS + (i + 0.5) * CELL;

function hits(x, z) {
  for (const o of OBSTACLES) {
    if (o.r !== undefined) { if (Math.hypot(x - o.x, z - o.z) < o.r + R) return true; }
    else if (x > o.x0 - R && x < o.x1 + R && z > o.z0 - R && z < o.z1 + R) return true;
  }
  return false;
}

let built = false;
function build() {
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) blocked[j * N + i] = hits(toWorld(i), toWorld(j)) ? 1 : 0;
  built = true;
}

function nearestFree(i, j) {
  if (!blocked[j * N + i]) return [i, j];
  for (let r = 1; r < 24; r++) {
    let best = null, bd = Infinity;
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
      const a = i + di, b = j + dj;
      if (a < 0 || b < 0 || a >= N || b >= N || blocked[b * N + a]) continue;
      const d = di * di + dj * dj;
      if (d < bd) { bd = d; best = [a, b]; }
    }
    if (best) return best;
  }
  return null;
}

function lineClear(ax, az, bx, bz) {
  const n = Math.ceil(Math.hypot(bx - ax, bz - az) / (CELL * 0.5));
  for (let k = 1; k < n; k++) {
    const t = k / n;
    if (blocked[toCell(az + (bz - az) * t) * N + toCell(ax + (bx - ax) * t)]) return false;
  }
  return true;
}

/** Returns waypoints [{x, z}] from (sx, sz) to (tx, tz), or [] when no route exists. */
export function findPath(sx, sz, tx, tz) {
  if (!built) build();
  const s = nearestFree(toCell(sx), toCell(sz));
  const t = nearestFree(toCell(tx), toCell(tz));
  if (!s || !t) return [];
  const goal = t[1] * N + t[0], start = s[1] * N + s[0];

  const g = new Float32Array(N * N).fill(Infinity);
  const from = new Int32Array(N * N).fill(-1);
  const closed = new Uint8Array(N * N);
  const heap = [[0, start]];
  g[start] = 0;
  const h = (k) => Math.hypot((k % N) - t[0], Math.floor(k / N) - t[1]);
  const push = (e) => { heap.push(e); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; } };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let c = 0;
      for (;;) {
        const l = 2 * c + 1, r = l + 1;
        let m = c;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === c) break;
        [heap[m], heap[c]] = [heap[c], heap[m]];
        c = m;
      }
    }
    return top;
  };

  while (heap.length) {
    const [, cur] = pop();
    if (closed[cur]) continue;
    closed[cur] = 1;
    if (cur === goal) break;
    const ci = cur % N, cj = (cur - ci) / N;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const a = ci + di, b = cj + dj;
      if (a < 0 || b < 0 || a >= N || b >= N || blocked[b * N + a]) continue;
      if (di && dj && (blocked[cj * N + a] || blocked[b * N + ci])) continue; // no corner cutting
      const nk = b * N + a, ng = g[cur] + (di && dj ? 1.414 : 1);
      if (ng < g[nk]) { g[nk] = ng; from[nk] = cur; push([ng + h(nk), nk]); }
    }
  }
  if (from[goal] < 0 && goal !== start) return [];

  const cells = [];
  for (let k = goal; k !== -1; k = from[k]) cells.push({ x: toWorld(k % N), z: toWorld(Math.floor(k / N)) });
  cells.reverse();

  // String-pulling: skip waypoints that have a clear straight line to a later one.
  const out = [];
  let a = { x: sx, z: sz }, i = 0;
  while (i < cells.length) {
    let far = i;
    for (let k = cells.length - 1; k > i; k--) if (lineClear(a.x, a.z, cells[k].x, cells[k].z)) { far = k; break; }
    out.push(cells[far]);
    a = cells[far];
    i = far + 1;
  }
  const exact = !blocked[toCell(tz) * N + toCell(tx)];
  if (exact) out[out.length - 1] = { x: tx, z: tz };
  return out;
}
