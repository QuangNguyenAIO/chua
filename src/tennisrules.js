// Shared by the browser (src/tennis*.js) and the Node server (tennis.js): court geometry, stroke table, ballistics and scoring.
// No DOM or three.js in here. All court coordinates are "local": origin at the net centre, x across the court, z along it.
// Side 0 ("A") defends z > 0 and side 1 ("B") defends z < 0. Seen from behind its own baseline, a side's right hand is +x for A and -x for B.

/** The "Te Nít" (tennis) court east of the road to the meeting room. Walking inside the fence shows the match. */
export const TEN = { cx: 60, cz: 50, hw: 15, hd: 22 };
export const inTennis = (x, z) => Math.abs(x - TEN.cx) < TEN.hw && Math.abs(z - TEN.cz) < TEN.hd;

export const C = {
  halfW: 4.115, // singles sideline
  alley: 5.485, // doubles sideline (drawn, not used for singles)
  halfL: 11.885, // baseline
  svc: 6.4, // service line
  netH: 0.914,
  g: 9.8,
  R: 0.1, // ball radius (a little oversized so it can be seen)
  reach: 2.7, // how far from the player the ball may be when swinging
  fenceX: 12, fenceZ: 19, // fence half sizes
};

export const sideSign = (s) => (s === 0 ? 1 : -1);

/** Stroke table. `v` = ball speed (m/s) toward the target, `err` = aim error (m), depth = [near, far] target distance beyond the net. */
export const KINDS = {
  f: { name: 'Forehand', v: 19, err: 0.85, depth: [3.5, 10.9] },
  b: { name: 'Backhand', v: 17, err: 1.05, depth: [3.5, 10.7] },
  v: { name: 'Volley', v: 16, err: 0.8, depth: [4.5, 10.5] },
  s: { name: 'Smash', v: 30, err: 1.2, depth: [3, 10.8], minY: 1.9 },
  l: { name: 'Lob', T: 1.95, err: 1.0, depth: [8.5, 11.5] },
  d: { name: 'Drop shot', v: 8, err: 0.6, depth: [1.4, 3.2] },
};

export const FORMATS = {
  short: { games: 4, tbAt: 3, tbTo: 5, label: 'Set rút gọn (4 game)' },
  full: { games: 6, tbAt: 6, tbTo: 7, label: 'Set tiêu chuẩn (6 game)' },
};

// ---------- ballistics ----------

/** Advances the ball by dt without bounces. */
export function flyStep(b, dt) {
  b.vy -= C.g * dt;
  b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
}

/**
 * Velocity that takes a ball from (x, y, z) to the ground point (tx, tz). `T` is the flight time; if the straight path would clip
 * the net, the flight time is stretched (a higher arc) until it clears it.
 */
export function launch(x, y, z, tx, tz, T, sloppy = false) {
  let vx, vy, vz;
  for (let i = 0; i < 16; i++, T += 0.05) {
    vx = (tx - x) / T; vz = (tz - z) / T;
    vy = (C.R - y + 0.5 * C.g * T * T) / T;
    if (sloppy) break; // a stretched shot does not get the extra arc
    const tn = -z / vz; // time at which the ball is over the net
    if (!(tn > 0 && tn < T)) break; // starts and lands on the same side: no net to clear
    if (y + vy * tn - 0.5 * C.g * tn * tn > C.netH + 0.25) break;
  }
  return { vx, vy, vz };
}

// Cheap gaussian-ish noise in [-1, 1]
export const noise = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;

/**
 * Resolves a swing: where does the ball go? Returns velocity plus the aimed point.
 * `q` in 0..1 is how stretched the player was (0 = perfect contact). `ax` in -1..1 is left-right aim in world x, `ad` 0..1 depth.
 */
export function strokeVelocity(ball, side, kind, ax, ad, q, errMul = 1) {
  const K = KINDS[kind] || KINDS.f;
  const opp = -sideSign(side); // z sign of the opponent's half
  const depth = K.depth[0] + (K.depth[1] - K.depth[0]) * Math.min(1, Math.max(0, ad));
  const sd = K.err * (0.5 + q * 1.3) * errMul;
  const tx = Math.max(-5.6, Math.min(5.6, ax * (C.halfW - 0.15) + noise() * sd));
  const tz = opp * Math.max(0.8, depth + noise() * sd * 1.6);
  const dist = Math.hypot(tx - ball.x, tz - ball.z);
  let T = K.T || dist / K.v;
  if (kind === 's' && ball.y < K.minY) T = dist / (K.v * 0.55); // a smash from too low is weak
  T = Math.max(0.28, T);
  const sloppy = q > 0.7 && Math.random() < (q - 0.7) * 1.8; // reaching for the ball: may clip the net
  return { ...launch(ball.x, ball.y, ball.z, tx, tz, T, sloppy), tx, tz };
}

// ---------- scoring ----------

export function newScore(fmt = 'short') {
  return { fmt: FORMATS[fmt] ? fmt : 'short', pts: [0, 0], games: [0, 0], tb: false, tbFirst: 0, server: 0, over: false, winner: -1 };
}

/** Who serves the next point. */
export function serverOf(s) {
  if (!s.tb) return s.server;
  const n = s.pts[0] + s.pts[1];
  return ((n + 1) >> 1) % 2 ? 1 - s.tbFirst : s.tbFirst;
}
/** 0 = deuce court (serve from the right), 1 = ad court. */
export const serveCourt = (s) => (s.pts[0] + s.pts[1]) % 2;

/** Adds a point for side `w`. Returns 'point' | 'game' | 'set'. */
export function addPoint(s, w) {
  const l = 1 - w, F = FORMATS[s.fmt];
  s.pts[w]++;
  const won = s.tb ? s.pts[w] >= F.tbTo && s.pts[w] - s.pts[l] >= 2 : s.pts[w] >= 4 && s.pts[w] - s.pts[l] >= 2;
  if (!won) return 'point';
  const wasTb = s.tb;
  s.games[w]++;
  s.pts = [0, 0]; s.tb = false;
  if (!wasTb) s.server = 1 - s.server; // serve passes to the other player after every game
  if (wasTb) { s.over = true; s.winner = w; return 'set'; }
  if (s.games[w] >= F.games && s.games[w] - s.games[l] >= 2) { s.over = true; s.winner = w; return 'set'; }
  if (s.games[0] === F.tbAt && s.games[1] === F.tbAt) { s.tb = true; s.tbFirst = s.server; }
  return 'game';
}

const PT = ['0', '15', '30', '40'];
/** Display strings for the two sides, e.g. ['40', 'Ad'] or ['5', '4'] in a tie-break. */
export function pointLabels(s) {
  if (s.tb) return [String(s.pts[0]), String(s.pts[1])];
  const [a, b] = s.pts;
  if (a >= 3 && b >= 3) return a === b ? ['40', '40'] : a > b ? ['Ad', '40'] : ['40', 'Ad'];
  return [PT[Math.min(a, 3)], PT[Math.min(b, 3)]];
}

/** Where a server stands and which box the serve must land in (local coords), for side `side` and court 0/1. */
export function serveSetup(side, court) {
  const right = side === 0 ? 1 : -1; // world x of the server's right hand
  const sx = court === 0 ? right : -right;
  return {
    x: sx * 2.2, z: sideSign(side) * (C.halfL + 0.8),
    box: { x0: sx > 0 ? -C.halfW : 0, x1: sx > 0 ? 0 : C.halfW, zSign: -sideSign(side) }, // target box on the far side; |z| <= svc
  };
}
export const inBox = (box, x, z) => x >= box.x0 - C.R && x <= box.x1 + C.R && z * box.zSign > -C.R && Math.abs(z) <= C.svc + C.R;
export const inCourt = (zSign, x, z) => Math.abs(x) <= C.halfW + C.R && Math.abs(z) <= C.halfL + C.R && z * zSign > -C.R;
